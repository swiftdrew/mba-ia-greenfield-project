---
kind: library-refs
name: phase-03-videos
libs:
  "@aws-sdk/client-s3": "^3.1075.0"
  "@aws-sdk/s3-request-presigner": "^3.1075.0"
  "bullmq": "^5.79.1"
  "ioredis": "^5.11.1"
---

# Library References — Phase 03

## @aws-sdk/client-s3 + @aws-sdk/s3-request-presigner

- **Docs:**
  - [AWS SDK v3 S3 CompleteMultipartUploadCommand](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/s3/command/CompleteMultipartUploadCommand/)
  - [AWS multipart upload architecture (CreateMultipartUpload -> UploadPart -> CompleteMultipartUpload)](https://aws.amazon.com/blogs/compute/uploading-large-objects-to-amazon-s3-using-multipart-upload-and-transfer-acceleration/)
- **Adopted patterns:**
  - Server starts multipart uploads with `CreateMultipartUploadCommand`.
  - Server signs per-part URLs with `UploadPartCommand` + `getSignedUrl(...)`.
  - Client reports `(PartNumber, ETag)` list; server finalizes with `CompleteMultipartUploadCommand`.

## bullmq + ioredis

- **Docs:**
  - [BullMQ guide — retries/backoff](https://docs.bullmq.io/guide/retrying-failing-jobs)
- **Adopted patterns:**
  - Queue producer uses stable queue name (`video-processing`).
  - Worker consumes jobs with bounded `attempts` and `backoff`.
  - Failed jobs trigger status transition to `error`.

## ffmpeg / ffprobe runtime

- **Docs:**
  - [ffprobe documentation](https://www.ffmpeg.org/ffprobe.html)
- **Adopted patterns:**
  - Worker uses `ffprobe` for duration/metadata extraction from downloaded source file.
  - Worker uses `ffmpeg -ss ... -frames:v 1` to create thumbnail frame.
