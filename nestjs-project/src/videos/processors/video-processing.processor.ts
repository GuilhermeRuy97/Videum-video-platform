import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Job } from 'bullmq';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { Repository } from 'typeorm';
import { StorageService } from '../../storage/storage.service';
import { Video } from '../entities/video.entity';
import type { ProcessVideoJobData } from '../videos.constants';
import { VIDEO_PROCESSING_QUEUE } from '../videos.constants';

const execFileAsync = promisify(execFile);

/**
 * Consumes `process-video` jobs on a separate worker container (per
 * phase-03-upload-processing/TD-02): downloads the source, extracts duration and
 * a thumbnail via raw FFprobe/FFmpeg (per phase-03-upload-processing/TD-03), then
 * transitions the video `processing → ready` (or `failed`).
 */
@Processor(VIDEO_PROCESSING_QUEUE)
export class VideoProcessingProcessor extends WorkerHost {
  private readonly logger = new Logger(VideoProcessingProcessor.name);

  constructor(
    private readonly storageService: StorageService,
    @InjectRepository(Video)
    private readonly videoRepository: Repository<Video>,
  ) {
    super();
  }

  async process(job: Job<ProcessVideoJobData>): Promise<void> {
    const { video_id, storage_key } = job.data;

    const video = await this.videoRepository.findOne({
      where: { id: video_id },
    });
    if (!video) {
      this.logger.warn(`Video ${video_id} not found; skipping job.`);
      return;
    }
    // Idempotent: re-running the job for an already-processed video is a no-op.
    if (video.status === 'ready') {
      this.logger.log(`Video ${video_id} already processed; skipping.`);
      return;
    }

    const workDir = await mkdtemp(join(tmpdir(), 'video-processing-'));
    const inputPath = join(workDir, 'input');
    const thumbnailPath = join(workDir, 'thumbnail.jpg');

    try {
      await this.storageService.downloadToFile(storage_key, inputPath);

      const durationSeconds = await this.probeDuration(inputPath);
      await this.extractThumbnail(inputPath, thumbnailPath, durationSeconds);

      const thumbnailKey = this.thumbnailKeyFor(storage_key);
      await this.storageService.putObject(
        thumbnailKey,
        await readFile(thumbnailPath),
        'image/jpeg',
      );

      await this.videoRepository.update(
        { id: video_id },
        {
          duration_seconds: Math.round(durationSeconds),
          thumbnail_key: thumbnailKey,
          status: 'ready',
        },
      );
      this.logger.log(
        `Processed video ${video_id} (duration ${Math.round(durationSeconds)}s).`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to process video ${video_id}: ${(error as Error).message}`,
      );
      await this.videoRepository.update({ id: video_id }, { status: 'failed' });
      throw error;
    } finally {
      await rm(workDir, { recursive: true, force: true });
    }
  }

  private thumbnailKeyFor(storageKey: string): string {
    const dir = storageKey.substring(0, storageKey.lastIndexOf('/'));
    return `${dir}/thumbnail.jpg`;
  }

  private async probeDuration(inputPath: string): Promise<number> {
    const { stdout } = await execFileAsync('ffprobe', [
      '-v',
      'error',
      '-show_entries',
      'format=duration',
      '-of',
      'default=noprint_wrappers=1:nokey=1',
      inputPath,
    ]);
    const duration = parseFloat(stdout.trim());
    return Number.isFinite(duration) ? duration : 0;
  }

  private async extractThumbnail(
    inputPath: string,
    outputPath: string,
    durationSeconds: number,
  ): Promise<void> {
    const seek = durationSeconds > 2 ? 1 : 0;
    await execFileAsync('ffmpeg', [
      '-y',
      '-ss',
      String(seek),
      '-i',
      inputPath,
      '-frames:v',
      '1',
      '-q:v',
      '2',
      outputPath,
    ]);
  }
}
