import { registerAs } from '@nestjs/config';

export default registerAs('storage', () => ({
  endpoint: process.env.STORAGE_ENDPOINT || 'http://minio:9000',
  region: process.env.STORAGE_REGION || 'us-east-1',
  accessKey: process.env.STORAGE_ACCESS_KEY || 'streamtube',
  secretKey: process.env.STORAGE_SECRET_KEY || 'streamtube123',
  forcePathStyle: (process.env.STORAGE_FORCE_PATH_STYLE || 'true') === 'true',
  videosBucket: process.env.STORAGE_VIDEOS_BUCKET || 'videos',
  thumbnailsBucket: process.env.STORAGE_THUMBNAILS_BUCKET || 'thumbnails',
  signedUrlExpiresInSeconds: parseInt(
    process.env.STORAGE_SIGNED_URL_EXPIRES_IN_SECONDS || '3600',
    10,
  ),
}));
