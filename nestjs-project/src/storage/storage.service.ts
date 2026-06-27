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
import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { createWriteStream } from 'fs';
import { readFile } from 'fs/promises';
import { pipeline } from 'stream/promises';
import storageConfig from '../config/storage.config';
import { CompletedUploadPart, ObjectStreamResult } from './storage.types';

@Injectable()
export class StorageService implements OnModuleInit {
  private readonly s3Client: S3Client;

  constructor(
    @Inject(storageConfig.KEY)
    private readonly cfg: ConfigType<typeof storageConfig>,
  ) {
    this.s3Client = new S3Client({
      endpoint: this.cfg.endpoint,
      region: this.cfg.region,
      credentials: {
        accessKeyId: this.cfg.accessKey,
        secretAccessKey: this.cfg.secretKey,
      },
      forcePathStyle: this.cfg.forcePathStyle,
    });
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.ensureBucket(this.cfg.videosBucket);
      await this.ensureBucket(this.cfg.thumbnailsBucket);
    } catch (err) {
      // Keep bootstrap resilient for suites/environments that don't need storage.
      // Upload/stream operations still fail explicitly if storage is unavailable.
      console.warn('[storage] bucket bootstrap skipped:', err);
    }
  }

  private async ensureBucket(bucket: string): Promise<void> {
    try {
      await this.s3Client.send(new HeadBucketCommand({ Bucket: bucket }));
    } catch {
      await this.s3Client.send(new CreateBucketCommand({ Bucket: bucket }));
    }
  }

  async createVideoMultipartUpload(
    key: string,
    contentType: string,
  ): Promise<{ uploadId: string; key: string }> {
    const response = await this.s3Client.send(
      new CreateMultipartUploadCommand({
        Bucket: this.cfg.videosBucket,
        Key: key,
        ContentType: contentType,
      }),
    );

    if (!response.UploadId) {
      throw new Error('Could not start multipart upload');
    }

    return { uploadId: response.UploadId, key };
  }

  async signUploadPartUrl(
    key: string,
    uploadId: string,
    partNumber: number,
  ): Promise<string> {
    const command = new UploadPartCommand({
      Bucket: this.cfg.videosBucket,
      Key: key,
      UploadId: uploadId,
      PartNumber: partNumber,
    });

    return getSignedUrl(this.s3Client, command, {
      expiresIn: this.cfg.signedUrlExpiresInSeconds,
    });
  }

  async completeVideoMultipartUpload(
    key: string,
    uploadId: string,
    parts: CompletedUploadPart[],
  ): Promise<void> {
    await this.s3Client.send(
      new CompleteMultipartUploadCommand({
        Bucket: this.cfg.videosBucket,
        Key: key,
        UploadId: uploadId,
        MultipartUpload: {
          Parts: parts
            .map((part) => ({ ETag: part.etag, PartNumber: part.partNumber }))
            .sort((a, b) => (a.PartNumber ?? 0) - (b.PartNumber ?? 0)),
        },
      }),
    );
  }

  async uploadThumbnailFromFile(
    key: string,
    localFilePath: string,
    contentType = 'image/jpeg',
  ): Promise<void> {
    const fileBuffer = await readFile(localFilePath);
    await this.s3Client.send(
      new PutObjectCommand({
        Bucket: this.cfg.thumbnailsBucket,
        Key: key,
        Body: fileBuffer,
        ContentType: contentType,
      }),
    );
  }

  async getVideoObjectStream(
    key: string,
    range?: string,
  ): Promise<ObjectStreamResult> {
    const response = await this.s3Client.send(
      new GetObjectCommand({
        Bucket: this.cfg.videosBucket,
        Key: key,
        Range: range,
      }),
    );

    if (!response.Body) {
      throw new Error('Video object not found');
    }

    return {
      body: response.Body as NodeJS.ReadableStream,
      contentType: response.ContentType ?? 'application/octet-stream',
      contentLength: Number(response.ContentLength ?? 0),
      contentRange: response.ContentRange,
      statusCode: response.ContentRange ? 206 : 200,
    };
  }

  async getVideoObjectMetadata(key: string): Promise<{
    contentType: string;
    contentLength: number;
  }> {
    const response = await this.s3Client.send(
      new HeadObjectCommand({ Bucket: this.cfg.videosBucket, Key: key }),
    );

    return {
      contentType: response.ContentType ?? 'application/octet-stream',
      contentLength: Number(response.ContentLength ?? 0),
    };
  }

  async downloadVideoToBuffer(key: string): Promise<Buffer> {
    const response = await this.s3Client.send(
      new GetObjectCommand({ Bucket: this.cfg.videosBucket, Key: key }),
    );
    if (!response.Body) {
      throw new Error('Object body is empty');
    }
    const bytes = await response.Body.transformToByteArray();
    return Buffer.from(bytes);
  }

  async downloadVideoToFile(key: string, targetPath: string): Promise<void> {
    const response = await this.s3Client.send(
      new GetObjectCommand({ Bucket: this.cfg.videosBucket, Key: key }),
    );

    if (!response.Body) {
      throw new Error('Object body is empty');
    }

    await pipeline(
      response.Body as NodeJS.ReadableStream,
      createWriteStream(targetPath),
    );
  }
}
