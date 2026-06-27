import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import type { ObjectLiteral, Repository } from 'typeorm';
import { Channel } from '../channels/entities/channel.entity';
import { VideoJobsService } from '../queue/video-jobs.service';
import { StorageService } from '../storage/storage.service';
import { InitVideoUploadDto } from './dto/init-video-upload.dto';
import { Video, VideoStatus } from './entities/video.entity';
import { VideosService } from './videos.service';

describe('VideosService', () => {
  let service: VideosService;
  let videoRepository: jest.Mocked<Repository<Video>>;
  let channelRepository: jest.Mocked<Repository<Channel>>;
  let storageService: jest.Mocked<StorageService>;
  let jobsService: jest.Mocked<VideoJobsService>;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        VideosService,
        {
          provide: getRepositoryToken(Video),
          useValue: mockRepository<Video>(),
        },
        {
          provide: getRepositoryToken(Channel),
          useValue: mockRepository<Channel>(),
        },
        { provide: StorageService, useValue: mockStorageService() },
        { provide: VideoJobsService, useValue: mockJobsService() },
      ],
    }).compile();

    service = moduleRef.get(VideosService);
    videoRepository = moduleRef.get(getRepositoryToken(Video));
    channelRepository = moduleRef.get(getRepositoryToken(Channel));
    storageService = moduleRef.get(StorageService);
    jobsService = moduleRef.get(VideoJobsService);
  });

  it('creates draft video and multipart upload on init', async () => {
    const dto: InitVideoUploadDto = {
      title: 'Meu Video Teste',
      original_filename: 'video.mp4',
      content_type: 'video/mp4',
      size_bytes: 1024,
    };

    channelRepository.findOne.mockResolvedValue({ id: 'ch-1' } as Channel);
    videoRepository.exists.mockResolvedValue(false);
    storageService.createVideoMultipartUpload.mockResolvedValue({
      uploadId: 'upload-1',
      key: 'videos/ch-1/meu-video-aaaaaa.source',
    });
    videoRepository.create.mockImplementation((value) => value as Video);
    videoRepository.save.mockResolvedValue({
      id: 'video-1',
      slug: 'meu-video-aaaaaa',
    } as Video);

    const result = await service.initUpload('user-1', dto);

    expect(storageService.createVideoMultipartUpload.mock.calls.length).toBe(1);
    expect(result.video_id).toBe('video-1');
    expect(result.upload_id).toBe('upload-1');
  });

  it('moves draft video to processing and enqueues job', async () => {
    const video = {
      id: 'video-1',
      channel_id: 'ch-1',
      status: VideoStatus.DRAFT,
      source_upload_id: 'upload-1',
      source_object_key: 'videos/ch-1/file.source',
    } as Video;

    videoRepository.findOne.mockResolvedValue(video);
    channelRepository.findOne.mockResolvedValue({
      id: 'ch-1',
      user_id: 'user-1',
    } as Channel);
    videoRepository.save.mockResolvedValue({
      ...video,
      status: VideoStatus.PROCESSING,
    } as Video);

    await service.completeUpload('user-1', {
      video_id: 'video-1',
      upload_id: 'upload-1',
      parts: [{ part_number: 1, etag: '"abc"' }],
    });

    expect(storageService.completeVideoMultipartUpload.mock.calls.length).toBe(
      1,
    );
    expect(jobsService.enqueueVideoProcessing.mock.calls[0][0]).toEqual({
      videoId: 'video-1',
      sourceObjectKey: 'videos/ch-1/file.source',
    });
  });
});

function mockRepository<T extends ObjectLiteral>(): Partial<
  jest.Mocked<Repository<T>>
> {
  return {
    findOne: jest.fn(),
    exists: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };
}

function mockStorageService(): Partial<jest.Mocked<StorageService>> {
  return {
    createVideoMultipartUpload: jest.fn(),
    completeVideoMultipartUpload: jest.fn(),
  };
}

function mockJobsService(): Partial<jest.Mocked<VideoJobsService>> {
  return {
    enqueueVideoProcessing: jest.fn(),
  };
}
