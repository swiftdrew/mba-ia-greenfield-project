import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomBytes } from 'crypto';
import { Repository } from 'typeorm';
import { Channel } from '../channels/entities/channel.entity';
import {
  VideoForbiddenException,
  VideoNotFoundException,
  VideoNotReadyException,
  VideoUploadInvalidStateException,
  VideoUploadTooLargeException,
} from '../common/exceptions/domain.exception';
import { VideoJobsService } from '../queue/video-jobs.service';
import { StorageService } from '../storage/storage.service';
import { CompleteVideoUploadDto } from './dto/complete-video-upload.dto';
import { InitVideoUploadDto } from './dto/init-video-upload.dto';
import { SignUploadPartDto } from './dto/sign-upload-part.dto';
import { Video, VideoStatus } from './entities/video.entity';

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024 * 1024;

function slugifyTitle(title: string): string {
  const normalized = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

  return normalized || 'video';
}

@Injectable()
export class VideosService {
  constructor(
    @InjectRepository(Video)
    private readonly videoRepository: Repository<Video>,
    @InjectRepository(Channel)
    private readonly channelRepository: Repository<Channel>,
    private readonly storageService: StorageService,
    private readonly videoJobsService: VideoJobsService,
  ) {}

  async initUpload(
    userId: string,
    dto: InitVideoUploadDto,
  ): Promise<{
    video_id: string;
    slug: string;
    upload_id: string;
    object_key: string;
  }> {
    if (dto.size_bytes > MAX_UPLOAD_BYTES) {
      throw new VideoUploadTooLargeException();
    }

    const channel = await this.channelRepository.findOne({
      where: { user_id: userId },
    });

    if (!channel) {
      throw new VideoForbiddenException();
    }

    const slug = await this.generateUniqueSlug(dto.title);
    const objectKey = `videos/${channel.id}/${slug}.source`;
    const multipart = await this.storageService.createVideoMultipartUpload(
      objectKey,
      dto.content_type,
    );

    const saved = await this.videoRepository.save(
      this.videoRepository.create({
        channel_id: channel.id,
        title: dto.title,
        slug,
        status: VideoStatus.DRAFT,
        source_object_key: multipart.key,
        source_upload_id: multipart.uploadId,
      }),
    );

    return {
      video_id: saved.id,
      slug: saved.slug,
      upload_id: multipart.uploadId,
      object_key: multipart.key,
    };
  }

  async signUploadPart(
    userId: string,
    dto: SignUploadPartDto,
  ): Promise<{
    upload_url: string;
  }> {
    const video = await this.findOwnedVideoById(userId, dto.video_id);

    if (
      video.status !== VideoStatus.DRAFT ||
      !video.source_upload_id ||
      video.source_upload_id !== dto.upload_id ||
      !video.source_object_key
    ) {
      throw new VideoUploadInvalidStateException();
    }

    const uploadUrl = await this.storageService.signUploadPartUrl(
      video.source_object_key,
      dto.upload_id,
      dto.part_number,
    );

    return { upload_url: uploadUrl };
  }

  async completeUpload(
    userId: string,
    dto: CompleteVideoUploadDto,
  ): Promise<void> {
    const video = await this.findOwnedVideoById(userId, dto.video_id);

    if (
      video.status !== VideoStatus.DRAFT ||
      !video.source_upload_id ||
      video.source_upload_id !== dto.upload_id ||
      !video.source_object_key
    ) {
      throw new VideoUploadInvalidStateException();
    }

    await this.storageService.completeVideoMultipartUpload(
      video.source_object_key,
      dto.upload_id,
      dto.parts.map((part) => ({
        partNumber: part.part_number,
        etag: part.etag,
      })),
    );

    video.status = VideoStatus.PROCESSING;
    video.source_upload_id = null;
    await this.videoRepository.save(video);

    await this.videoJobsService.enqueueVideoProcessing({
      videoId: video.id,
      sourceObjectKey: video.source_object_key,
    });
  }

  async getPublicVideoBySlug(slug: string): Promise<Video> {
    const video = await this.videoRepository.findOne({ where: { slug } });
    if (!video) {
      throw new VideoNotFoundException();
    }
    if (video.status !== VideoStatus.READY) {
      throw new VideoNotReadyException();
    }
    return video;
  }

  private async findOwnedVideoById(
    userId: string,
    videoId: string,
  ): Promise<Video> {
    const video = await this.videoRepository.findOne({
      where: { id: videoId },
    });
    if (!video) {
      throw new VideoNotFoundException();
    }

    const channel = await this.channelRepository.findOne({
      where: { id: video.channel_id },
    });

    if (!channel || channel.user_id !== userId) {
      throw new VideoForbiddenException();
    }

    return video;
  }

  private async generateUniqueSlug(title: string): Promise<string> {
    const base = slugifyTitle(title).slice(0, 60);

    for (let i = 0; i < 6; i++) {
      const suffix = randomBytes(3).toString('hex');
      const candidate = `${base}-${suffix}`.slice(0, 80);
      const exists = await this.videoRepository.exists({
        where: { slug: candidate },
      });
      if (!exists) {
        return candidate;
      }
    }

    return `${base}-${Date.now()}`.slice(0, 80);
  }
}
