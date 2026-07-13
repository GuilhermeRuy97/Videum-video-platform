import { registerAs } from '@nestjs/config';

export default registerAs('storage', () => ({
  // Internal endpoint the API and worker use to reach MinIO over the Docker network.
  endpoint: process.env.STORAGE_ENDPOINT || 'http://minio:9000',
  // Public endpoint browsers use — presigned URLs must be signed against this host,
  // since `minio:9000` is only resolvable inside the Docker network.
  publicEndpoint:
    process.env.STORAGE_PUBLIC_ENDPOINT || 'http://localhost:9000',
  region: process.env.STORAGE_REGION || 'us-east-1',
  accessKeyId: process.env.STORAGE_ACCESS_KEY || 'minioadmin',
  secretAccessKey: process.env.STORAGE_SECRET_KEY || 'minioadmin',
  bucket: process.env.STORAGE_BUCKET || 'videos',
  // 100 MB parts — a 10 GB upload splits into ~100 parts, within S3's 10000-part limit.
  partSizeBytes: parseInt(
    process.env.STORAGE_PART_SIZE_BYTES || '104857600',
    10,
  ),
  presignExpirySeconds: parseInt(
    process.env.STORAGE_PRESIGN_EXPIRY_SECONDS || '3600',
    10,
  ),
}));
