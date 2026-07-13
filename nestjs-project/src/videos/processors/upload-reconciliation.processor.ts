import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Queue } from 'bullmq';
import { LessThan, Repository } from 'typeorm';
import queueConfig from '../../config/queue.config';
import { StorageService } from '../../storage/storage.service';
import { Video } from '../entities/video.entity';
import type { ProcessVideoJobData } from '../videos.constants';
import {
  PROCESS_VIDEO_JOB,
  UPLOAD_RECONCILIATION_QUEUE,
  VIDEO_PROCESSING_QUEUE,
} from '../videos.constants';

/**
 * Safety-net for the presigned-upload flow (per upload-completion-signal/TD-01):
 * a client can upload every part and then crash before calling
 * `POST /videos/:publicId/complete`, stranding the draft in `uploading`. This
 * repeatable sweep scans drafts stuck past the abandoned-upload timeout, HEADs
 * storage, and either enqueues processing (object present) or fails the draft
 * (object absent). Idempotent and best-effort — a per-draft error is logged and
 * the sweep continues.
 */
@Processor(UPLOAD_RECONCILIATION_QUEUE)
export class UploadReconciliationProcessor extends WorkerHost {
  private readonly logger = new Logger(UploadReconciliationProcessor.name);

  constructor(
    @InjectRepository(Video)
    private readonly videoRepository: Repository<Video>,
    private readonly storageService: StorageService,
    @InjectQueue(VIDEO_PROCESSING_QUEUE)
    private readonly processingQueue: Queue<ProcessVideoJobData>,
    @Inject(queueConfig.KEY)
    private readonly config: ConfigType<typeof queueConfig>,
  ) {
    super();
  }

  async process(): Promise<void> {
    const cutoff = new Date(Date.now() - this.config.abandonedUploadTimeoutMs);
    const stale = await this.videoRepository.find({
      where: { status: 'uploading', created_at: LessThan(cutoff) },
    });
    if (stale.length === 0) {
      return;
    }
    this.logger.log(`Reconciling ${stale.length} abandoned upload(s).`);

    for (const video of stale) {
      try {
        await this.reconcile(video);
      } catch (error) {
        // Best-effort sweep: one draft's failure must not abort the rest.
        this.logger.error(
          `Failed to reconcile video ${video.id}: ${(error as Error).message}`,
        );
      }
    }
  }

  private async reconcile(video: Video): Promise<void> {
    const head = await this.storageService.headObject(video.storage_key);
    if (head) {
      // Parts landed but the client never called complete — rescue it.
      await this.videoRepository.update(
        { id: video.id },
        { status: 'processing', upload_id: null },
      );
      await this.processingQueue.add(PROCESS_VIDEO_JOB, {
        video_id: video.id,
        storage_key: video.storage_key,
      });
      this.logger.log(`Rescued abandoned upload ${video.id} → processing.`);
    } else {
      // Nothing was ever finalized in storage — the upload is lost.
      await this.videoRepository.update({ id: video.id }, { status: 'failed' });
      this.logger.warn(`Failed abandoned upload ${video.id} (no object).`);
    }
  }
}
