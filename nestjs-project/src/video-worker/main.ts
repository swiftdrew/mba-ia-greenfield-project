import 'dotenv/config';
import { execFile } from 'child_process';
import { randomUUID } from 'crypto';
import { mkdir, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { promisify } from 'util';
import { Job, Worker } from 'bullmq';
import { DataSource } from 'typeorm';
import { Channel } from '../channels/entities/channel.entity';
import { User } from '../users/entities/user.entity';
import { Video, VideoStatus } from '../videos/entities/video.entity';
import { StorageService } from '../storage/storage.service';
import storageConfig from '../config/storage.config';
import {
  ProcessVideoJobPayload,
  VIDEO_PROCESSING_JOB,
} from '../queue/video-job.types';

const execFileAsync = promisify(execFile);

const queueConnection = {
  host: process.env.QUEUE_HOST ?? 'redis',
  port: Number(process.env.QUEUE_PORT ?? 6379),
  db: Number(process.env.QUEUE_DB ?? 0),
  password: process.env.QUEUE_PASSWORD || undefined,
};

const queueName = process.env.QUEUE_VIDEO_PROCESSING_NAME ?? 'video-processing';
const concurrency = Number(process.env.QUEUE_VIDEO_PROCESSING_CONCURRENCY ?? 2);

const dataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST ?? 'db',
  port: Number(process.env.DB_PORT ?? 5432),
  username: process.env.DB_USERNAME ?? 'streamtube',
  password: process.env.DB_PASSWORD ?? 'streamtube',
  database: process.env.DB_NAME ?? 'streamtube',
  synchronize: false,
  entities: [User, Channel, Video],
});

const storage = new StorageService(storageConfig() as never);

async function probeVideoMetadata(filePath: string): Promise<{
  durationSeconds: number | null;
  raw: Record<string, unknown>;
}> {
  const { stdout } = await execFileAsync('ffprobe', [
    '-v',
    'error',
    '-print_format',
    'json',
    '-show_format',
    '-show_streams',
    filePath,
  ]);

  const payload = JSON.parse(stdout) as {
    format?: { duration?: string };
    streams?: unknown[];
  };
  const durationSeconds = payload.format?.duration
    ? Number(payload.format.duration)
    : null;

  return {
    durationSeconds: Number.isFinite(durationSeconds) ? durationSeconds : null,
    raw: payload as Record<string, unknown>,
  };
}

async function generateThumbnail(
  sourcePath: string,
  targetPath: string,
): Promise<void> {
  await execFileAsync('ffmpeg', [
    '-y',
    '-i',
    sourcePath,
    '-ss',
    '00:00:00.000',
    '-frames:v',
    '1',
    targetPath,
  ]);
}

async function processVideoJob(
  job: Job<ProcessVideoJobPayload>,
): Promise<void> {
  const videoRepository = dataSource.getRepository(Video);
  const video = await videoRepository.findOne({
    where: { id: job.data.videoId },
  });

  if (!video || !video.source_object_key) {
    throw new Error(
      `Video ${job.data.videoId} not found or missing source key`,
    );
  }

  const workDir = join(tmpdir(), `streamtube-worker-${randomUUID()}`);
  await mkdir(workDir, { recursive: true });
  const sourcePath = join(workDir, 'source-video.bin');
  const thumbnailPath = join(workDir, 'thumbnail.jpg');

  try {
    await storage.downloadVideoToFile(video.source_object_key, sourcePath);
    const metadata = await probeVideoMetadata(sourcePath);
    await generateThumbnail(sourcePath, thumbnailPath);

    const thumbnailKey = `thumbnails/${video.channel_id}/${video.slug}.jpg`;
    await storage.uploadThumbnailFromFile(thumbnailKey, thumbnailPath);

    video.status = VideoStatus.READY;
    video.duration_seconds = metadata.durationSeconds;
    video.metadata_json = metadata.raw;
    video.thumbnail_object_key = thumbnailKey;
    video.processing_error = null;
    await videoRepository.save(video);
  } catch (err) {
    video.status = VideoStatus.ERROR;
    video.processing_error = err instanceof Error ? err.message : String(err);
    await videoRepository.save(video);
    throw err;
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

async function bootstrapWorker(): Promise<void> {
  await dataSource.initialize();
  await storage.onModuleInit();

  const worker = new Worker<ProcessVideoJobPayload>(
    queueName,
    async (job) => {
      if (job.name !== VIDEO_PROCESSING_JOB) {
        return;
      }
      await processVideoJob(job);
    },
    { connection: queueConnection, concurrency },
  );

  worker.on('failed', (job, err) => {
    const line = `[video-worker] job failed ${job?.id ?? 'unknown'}: ${err.message}\n`;
    void writeFile('/tmp/video-worker-errors.log', line, { flag: 'a' });
  });

  const shutdown = async (): Promise<void> => {
    await worker.close();
    await dataSource.destroy();
    process.exit(0);
  };

  process.on('SIGINT', () => {
    void shutdown();
  });

  process.on('SIGTERM', () => {
    void shutdown();
  });
}

void bootstrapWorker();
