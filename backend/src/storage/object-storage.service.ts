import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client, PutObjectCommand, GetObjectCommand, HeadBucketCommand, CreateBucketCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { OnModuleInit } from '@nestjs/common';

@Injectable()
export class ObjectStorageService implements OnModuleInit {
  private readonly logger = new Logger(ObjectStorageService.name);
  private readonly enabled: boolean;
  private readonly s3?: S3Client;
  private readonly presigner?: S3Client;
  private readonly bucket: string;
  private available = false;
  constructor(config: ConfigService) {
    this.enabled = config.get('STORAGE_ENABLED', 'true') !== 'false';
    this.bucket = config.get('S3_BUCKET', 'med09-vouchers');
    if (!this.enabled) return;
    this.s3 = new S3Client({
      endpoint: config.get('S3_ENDPOINT'), region: config.get('S3_REGION', 'us-east-1'),
      forcePathStyle: config.get('S3_FORCE_PATH_STYLE', 'true') === 'true',
      credentials: { accessKeyId: config.getOrThrow('S3_ACCESS_KEY'), secretAccessKey: config.getOrThrow('S3_SECRET_KEY') },
    });
    this.presigner = config.get('S3_PUBLIC_ENDPOINT')
      ? new S3Client({
          endpoint: config.getOrThrow('S3_PUBLIC_ENDPOINT'), region: config.get('S3_REGION', 'us-east-1'),
          forcePathStyle: config.get('S3_FORCE_PATH_STYLE', 'true') === 'true',
          credentials: { accessKeyId: config.getOrThrow('S3_ACCESS_KEY'), secretAccessKey: config.getOrThrow('S3_SECRET_KEY') },
        })
      : this.s3;
  }
  async upload(key: string, body: Buffer, contentType: string) {
    try {
      await this.requireEnabled().send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType }));
      this.available = true;
    } catch {
      this.available = false;
      throw new ServiceUnavailableException('Object Storage khong kha dung.');
    }
  }
  async delete(key: string) {
    try {
      await this.requireEnabled().send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
      this.available = true;
    } catch {
      this.available = false;
      throw new ServiceUnavailableException('Object Storage khong kha dung.');
    }
  }
  async onModuleInit() {
    if (!this.enabled) return;
    const client = this.requireEnabled();
    try {
      await client.send(new HeadBucketCommand({ Bucket: this.bucket }));
      this.available = true;
    } catch {
      try {
        await client.send(new CreateBucketCommand({ Bucket: this.bucket }));
        this.available = true;
      } catch {
        this.available = false;
        this.logger.warn('Object Storage is unavailable; voucher requests will return HTTP 503.');
      }
    }
  }
  async signDownload(key: string, expiresInSeconds = 300) {
    this.requireEnabled();
    try {
      const url = await getSignedUrl(this.presigner!, new GetObjectCommand({ Bucket: this.bucket, Key: key }), { expiresIn: expiresInSeconds });
      this.available = true;
      return url;
    } catch {
      this.available = false;
      throw new ServiceUnavailableException('Object Storage khong kha dung.');
    }
  }
  async isReady() {
    if (!this.enabled) return true;
    try {
      await this.requireEnabled().send(new HeadBucketCommand({ Bucket: this.bucket }));
      this.available = true;
      return true;
    } catch {
      this.available = false;
      return false;
    }
  }
  isEnabled() { return this.enabled; }
  private requireEnabled(): S3Client {
    if (!this.enabled || !this.s3) throw new ServiceUnavailableException('Object Storage đang bị tắt.');
    return this.s3;
  }
}
