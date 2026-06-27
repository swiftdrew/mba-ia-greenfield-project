import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import queueConfig from '../config/queue.config';
import storageConfig from '../config/storage.config';
import { createTestDataSource } from '../test/create-test-data-source';
import { Channel } from '../channels/entities/channel.entity';
import { User } from '../users/entities/user.entity';
import { Video } from './entities/video.entity';
import { VideosModule } from './videos.module';

describe('VideosModule', () => {
  it('compiles with expected providers', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          load: [queueConfig, storageConfig],
        }),
        TypeOrmModule.forRoot(
          createTestDataSource([User, Channel, Video]).options,
        ),
        VideosModule,
      ],
    }).compile();

    expect(moduleRef).toBeDefined();
    await moduleRef.close();
  });
});
