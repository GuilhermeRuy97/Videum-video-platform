export const VIDEO_PROCESSING_QUEUE = 'video-processing';
export const PROCESS_VIDEO_JOB = 'process-video';

/** Payload of the `process-video` job consumed by the worker (SI-03.6). */
export interface ProcessVideoJobData {
  video_id: string;
  storage_key: string;
}

export const UPLOAD_RECONCILIATION_QUEUE = 'upload-reconciliation';
export const SWEEP_ABANDONED_UPLOADS_JOB = 'sweep-abandoned-uploads';
/** Stable scheduler id so bootstrap re-registration upserts (never duplicates). */
export const SWEEP_ABANDONED_UPLOADS_SCHEDULER =
  'sweep-abandoned-uploads-scheduler';
