import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { Queue } from 'bullmq';
import queueConfig from '../config/queue.config';
import {
  ProcessVideoJobPayload,
  VIDEO_PROCESSING_JOB,
} from './video-job.types';

@Injectable()
export class VideoJobsService implements OnModuleDestroy {
  private readonly queue: Queue<ProcessVideoJobPayload>;

  constructor(
    @Inject(queueConfig.KEY)
    private readonly queueSettings: ConfigType<typeof queueConfig>,
  ) {
    const connection = {
      host: this.queueSettings.host,
      port: this.queueSettings.port,
      db: this.queueSettings.db,
      password: this.queueSettings.password,
    };

    this.queue = new Queue<ProcessVideoJobPayload>(
      this.queueSettings.videoProcessingQueueName,
      { connection },
    );
  }

  async enqueueVideoProcessing(payload: ProcessVideoJobPayload): Promise<void> {
    await this.queue.add(VIDEO_PROCESSING_JOB, payload, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 1500 },
      removeOnComplete: 50,
      removeOnFail: 50,
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue.close();
  }
}
