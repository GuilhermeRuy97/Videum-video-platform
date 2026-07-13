import type { ConfigType } from '@nestjs/config';
import storageConfig from '../config/storage.config';
import { StorageService, type CompletedPart } from './storage.service';

// Inside the Docker network the test can only reach MinIO at the internal host,
// so both endpoints point there — presigned URLs signed against it are fetchable
// from the test process (in production `publicEndpoint` is the browser host).
const TEST_CONFIG = {
  endpoint: process.env.STORAGE_ENDPOINT ?? 'http://minio:9000',
  publicEndpoint: process.env.STORAGE_ENDPOINT ?? 'http://minio:9000',
  region: process.env.STORAGE_REGION ?? 'us-east-1',
  accessKeyId: process.env.STORAGE_ACCESS_KEY ?? 'minioadmin',
  secretAccessKey: process.env.STORAGE_SECRET_KEY ?? 'minioadmin',
  bucket: 'videos-it',
  partSizeBytes: 5 * 1024 * 1024,
  presignExpirySeconds: 3600,
} satisfies ConfigType<typeof storageConfig>;

describe('StorageService (integration)', () => {
  let storage: StorageService;

  beforeAll(async () => {
    storage = new StorageService(TEST_CONFIG);
    await storage.ensureBucket();
  });

  async function uploadObject(key: string, body: Buffer): Promise<void> {
    const { upload_id, parts } = await storage.initiateMultipartUpload(
      key,
      'video/mp4',
      body.length,
    );
    const completed: CompletedPart[] = [];
    for (const part of parts) {
      // Node's Buffer is not assignable to fetch's BodyInit under @types/node 22;
      // a plain Uint8Array view is (Buffer already is one — this is a zero-copy cast).
      const res = await fetch(part.url, {
        method: 'PUT',
        body: new Uint8Array(body),
      });
      if (!res.ok) {
        throw new Error(`part upload failed with status ${res.status}`);
      }
      const etag = res.headers.get('etag');
      if (!etag) {
        throw new Error('storage did not return an ETag for the uploaded part');
      }
      completed.push({ part_number: part.part_number, etag });
    }
    await storage.completeMultipartUpload(key, upload_id, completed);
  }

  it('initiates, uploads and completes a multipart upload; headObject reflects the stored size', async () => {
    const key = `videos-it/roundtrip-${Date.now()}`;
    const body = Buffer.from('hello minio integration test '.repeat(100));

    await uploadObject(key, body);

    const head = await storage.headObject(key);
    expect(head).not.toBeNull();
    expect(head?.size).toBe(body.length);
  });

  it('headObject returns null for a missing object', async () => {
    const head = await storage.headObject(
      `videos-it/missing-${Date.now()}-${Math.random()}`,
    );
    expect(head).toBeNull();
  });

  it('presigned GET URL serves bytes and honors a Range request', async () => {
    const key = `videos-it/range-${Date.now()}`;
    const body = Buffer.from('0123456789ABCDEF'.repeat(50));
    await uploadObject(key, body);

    const url = await storage.getPresignedGetUrl(key);
    const res = await fetch(url, { headers: { Range: 'bytes=0-3' } });

    expect(res.status).toBe(206);
    const chunk = Buffer.from(await res.arrayBuffer());
    expect(chunk.toString()).toBe('0123');
  });

  it('presigned download URL carries an attachment content-disposition', async () => {
    const key = `videos-it/download-${Date.now()}`;
    const url = await storage.getPresignedGetUrl(key, {
      downloadFilename: 'my video.mp4',
    });

    expect(decodeURIComponent(url)).toContain(
      'response-content-disposition=attachment',
    );
  });
});
