# Creative Connectors (C-0) – regler for agenter

1. Pure rules live in `src/core/connectors` (manifest, SHA-256/PKCE, sessions, intake, conflicts, capabilities); `/api/v1` is one handler (`src/adapters/connectors/api-v1.ts`) over a `ConnectorStore`, so Cloud and the fake test store run the same code.
2. Tokens are random, prefixed (`ptgc_/ptgr_/ptga_/ptgd_`) and stored only as SHA-256; access 15 min, refresh rotated on every use, reuse revokes the session; every call rechecks expiry, revocation, membership, project and scope.
3. Received files always become a new `AddAssetVersion` candidate via `apply_changes`; only the user's own `ApproveAssetVersion` changes the active version. Conflict choices never delete anything.
4. Intake allowlist is `AE_SAFE_EXTENSIONS`; content is sniffed and the SHA-256 checked before any candidate exists.
5. Connector tables (0109) are integration logs written by service-role code and security-definer RPCs, not `apply_changes` tables; members read via `my_project_ids()`.
6. Every endpoint is in `docs/api/openapi-v1.json`; `tests/unit/c0-connectors.test.ts` fails on undocumented routes. All plugins use `packages/ptg-connector-sdk`, which imports only `src/core/connectors`.
7. Adapters declare capabilities in `ADAPTERS`; the UI offers only what works and otherwise «Eksporter for …».
8. Plugins live in `plugins/<host>/` and touch the host only through one injected `Host` module (Photoshop: `plugins/photoshop/src/host.ts`), so all behaviour is tested against fake host modules without the real program.
9. Boords (C-4) is a server-to-server adapter: the per-user/workspace key is sealed with the AI key vault (AAD provider `boords`), only `src/adapters/connectors/boords*.server.ts` decrypt it, and identity rests on our manifest ID plus `connector_links` (client `boords`) with field hashes in `boords_frame_state`, because Boords documents no ETag/If-Match or external-ref field. Incoming changes are `boords_candidates` only; applying them is an ordinary undoable command in the browser.
