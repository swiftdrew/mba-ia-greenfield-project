export interface CompletedUploadPart {
  partNumber: number;
  etag: string;
}

export interface ObjectStreamResult {
  body: NodeJS.ReadableStream;
  contentType: string;
  contentLength: number;
  contentRange?: string;
  statusCode: number;
}
