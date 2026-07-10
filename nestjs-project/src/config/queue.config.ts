import { registerAs } from '@nestjs/config';

export default registerAs('queue', () => ({
  host: process.env.REDIS_HOST || 'redis',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  // How often the worker's reconciliation sweep runs (per upload-completion-signal/TD-01).
  reconciliationIntervalMs: parseInt(
    process.env.RECONCILIATION_INTERVAL_MS || '300000',
    10,
  ),
  // A draft still in `uploading` older than this is considered abandoned by the
  // sweep. Defaults to the presign expiry (1h) — past it the upload URLs are dead,
  // so the draft is either finished-but-uncompleted (rescued) or lost (failed).
  abandonedUploadTimeoutMs: parseInt(
    process.env.ABANDONED_UPLOAD_TIMEOUT_MS || '3600000',
    10,
  ),
}));
