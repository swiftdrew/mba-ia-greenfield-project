import { execFile } from 'child_process';
import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { promisify } from 'util';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { AuthService } from '../src/auth/auth.service';
import { DomainExceptionFilter } from '../src/common/filters/domain-exception.filter';
import { ValidationExceptionFilter } from '../src/common/filters/validation-exception.filter';
import { cleanAllTables } from '../src/test/create-test-data-source';

const execFileAsync = promisify(execFile);

interface AuthServiceShape {
  mailService: {
    sendConfirmationEmail: (
      email: string,
      name: string,
      token: string,
    ) => Promise<void>;
  };
}

interface InitUploadResponse {
  video_id: string;
  upload_id: string;
  slug: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('Videos real flow (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

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
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await cleanAllTables(dataSource);
  });

  async function registerAndLogin(email: string): Promise<string> {
    const authService = app.get(AuthService);
    const mailServiceInstance = (authService as unknown as AuthServiceShape)
      .mailService;

    let token = '';
    jest
      .spyOn(mailServiceInstance, 'sendConfirmationEmail')
      .mockImplementationOnce((_email, _name, capturedToken) => {
        token = capturedToken;
        return Promise.resolve();
      });

    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password: 'password123' })
      .expect(201);

    await request(app.getHttpServer())
      .get('/auth/confirm-email')
      .query({ token })
      .expect(204);

    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: 'password123' })
      .expect(200);

    return (loginRes.body as { access_token: string }).access_token;
  }

  async function createTinyVideoBuffer(): Promise<Buffer> {
    const dir = await fs.mkdtemp(join(tmpdir(), 'streamtube-e2e-'));
    const filePath = join(dir, 'tiny.mp4');

    await execFileAsync('ffmpeg', [
      '-y',
      '-f',
      'lavfi',
      '-i',
      'color=c=black:s=320x240:d=1',
      '-pix_fmt',
      'yuv420p',
      filePath,
    ]);

    const buffer = await fs.readFile(filePath);
    await fs.rm(dir, { recursive: true, force: true });
    return buffer;
  }

  it('processes a real uploaded video and serves stream/download', async () => {
    const accessToken = await registerAndLogin('videos-real@example.com');
    const videoBuffer = await createTinyVideoBuffer();

    const initRes = await request(app.getHttpServer())
      .post('/videos/uploads/init')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        title: 'Real Video',
        original_filename: 'real-video.mp4',
        content_type: 'video/mp4',
        size_bytes: videoBuffer.length,
      })
      .expect(201);

    const initBody = initRes.body as InitUploadResponse;

    const signRes = await request(app.getHttpServer())
      .post('/videos/uploads/sign-part')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        video_id: initBody.video_id,
        upload_id: initBody.upload_id,
        part_number: 1,
      })
      .expect(201);

    const uploadUrl = (signRes.body as { upload_url: string }).upload_url;
    const partUploadResponse = await fetch(uploadUrl, {
      method: 'PUT',
      body: new Uint8Array(videoBuffer),
      headers: { 'content-type': 'video/mp4' },
    });
    expect(partUploadResponse.ok).toBe(true);

    const etag = partUploadResponse.headers.get('etag');
    expect(etag).toBeTruthy();

    await request(app.getHttpServer())
      .post('/videos/uploads/complete')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        video_id: initBody.video_id,
        upload_id: initBody.upload_id,
        parts: [{ part_number: 1, etag }],
      })
      .expect(204);

    let ready = false;
    for (let i = 0; i < 20; i++) {
      const res = await request(app.getHttpServer()).get(
        `/videos/${initBody.slug}`,
      );
      if (res.status === 200) {
        ready = true;
        break;
      }
      await sleep(1000);
    }

    expect(ready).toBe(true);

    const streamRes = await request(app.getHttpServer())
      .get(`/videos/${initBody.slug}/stream`)
      .set('Range', 'bytes=0-200')
      .expect(206);
    expect(streamRes.headers['content-range']).toContain('bytes');

    const downloadRes = await request(app.getHttpServer())
      .get(`/videos/${initBody.slug}/download`)
      .expect(200);
    expect(downloadRes.headers['content-disposition']).toContain('attachment');
  }, 60_000);
});
