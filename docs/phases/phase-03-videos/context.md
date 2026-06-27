---
kind: phase
name: phase-03-videos
sources_mtime:
  docs/project-plan.md: "2026-06-27T10:00:00-03:00"
  docs/decisions/technical-decisions-phase-03-videos.md: "2026-06-27T10:15:00-03:00"
  docs/phases/phase-02-auth/phase-02-auth.md: "2026-06-27T10:00:00-03:00"
---

# Phase 03 — Upload e Processamento de Vídeos (Context)

## Scope

- **Phase name:** Upload e Processamento de Vídeos
- **Primary capabilities:** object storage integration, direct multipart upload up to 10GB, async processing queue + worker, metadata extraction, thumbnail generation, unique URL, streaming and download endpoints.
- **Out of scope:** frontend video UI, comments/likes/subscriptions, publishing workflow beyond base status lifecycle.
- **Deliverables:** upload to 10GB without API blocking, automatic processing, generated thumbnail, unique slug URL, range streaming, downloadable video.

## Decisions Index

| Ref | Source | Scope | Topic | Status | Decision | Libraries |
|-----|--------|-------|-------|--------|----------|-----------|
| TD-01 | `technical-decisions-phase-03-videos.md` | Backend | Queue stack | decided | BullMQ + Redis | `bullmq`, `ioredis` |
| TD-02 | `technical-decisions-phase-03-videos.md` | Backend | 10GB upload strategy | decided | Multipart pre-signed direct upload | `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner` |
| TD-03 | `technical-decisions-phase-03-videos.md` | Backend | Worker runtime | decided | Dedicated worker container | `ffmpeg`, `ffprobe` |
| TD-04 | `technical-decisions-phase-03-videos.md` | Backend | Unique URL | decided | Title slug + random suffix | none |
| TD-05 | `technical-decisions-phase-03-videos.md` | Backend | Streaming | decided | API range proxy (`206`) | none |
| TD-06 | `technical-decisions-phase-03-videos.md` | Backend | Status lifecycle | decided | `draft -> processing -> ready/error` | none |

## Inherited Conventions

- Docker Compose service names must be used as hosts inside containers.
- Domain errors use `DomainException` + `DomainExceptionFilter`.
- Request validation uses global `ValidationPipe`.
- Tests follow `*.spec.ts`, `*.integration-spec.ts`, `*.e2e-spec.ts`.
- Migrations are versioned under `src/database/migrations/`.
- Branch workflow uses `feature/*` changes derived from `dev`.

## Capability Coverage

| Capability | Covered by |
|------------|------------|
| Storage for videos/thumbnails | TD-02, TD-03 |
| Upload without API blocking | TD-02 |
| Background processing | TD-01, TD-03 |
| Unique URL | TD-04 |
| Streaming/download | TD-05 |
| Status lifecycle/failure behavior | TD-06 |
