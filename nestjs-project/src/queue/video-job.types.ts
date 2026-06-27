export const VIDEO_PROCESSING_JOB = 'process-video';

export interface ProcessVideoJobPayload {
  videoId: string;
  sourceObjectKey: string;
}
