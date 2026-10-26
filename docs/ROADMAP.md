# Roadmap FoodRec

**Implemented** = kode tersedia. **Tested** = automated/integration check lulus. **Planned** = belum dikerjakan. **Pending Validation** = butuh dataset nyata atau validasi operasional.

| Fase | Cakupan | Status | Dependensi |
| --- | --- | --- | --- |
| [x] 1 — Project Foundation & Design System | App Router/TypeScript, Tailwind tokens, Plus Jakarta Sans, public/auth/admin layouts, shared UI, home, error/404. | **Implemented**; lint/typecheck/build lulus; manual responsive/a11y review **Pending Validation**. | — |
| [x] 2 — Database Foundation, Authentication & Authorization | PostgreSQL/Prisma tujuh model, migration, Better Auth database sessions, register/login/logout, USER/ADMIN guard, admin dashboard/seed. | **Implemented**; migration, role/auth integration, seed, DB constraints lulus pada PostgreSQL sementara. Production DB **Pending Validation**. | Fase 1 |
| [x] 3 — Food Management | Admin list/search/filter/sort/pagination, CRUD, image upload, hybrid delete/reactivate, CSV template/preview/insert-only commit, FoodImport history, seed 40 foods. | **Implemented**; PostgreSQL CRUD/image/import integration lulus. Production storage **Pending Validation**. | Fase 2 |
| [x] 4 — Rating workflows & dataset export | Public active catalog, USER rating/history, ADMIN private immutable snapshot CSV `user_id,food_id,rating`. | **Implemented**; rating/session/export/checksum integration lulus. CSV rating contract tervalidasi. | Fase 3 |
| [ ] 5 — Altair processing | User menjalankan UBCF/Cosine/user k-NN manual di Altair dan bertukar CSV. | Kontrak aplikasi **Implemented**; kompatibilitas file Altair penelitian **Pending Validation** | Fase 4 |
| [x] 6 — Result validation and audit | Validasi referensi, rank, duplikasi, stale warnings, validation report, lifecycle dan audit. | **Implemented; parser/API/PostgreSQL integration Tested** | Fase 5 |
| [x] 7 — Recommendation publication | Atomic publication, supersede history, admin detail, owner-only recommendation page. | **Implemented; concurrent publication/owner/filter integration Tested**; visual review **Pending Validation** | Fase 6 |
| [ ] 8 — Hardening and release | Security/performance/accessibility, observability, backup/restore, deployment. | **Planned** | Fase 1–7 |

## Acceptance checks Fase 1–4

- [x] Public home, responsive public/auth/admin layouts.
- [x] Register fields include name/email/password/confirmation; server validation; public role USER only.
- [x] Better Auth database sessions, login/logout, rate limits and secure cookie policy.
- [x] Server-side admin role check and non-dummy dashboard.
- [x] Seven domain models, auth tables, restrictive FKs and immutable-history migration rules.
- [x] F1/F2/F3 migrations applied without reset; unique/CHECK/FK/trigger constraints verified.
- [x] Better Auth registration/login/session/logout and Guest/USER/ADMIN protected-page integration passed.
- [x] F3 food CRUD, search/filter, upload/signature validation/replacement, history-aware delete/deactivation/reactivation verified.
- [x] CSV template, row-error preview, duplicate checks, insert-only/no-partial transaction, concurrent commit and import history verified.
- [x] Idempotent 40-food seed; rerun skips existing Food Codes and leaves records unchanged.
- [x] Guest sees active Food catalog; USER can upsert only own 1–5 ratings and see own history.
- [x] First rating sets `firstUsedAt` in same DB transaction; inactive Food refuses new ratings.
- [x] ADMIN exports private CSV snapshot with exactly numeric user/food IDs and rating; checksum-verified admin-only download.
- [ ] Manual mobile/tablet/accessibility review.
- [ ] Production object storage/persistent volume, DB operations, shared rate-limit storage, and production security/performance review.

Altair tetap proses manual; validasi round-trip dengan file hasil penelitian sebenarnya masih diperlukan. Tidak ada CF backend, integrasi otomatis Altair, atau scheduler.
