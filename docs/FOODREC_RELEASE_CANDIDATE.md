# FoodRec Local Release Candidate

**Status: local functional review only. Not production-ready.** Tested 2026-11-13 on isolated PostgreSQL `_test` databases with the Food.com K-Core 10 cohort.

## Acceptance results

| Flow | Result | Evidence |
| --- | --- | --- |
| USER registration/login, logout, protected routes | Pass | Chromium journeys and PostgreSQL integration |
| K-Core 10 catalog, search/filter, recipe detail | Pass | 500 users, 6,788 recipes, 19,299 training ratings; import rerun remained idempotent |
| Ratings, updates, Rating Saya | Pass | Browser flow, failure/retry, and database integration |
| Rekomendasi Untukmu | Pass with limits | New-user/empty states, loading, simulated error/retry, and manually published results tested |
| ADMIN login and recipe management | Pass | Access control, CRUD, images, active/inactive state, and CSV import integration |
| Dataset/job monitoring and Python worker | Pass | Real worker, revision/staleness, and artifact checks on `_test` |
| Manual CSV publication | Pass | Admin validation, explicit confirmation, and USER visibility tested |
| Missing image and inactive recipe | Pass | Missing-image fallback shown; inactive recipe excluded from catalog and detail API returns 404 |

Desktop and 390px mobile journeys passed without horizontal overflow. No application UX bug reproduced. Initial E2E run exposed a test-runner mismatch: `test:e2e` included Food.com-only spec against a non-imported catalog. Runner now selects Phase F; dedicated `test:e2e:foodcom` validates K-Core 10 separately.

## Safety and limitations

- Python UBCF still matches independent hand-calculated oracle; this proves implementation against explicit-rating equations, not recommendation quality or Altair parity.
- Recommendation display depends on an Admin-imported and manually published validated CSV. Worker artifact stays `UNVERIFIED`; it cannot publish.
- `validationStatus=PENDING_VALIDATION`; automatic processing and publication remain `OFF`. Gate and artifact constraints unchanged.
- K-Core 10 is a dense, activity-filtered cohort: 500 historical users, 6,788 recipes, 19,299 training ratings. Coverage is limited to eligible accounts/items and users with usable neighbors. No approved quality evaluation or coverage target exists.
- Historical ratings remain namespaced worker input; they do not create FoodRec login accounts.
- Food.com rights/provenance remain **unverified**. Local exploratory import does not grant redistribution or production-use permission.

## Release blockers

- Confirm dataset rights, provenance, and permitted use before any external release.
- Approve recommendation methodology and quality evaluation; resolve whether exact Altair parity remains mandatory. Do not infer approval from oracle or integration results.
- Complete production-specific security/configuration review, durable private storage and backup/restore validation, monitoring/alerting, worker operations, and rollback/migration rehearsal.
- Obtain explicit release approval. No production database, deployment, or production-readiness test was performed.

## Test evidence

- Python: `56` passed. Node: `25` passed. Typecheck and lint passed.
- Production build passed against `_test` database.
- PostgreSQL integration: `7/7` passed on fresh `foodrec_rc_integration2_20261113_test`.
- Playwright Phase F: `5/5` passed on `foodrec_rc_phasef2_20261113_test`.
- Playwright Food.com/K-Core 10: `1/1` passed on `foodrec_rc_kcore10_20261113_test`; import counts and idempotency verified.
- All test databases end in `_test`. Production database was not modified. No push or deployment.
