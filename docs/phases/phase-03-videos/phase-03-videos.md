---
kind: phase
name: phase-03-videos
sources_mtime:
  docs/project-plan.md: "2026-06-27T10:00:00-03:00"
  docs/decisions/technical-decisions-phase-03-videos.md: "2026-06-27T10:15:00-03:00"
  docs/phases/phase-03-videos/context.md: "2026-06-27T10:20:00-03:00"
---

# Phase 03 — Upload e Processamento de Vídeos

## Objective

Deliver backend support for large-video upload (up to 10GB), asynchronous processing with queue + worker, automatic thumbnail/metadata extraction, unique URL routing, range-based streaming, and download.

---

## Step Implementations

### SI-03.1 — Dependencies, Config Namespaces, and Compose Infrastructure

**Technical actions:**
- Add storage and queue dependencies (`@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`, `bullmq`, `ioredis`).
- Add `storage.config.ts`, `queue.config.ts`, and env validation entries.
- Extend `compose.yaml` with `minio`, `redis`, and `video-worker`.

**Dependencies:** None

### SI-03.2 — Video Entity and Migration

**Technical actions:**
- Create `Video` entity linked to `Channel`.
- Add columns for slug, status, storage keys, duration, metadata, and processing error.
- Add migration `CreateVideos`.

**Dependencies:** SI-03.1

### SI-03.3 — Storage and Queue Infrastructure Modules

**Technical actions:**
- Implement storage service for multipart init/sign/complete, object metadata, object stream retrieval, and uploads.
- Implement queue module/service for enqueueing `video-processing` jobs.

**Dependencies:** SI-03.1, SI-03.2

### SI-03.4 — Videos Module API Contracts

**Technical actions:**
- Create videos service/controller and DTOs.
- Implement upload-init/sign-part/complete endpoints with automatic draft creation.
- Implement ownership checks (video belongs to authenticated user's channel).
- Implement video query endpoint by slug.

**Dependencies:** SI-03.2, SI-03.3

### SI-03.5 — Worker Processing Pipeline

**Technical actions:**
- Add dedicated worker entrypoint for BullMQ.
- Download uploaded object, extract metadata/duration via `ffprobe`, generate thumbnail with `ffmpeg`, upload thumbnail, update DB status.
- Mark processing failures as `error`.

**Dependencies:** SI-03.3, SI-03.4

### SI-03.6 — Streaming and Download Endpoints

**Technical actions:**
- Implement `GET /videos/:slug/stream` with support for `Range` (`206 Partial Content`).
- Implement `GET /videos/:slug/download` as attachment stream.
- Keep routes public while serving only `ready` videos.

**Dependencies:** SI-03.4

### SI-03.7 — Tests, Progress Tracking, and Documentation Sync

**Technical actions:**
- Add unit/integration/e2e coverage for video module and worker-adjacent behaviors.
- Update `progress.md` by SI and update `nestjs-project/CLAUDE.md` with real module/endpoints/worker/storage behavior.
- Execute `test`, `test:e2e`, `tsc --noEmit`, and `lint` in containerized flow when docker is available.

**Dependencies:** SI-03.1..SI-03.6

---

## Technical Specifications

### Data Model

#### Video

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | uuid | PK, generated | |
| channel_id | uuid | FK -> channels.id, not null | owner channel |
| title | varchar(150) | not null | draft title at upload init |
| slug | varchar(80) | unique, not null | public URL identifier |
| status | enum | not null | `draft`, `processing`, `ready`, `error` |
| source_object_key | varchar(255) | nullable | video object key |
| thumbnail_object_key | varchar(255) | nullable | thumbnail object key |
| source_upload_id | varchar(255) | nullable | active multipart session id |
| duration_seconds | numeric(10,3) | nullable | filled by worker |
| metadata_json | jsonb | nullable | ffprobe payload subset |
| processing_error | text | nullable | set on failure |
| created_at | timestamp | default now | |
| updated_at | timestamp | default now | |

### API Contracts

- `POST /videos/uploads/init` (auth): creates draft video + multipart upload session.
- `POST /videos/uploads/sign-part` (auth): returns pre-signed URL for one part.
- `POST /videos/uploads/complete` (auth): completes multipart upload, sets status to `processing`, enqueues worker job.
- `GET /videos/:slug` (public): returns video metadata when `ready`.
- `GET /videos/:slug/stream` (public): byte-range streaming (`206` on range request).
- `GET /videos/:slug/download` (public): file download stream.

### Authorization Matrix

| Endpoint | Public | Authenticated | Notes |
|----------|--------|---------------|-------|
| POST /videos/uploads/init | | ✓ | channel owner only |
| POST /videos/uploads/sign-part | | ✓ | must own draft video |
| POST /videos/uploads/complete | | ✓ | must own draft video |
| GET /videos/:slug | ✓ | | only `ready` |
| GET /videos/:slug/stream | ✓ | | only `ready`, supports `Range` |
| GET /videos/:slug/download | ✓ | | only `ready` |

### Error Catalog

| Code | HTTP | Trigger |
|------|------|---------|
| VIDEO_NOT_FOUND | 404 | unknown slug/id or inaccessible by owner |
| VIDEO_NOT_READY | 409 | stream/download/get before ready |
| VIDEO_UPLOAD_INVALID_STATE | 409 | part signing/completion in invalid status |
| VIDEO_UPLOAD_TOO_LARGE | 400 | requested size above 10GB |
| VIDEO_FORBIDDEN | 403 | authenticated user does not own target video |

### Events/Messages

- **Queue:** `video-processing`
- **Job name:** `process-video`
- **Payload:**
  - `videoId: string`
  - `sourceObjectKey: string`
- **Producer:** API on successful multipart completion
- **Consumer:** `video-worker` container
- **Failure policy:** retry with exponential backoff; after final failure set status to `error` with `processing_error`

---

## Dependency Map

```text
SI-03.1
├── SI-03.2
│   └── SI-03.3
│       ├── SI-03.4
│       │   └── SI-03.6
│       └── SI-03.5
└── SI-03.7 (depends on all previous SIs)
```

## Deliverables

- [ ] Upload multipart de até 10GB sem tráfego de arquivo pelo processo da API.
- [ ] Vídeo pré-cadastrado em `draft` ao iniciar upload.
- [ ] Processamento assíncrono automático para metadados + thumbnail.
- [ ] URL única por vídeo (slug sem conflito).
- [ ] Streaming com suporte a `Range` e download disponível.
- [ ] Infra `minio + redis + video-worker` no Docker Compose.
- [ ] Migration e entidade `videos` ligadas ao canal.
- [ ] Testes unit/integration/e2e cobrindo o fluxo base.
- [ ] `progress.md` atualizado por SI.
