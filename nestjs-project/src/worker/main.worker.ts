import { getQueueToken } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { Queue } from 'bullmq';
import queueConfig from '../config/queue.config';
import {
  SWEEP_ABANDONED_UPLOADS_JOB,
  SWEEP_ABANDONED_UPLOADS_SCHEDULER,
  UPLOAD_RECONCILIATION_QUEUE,
} from '../videos/videos.constants';
import { WorkerModule } from './worker.module';

/**
 * Second entrypoint: boots a headless application context (no HTTP server) that
 * runs the BullMQ processors. Deployed as its own container (per
 * phase-03-upload-processing/TD-02).
 */
async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(WorkerModule);
  app.enableShutdownHooks();

  // Register the repeatable reconciliation sweep (per upload-completion-signal/TD-01).
  // `upsertJobScheduler` is idempotent on the scheduler id, so a worker restart
  // updates the schedule in place instead of stacking duplicate jobs.
  const config = app.get<ConfigType<typeof queueConfig>>(queueConfig.KEY);
  const reconciliationQueue = app.get<Queue>(
    getQueueToken(UPLOAD_RECONCILIATION_QUEUE),
  );
  await reconciliationQueue.upsertJobScheduler(
    SWEEP_ABANDONED_UPLOADS_SCHEDULER,
    { every: config.reconciliationIntervalMs },
    { name: SWEEP_ABANDONED_UPLOADS_JOB, data: {} },
  );

  new Logger('VideoWorker').log(
    `Video processing worker started; reconciliation sweep every ${config.reconciliationIntervalMs}ms.`,
  );
}

void bootstrap();
