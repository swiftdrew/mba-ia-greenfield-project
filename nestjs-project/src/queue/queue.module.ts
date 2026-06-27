import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import queueConfig from '../config/queue.config';
import { VideoJobsService } from './video-jobs.service';

@Module({
  imports: [ConfigModule.forFeature(queueConfig)],
  providers: [VideoJobsService],
  exports: [VideoJobsService],
})
export class QueueModule {}
