import { DataSource } from 'typeorm';
import { Channel } from '../../channels/entities/channel.entity';
import { User } from '../../users/entities/user.entity';
import { createTestDataSource } from '../../test/create-test-data-source';
import { Video, VideoStatus } from './video.entity';

describe('Video entity (integration)', () => {
  let dataSource: DataSource;

  beforeAll(async () => {
    dataSource = createTestDataSource([User, Channel, Video]);
    await dataSource.initialize();
  });

  beforeEach(async () => {
    await dataSource.query('DELETE FROM "videos"');
    await dataSource.query('DELETE FROM "channels"');
    await dataSource.query('DELETE FROM "users"');
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  it('persists video with default draft status', async () => {
    const user = await dataSource.getRepository(User).save({
      email: 'video-entity@example.com',
      password: 'hash',
      is_confirmed: true,
    });
    const channel = await dataSource.getRepository(Channel).save({
      name: 'videoentity',
      nickname: 'videoentity',
      user_id: user.id,
    });

    const video = await dataSource.getRepository(Video).save({
      channel_id: channel.id,
      title: 'My Test Video',
      slug: 'my-test-video-1',
    });

    expect(video.status).toBe(VideoStatus.DRAFT);
    expect(video.channel_id).toBe(channel.id);
  });
});
