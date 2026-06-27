import { registerAs } from '@nestjs/config';

export default registerAs('queue', () => ({
  host: process.env.QUEUE_HOST || 'redis',
  port: parseInt(process.env.QUEUE_PORT || '6379', 10),
  db: parseInt(process.env.QUEUE_DB || '0', 10),
  password: process.env.QUEUE_PASSWORD || undefined,
  videoProcessingQueueName:
    process.env.QUEUE_VIDEO_PROCESSING_NAME || 'video-processing',
  videoProcessingConcurrency: parseInt(
    process.env.QUEUE_VIDEO_PROCESSING_CONCURRENCY || '2',
    10,
  ),
}));
