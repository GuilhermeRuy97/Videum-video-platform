import { DataSource, Repository } from 'typeorm';
import { RefreshToken } from '../../auth/entities/refresh-token.entity';
import { VerificationToken } from '../../auth/entities/verification-token.entity';
import { Channel } from '../../channels/entities/channel.entity';
import {
  cleanAllTables,
  createTestDataSource,
} from '../../test/create-test-data-source';
import { User } from '../../users/entities/user.entity';
import { Video } from './video.entity';

const ALL_ENTITIES = [User, Channel, RefreshToken, VerificationToken, Video];

const UUID_V7 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe('Video entity (integration)', () => {
  let dataSource: DataSource;
  let userRepository: Repository<User>;
  let videoRepository: Repository<Video>;

  beforeAll(async () => {
    dataSource = createTestDataSource(ALL_ENTITIES);
    await dataSource.initialize();
    userRepository = dataSource.getRepository(User);
    videoRepository = dataSource.getRepository(Video);
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  beforeEach(async () => {
    await cleanAllTables(dataSource);
  });

  let counter = 0;
  async function createUser(): Promise<User> {
    return userRepository.save(
      userRepository.create({
        email: `vid_user_${++counter}@example.com`,
        password: 'hashed',
      }),
    );
  }

  function buildVideo(owner: User, overrides: Partial<Video> = {}): Video {
    return videoRepository.create({
      owner_id: owner.id,
      title: 'My Video',
      original_filename: 'clip.mp4',
      storage_key: `videos/${owner.id}/${Date.now()}-${Math.random()}`,
      size_bytes: 1024,
      content_type: 'video/mp4',
      ...overrides,
    });
  }

  it('should generate a UUID v7 public_id on insert and default status to uploading', async () => {
    const user = await createUser();
    const saved = await videoRepository.save(buildVideo(user));

    expect(saved.public_id).toMatch(UUID_V7);
    expect(saved.public_id).not.toBe(saved.id);

    const found = await videoRepository.findOneByOrFail({ id: saved.id });
    expect(found.status).toBe('uploading');
    expect(found.created_at).toBeInstanceOf(Date);
    expect(found.updated_at).toBeInstanceOf(Date);
  });

  it('should enforce unique public_id', async () => {
    const user = await createUser();
    const first = await videoRepository.save(buildVideo(user));

    await expect(
      videoRepository.save(buildVideo(user, { public_id: first.public_id })),
    ).rejects.toThrow();
  });

  it('should enforce unique storage_key', async () => {
    const user = await createUser();
    const first = await videoRepository.save(buildVideo(user));

    await expect(
      videoRepository.save(
        buildVideo(user, { storage_key: first.storage_key }),
      ),
    ).rejects.toThrow();
  });

  it('should allow nullable upload_id, duration_seconds and thumbnail_key', async () => {
    const user = await createUser();
    const saved = await videoRepository.save(buildVideo(user));

    const found = await videoRepository.findOneByOrFail({ id: saved.id });
    expect(found.upload_id).toBeNull();
    expect(found.duration_seconds).toBeNull();
    expect(found.thumbnail_key).toBeNull();
  });

  it('should persist and read back size_bytes as a number beyond the int4 range', async () => {
    const user = await createUser();
    const bigSize = 8_000_000_000; // 8 GB — exceeds int4, requires bigint

    const saved = await videoRepository.save(
      buildVideo(user, { size_bytes: bigSize }),
    );
    const found = await videoRepository.findOneByOrFail({ id: saved.id });

    expect(typeof found.size_bytes).toBe('number');
    expect(found.size_bytes).toBe(bigSize);
  });

  it('should reject a video whose owner_id does not reference a user', async () => {
    const orphan = buildVideo({
      id: '00000000-0000-0000-0000-000000000000',
    } as User);

    await expect(videoRepository.save(orphan)).rejects.toThrow();
  });

  it('should accept every VideoStatus enum value', async () => {
    const user = await createUser();

    for (const status of [
      'uploading',
      'processing',
      'ready',
      'failed',
    ] as const) {
      const saved = await videoRepository.save(buildVideo(user, { status }));
      expect(saved.status).toBe(status);
    }
  });
});
