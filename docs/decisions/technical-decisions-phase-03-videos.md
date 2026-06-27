---
scope_type: phase
related_phases: [3]
status: decided
date: 2026-06-27
scope_description: "Backend delivery of video upload, asynchronous processing, object storage integration, background worker, and streaming/download APIs for Phase 03."
---

# Technical Decisions — Phase 03: Upload e Processamento de Vídeos

_Subprojects in scope:_

- `nestjs-project/` — backend API, database migration/entity, queue publisher, storage integration, streaming and download endpoints, and video worker runtime.
- `next-frontend/` — out of scope in this phase (frontend video UI deferred).

---

## TD-01: Message Queue Technology

**Scope:** Backend

**Capability:** Serviço de processamento em segundo plano (filas)

**Context:** Video metadata extraction and thumbnail generation are CPU-intensive and must run asynchronously. The queue technology needs reliable delivery, retry support, and simple local Docker operation.

**Options:**

### Option A: BullMQ + Redis
- Uses Redis as broker and persistence, with first-class Node.js integration.
- **Pros:** Mature API for delayed jobs/retries/backoff; lightweight local setup in Docker; strong ecosystem for NestJS/Node workers; good operational simplicity for this phase.
- **Cons:** Requires Redis infrastructure and explicit worker process management.

### Option B: RabbitMQ + custom consumers
- AMQP broker with robust routing and acknowledgments.
- **Pros:** Strong messaging semantics and routing flexibility.
- **Cons:** More operational overhead for this phase; more boilerplate in consumer code; not necessary for a single processing pipeline.

### Option C: PostgreSQL-backed jobs
- Queue semantics implemented in DB tables and polling workers.
- **Pros:** No new infrastructure beyond PostgreSQL.
- **Cons:** Higher contention and complexity under heavier throughput; weaker ergonomics for retries/concurrency.

**Recommendation:** **Option A (BullMQ + Redis)** — best balance between reliability and implementation speed for Phase 03.

**Decision:** A (BullMQ + Redis)

---

## TD-02: Upload Strategy for Files up to 10GB

**Scope:** Backend

**Capability:** Upload de vídeos com suporte a arquivos de até 10GB sem impacto na performance

**Context:** Sending large files through the API process risks memory pressure, request timeouts, and poor horizontal scalability.

**Options:**

### Option A: API proxy upload (multipart to NestJS)
- Client uploads entire file to API, API forwards to storage.
- **Pros:** Simple client flow.
- **Cons:** Violates non-blocking requirement for 10GB; ties upload throughput to API instances.

### Option B: Direct multipart upload to S3-compatible storage via pre-signed URLs
- API creates draft + multipart session and signs each part URL; client uploads parts directly to storage and asks API to complete upload.
- **Pros:** API never streams 10GB payload; resumable multipart semantics; production-ready for S3 and local MinIO.
- **Cons:** Requires additional API endpoints for multipart orchestration.

### Option C: Direct single PUT pre-signed upload
- One pre-signed URL per file.
- **Pros:** Simpler than multipart.
- **Cons:** Poor resume behavior and reliability for very large files.

**Recommendation:** **Option B (direct multipart pre-signed upload)** — satisfies 10GB requirement and avoids API blocking.

**Decision:** B (Direct multipart pre-signed upload)

---

## TD-03: Worker Runtime and Video Processing

**Scope:** Backend

**Capability:** Processamento automático do vídeo após upload + geração de thumbnail

**Context:** Metadata probing and frame extraction must run outside the request lifecycle.

**Options:**

### Option A: Dedicated worker container consuming queue jobs
- Separate process/container with BullMQ consumer, ffprobe/ffmpeg execution, and DB/storage updates.
- **Pros:** Isolates CPU-heavy tasks from API; independently scalable; resilient retries.
- **Cons:** Additional container and deployment unit.

### Option B: In-process worker inside API
- API process also consumes queue.
- **Pros:** Simpler deployment.
- **Cons:** Resource contention with HTTP traffic; weaker fault isolation.

**Recommendation:** **Option A** — clean separation and reliability for asynchronous media workloads.

**Decision:** A (Dedicated worker container)

---

## TD-04: Unique Video URL Strategy

**Scope:** Backend

**Capability:** URL única por vídeo, sem conflito com outros vídeos

**Context:** Every video requires a stable, non-conflicting public identifier.

**Options:**

### Option A: Slug from title only
- **Pros:** Human-readable.
- **Cons:** Frequent collisions; expensive disambiguation.

### Option B: Slug from normalized title + short random suffix
- **Pros:** Human-readable and low collision probability; deterministic enough for UX while ensuring uniqueness.
- **Cons:** Slightly less clean URL than title-only.

### Option C: UUID only
- **Pros:** Collision-proof.
- **Cons:** Poor readability/shareability.

**Recommendation:** **Option B** — keeps friendly URLs while guaranteeing uniqueness.

**Decision:** B (Title slug + random suffix)

---

## TD-05: Streaming and Download Delivery

**Scope:** Backend

**Capability:** Reprodução via streaming e download do vídeo

**Context:** Playback must support partial byte ranges so users can start watching without full download.

**Options:**

### Option A: API proxy with HTTP Range support
- API reads from object storage and serves `206 Partial Content` when `Range` is present.
- **Pros:** Full control over auth/policy; single backend surface.
- **Cons:** API bandwidth cost for streaming traffic.

### Option B: Redirect to signed storage URLs for streaming
- **Pros:** Offloads traffic to storage/CDN.
- **Cons:** More complex authorization lifecycle; URL expiration handling in players.

**Recommendation:** **Option A** for Phase 03 — simplest controlled baseline with standards-compliant range streaming.

**Decision:** A (API proxy with HTTP Range support)

---

## TD-06: Video Status Lifecycle and Failure Policy

**Scope:** Backend

**Capability:** Ciclo de status do vídeo e tratamento de falhas

**Context:** Users and operators need deterministic state transitions while uploads and processing happen asynchronously.

**Options:**

### Option A: `draft -> processing -> ready|error`
- **Pros:** Minimal and explicit lifecycle aligned with phase scope.
- **Cons:** Does not distinguish fine-grained sub-states.

### Option B: Many granular states (`uploading`, `uploaded`, `queued`, etc.)
- **Pros:** More observability.
- **Cons:** Higher complexity for little product value in this phase.

**Recommendation:** **Option A** — keep state model compact and sufficient.

**Decision:** A (`draft -> processing -> ready|error`)

---

## Decisions Summary

| ID | Decision | Recommendation | Choice |
|----|----------|---------------|--------|
| TD-01 | Message Queue Technology | BullMQ + Redis | A (BullMQ + Redis) |
| TD-02 | Upload Strategy | Direct multipart pre-signed upload | B (Direct multipart pre-signed upload) |
| TD-03 | Worker Runtime | Dedicated worker container | A (Dedicated worker container) |
| TD-04 | Unique URL Strategy | Title slug + random suffix | B (Title slug + random suffix) |
| TD-05 | Streaming Strategy | API proxy with HTTP Range | A (API proxy with HTTP Range) |
| TD-06 | Status Lifecycle | `draft -> processing -> ready|error` | A (`draft -> processing -> ready|error`) |
