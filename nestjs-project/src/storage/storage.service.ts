import {
  CompleteMultipartUploadCommand,
  CreateBucketCommand,
  CreateMultipartUploadCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  UploadPartCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { createWriteStream } from 'node:fs';
import type { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import storageConfig from '../config/storage.config';

export interface PresignedPart {
  part_number: number;
  url: string;
}

export interface CompletedPart {
  part_number: number;
  etag: string;
}

export interface MultipartUploadInit {
  upload_id: string;
  parts: PresignedPart[];
}

/**
 * Wraps every object-storage interaction behind a single S3-compatible service so
 * the rest of the phase stays storage-agnostic (per phase-03-upload-processing/TD-01).
 *
 * Two clients are used deliberately:
 *  - `s3`        — talks to the internal endpoint (Docker service host) for direct
 *                  operations the API/worker perform server-side.
 *  - `presignS3` — signs URLs against the public endpoint so the browser can reach
 *                  them (a `minio:9000` host is not resolvable outside the network).
 */
@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private readonly s3: S3Client;
  private readonly presignS3: S3Client;
  private readonly bucket: string;
  private readonly partSizeBytes: number;
  private readonly presignExpirySeconds: number;

  constructor(
    @Inject(storageConfig.KEY)
    config: ConfigType<typeof storageConfig>,
  ) {
    const credentials = {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    };
    this.s3 = new S3Client({
      endpoint: config.endpoint,
      region: config.region,
      credentials,
      forcePathStyle: true,
    });
    this.presignS3 = new S3Client({
      endpoint: config.publicEndpoint,
      region: config.region,
      credentials,
      forcePathStyle: true,
    });
    this.bucket = config.bucket;
    this.partSizeBytes = config.partSizeBytes;
    this.presignExpirySeconds = config.presignExpirySeconds;
  }

  async onModuleInit(): Promise<void> {
    await this.ensureBucket();
  }

  async ensureBucket(): Promise<void> {
    try {
      await this.s3.send(new HeadBucketCommand({ Bucket: this.bucket }));
      return;
    } catch (error) {
      if (!this.isNotFound(error)) {
        throw error;
      }
    }
    try {
      await this.s3.send(new CreateBucketCommand({ Bucket: this.bucket }));
      this.logger.log(`Created storage bucket "${this.bucket}".`);
    } catch (error) {
      const name = (error as { name?: string })?.name;
      if (
        name !== 'BucketAlreadyOwnedByYou' &&
        name !== 'BucketAlreadyExists'
      ) {
        throw error;
      }
    }
  }

  /** Number of parts a `sizeBytes` upload splits into at the configured part size. */
  partCount(sizeBytes: number): number {
    return Math.max(1, Math.ceil(sizeBytes / this.partSizeBytes));
  }

  /**
   * Starts a multipart upload and returns the upload id plus one presigned PUT URL
   * per part (per phase-03-upload-processing/TD-05).
   */
  async initiateMultipartUpload(
    storageKey: string,
    contentType: string,
    sizeBytes: number,
  ): Promise<MultipartUploadInit> {
    const created = await this.s3.send(
      new CreateMultipartUploadCommand({
        Bucket: this.bucket,
        Key: storageKey,
        ContentType: contentType,
      }),
    );
    if (!created.UploadId) {
      throw new Error(
        'Storage did not return an UploadId for the multipart upload',
      );
    }
    const parts = await this.getPresignedPartUrls(
      storageKey,
      created.UploadId,
      this.partCount(sizeBytes),
    );
    return { upload_id: created.UploadId, parts };
  }

  async getPresignedPartUrls(
    storageKey: string,
    uploadId: string,
    partCount: number,
  ): Promise<PresignedPart[]> {
    const parts: PresignedPart[] = [];
    for (let partNumber = 1; partNumber <= partCount; partNumber++) {
      const url = await getSignedUrl(
        this.presignS3,
        new UploadPartCommand({
          Bucket: this.bucket,
          Key: storageKey,
          UploadId: uploadId,
          PartNumber: partNumber,
        }),
        { expiresIn: this.presignExpirySeconds },
      );
      parts.push({ part_number: partNumber, url });
    }
    return parts;
  }

  /** Finalizes a multipart upload from the client-reported part ETags. */
  async completeMultipartUpload(
    storageKey: string,
    uploadId: string,
    parts: CompletedPart[],
  ): Promise<void> {
    await this.s3.send(
      new CompleteMultipartUploadCommand({
        Bucket: this.bucket,
        Key: storageKey,
        UploadId: uploadId,
        MultipartUpload: {
          Parts: [...parts]
            .sort((a, b) => a.part_number - b.part_number)
            .map((p) => ({ PartNumber: p.part_number, ETag: p.etag })),
        },
      }),
    );
  }

  /** Returns the object's size, or `null` when the object does not exist. */
  async headObject(storageKey: string): Promise<{ size: number } | null> {
    try {
      const head = await this.s3.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: storageKey }),
      );
      return { size: head.ContentLength ?? 0 };
    } catch (error) {
      if (this.isNotFound(error)) {
        return null;
      }
      throw error;
    }
  }

  /** Streams an object to a local file (used by the worker to fetch the source). */
  async downloadToFile(storageKey: string, filePath: string): Promise<void> {
    const res = await this.s3.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: storageKey }),
    );
    if (!res.Body) {
      throw new Error(`Object "${storageKey}" returned an empty body`);
    }
    await pipeline(res.Body as Readable, createWriteStream(filePath));
  }

  /** Uploads a buffer as a single object (used by the worker for thumbnails). */
  async putObject(
    storageKey: string,
    body: Buffer,
    contentType: string,
  ): Promise<void> {
    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: storageKey,
        Body: body,
        ContentType: contentType,
      }),
    );
  }

  /**
   * Presigned GET URL for streaming (Range-native) or download. Passing
   * `downloadFilename` sets an attachment disposition (per phase-03-upload-processing/TD-06).
   */
  async getPresignedGetUrl(
    storageKey: string,
    options: { downloadFilename?: string } = {},
  ): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: storageKey,
      ...(options.downloadFilename && {
        ResponseContentDisposition: `attachment; filename="${options.downloadFilename}"`,
      }),
    });
    return getSignedUrl(this.presignS3, command, {
      expiresIn: this.presignExpirySeconds,
    });
  }

  private isNotFound(error: unknown): boolean {
    const err = error as {
      name?: string;
      $metadata?: { httpStatusCode?: number };
    };
    return (
      err?.name === 'NotFound' ||
      err?.name === 'NoSuchKey' ||
      err?.$metadata?.httpStatusCode === 404
    );
  }
}
