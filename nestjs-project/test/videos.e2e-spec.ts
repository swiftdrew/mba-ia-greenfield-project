import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource, Repository } from 'typeorm';
import { AppModule } from '../src/app.module';
import { AuthService } from '../src/auth/auth.service';
import { DomainExceptionFilter } from '../src/common/filters/domain-exception.filter';
import { ValidationExceptionFilter } from '../src/common/filters/validation-exception.filter';
import { VideoJobsService } from '../src/queue/video-jobs.service';
import { StorageService } from '../src/storage/storage.service';
import { cleanAllTables } from '../src/test/create-test-data-source';
import { Video, VideoStatus } from '../src/videos/entities/video.entity';

interface MailServiceShape {
  sendConfirmationEmail: (
    email: string,
    name: string,
    token: string,
  ) => Promise<void>;
}

interface AuthServiceShape {
  mailService: MailServiceShape;
}

interface LoginResponseBody {
  access_token: string;
}

interface InitUploadResponseBody {
  video_id: string;
  upload_id: string;
  slug: string;
}

interface PublicVideoResponseBody {
  slug: string;
  status: string;
}

describe('Videos (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let videoRepository: Repository<Video>;

  const storageMock = {
    createVideoMultipartUpload: jest.fn().mockResolvedValue({
      uploadId: 'upload-1',
      key: 'videos/ch-1/new-video.source',
    }),
    signUploadPartUrl: jest
      .fn()
      .mockResolvedValue('https://signed.example/part'),
    completeVideoMultipartUpload: jest.fn().mockResolvedValue(undefined),
    getVideoObjectStream: jest.fn(),
    getVideoObjectMetadata: jest.fn(),
  };

  const jobsMock = {
    enqueueVideoProcessing: jest.fn().mockResolvedValue(undefined),
  };

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(StorageService)
      .useValue(storageMock)
      .overrideProvider(VideoJobsService)
      .useValue(jobsMock)
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.useGlobalFilters(
      new DomainExceptionFilter(),
      new ValidationExceptionFilter(),
    );
    await app.init();

    dataSource = moduleFixture.get(DataSource);
    videoRepository = dataSource.getRepository(Video);
  });

  beforeEach(async () => {
    await cleanAllTables(dataSource);
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await app.close();
  });

  async function registerAndLogin(email: string): Promise<string> {
    const authService = app.get(AuthService);
    const mailServiceInstance = (authService as unknown as AuthServiceShape)
      .mailService;
    let confirmationToken = '';

    jest
      .spyOn(mailServiceInstance, 'sendConfirmationEmail')
      .mockImplementationOnce((_e: string, _n: string, token: string) => {
        confirmationToken = token;
        return Promise.resolve();
      });

    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password: 'password123' })
      .expect(201);

    await request(app.getHttpServer())
      .get('/auth/confirm-email')
      .query({ token: confirmationToken })
      .expect(204);

    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: 'password123' })
      .expect(200);

    return (login.body as LoginResponseBody).access_token;
  }

  it('requires auth for upload init', async () => {
    await request(app.getHttpServer()).post('/videos/uploads/init').expect(401);
  });

  it('creates a draft video and returns multipart session data', async () => {
    const accessToken = await registerAndLogin('video-owner@example.com');

    const res = await request(app.getHttpServer())
      .post('/videos/uploads/init')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        title: 'My First Video',
        original_filename: 'my-first-video.mp4',
        content_type: 'video/mp4',
        size_bytes: 1024 * 1024,
      })
      .expect(201);
    const body = res.body as InitUploadResponseBody;

    expect(body.video_id).toBeDefined();
    expect(body.upload_id).toBeDefined();
    expect(storageMock.createVideoMultipartUpload.mock.calls.length).toBe(1);
  });

  it('returns ready video metadata by slug', async () => {
    const accessToken = await registerAndLogin('video-read@example.com');
    const init = await request(app.getHttpServer())
      .post('/videos/uploads/init')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        title: 'Ready Video',
        original_filename: 'ready.mp4',
        content_type: 'video/mp4',
        size_bytes: 1024,
      })
      .expect(201);
    const initBody = init.body as InitUploadResponseBody;

    await videoRepository.update(
      { id: initBody.video_id },
      { status: VideoStatus.READY, duration_seconds: 12.5 },
    );

    const res = await request(app.getHttpServer())
      .get(`/videos/${initBody.slug}`)
      .expect(200);
    const body = res.body as PublicVideoResponseBody;

    expect(body.slug).toBe(initBody.slug);
    expect(body.status).toBe('ready');
  });
});
