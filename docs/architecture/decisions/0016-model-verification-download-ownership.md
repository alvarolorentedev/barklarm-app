# 0016 — Manifest-bound model verification and download ownership

Status: accepted (Phase 2.1)

## Context

The Phase 2 marker contained only a SHA-256 string, and `is_verified` checked size, GGUF magic and marker existence.
A same-size replacement could be activated, and concurrent download/remove operations could promote a cancelled file.

## Decision

- Verification records are JSON bound to model id, version, file name, size and expected SHA-256.
- Lightweight status checks read the record, size and GGUF header; they do not hash the 1.1 GB file on every UI poll.
- Activation performs a full SHA-256 in `spawn_blocking`, bounded by a timeout. Success upgrades legacy markers. A
  same-process cache keyed by path, size and mtime avoids rehashing on every idle restart.
- One download operation owns the destination. Cancellation and removal increment an epoch; a download may not promote
  after either. Cancellation wakes a blocked stream read, and network waits are cancellable.
- An existing model is not deleted until a verified replacement is ready. `.part` files are cleaned on failure. The
  old file is moved to a backup during promotion and restored if rename, marker swap or cancellation fails; the next
  record is written before the installed file is touched.
- Redirects are limited to the pinned HTTPS distribution hosts, and downloaded bytes remain bounded by the manifest.

## Consequences

- Legacy installations may be re-hashed before first activation; a malformed marker reports `corrupted`.
- Marker format changes are not migrated blindly. The model file remains usable after a successful full verification.
- A local user with write access to the application data directory is outside this integrity boundary.
