# Phase F Verification

**Run date:** 2026-11-11

**Scope:** browser journeys, manual CSV workflow, PostgreSQL gates, real Python worker, UX smoke checks. No deploy or push.

## Readiness by subsystem

| Subsystem | Result | Evidence / boundary |
| --- | --- | --- |
| Guest and USER journeys | **PASS** | Chromium verified public catalog, protected routes, registration/login/logout, rating create/update/history, search/filter, detail, empty and published recommendation states. |
| Admin workflow | **PASS for FoodRec handoff** | Chromium verified Food create, rating snapshot/download, invalid CSV rejection, valid CSV validation, explicit publish confirmation, audit/monitoring. CSVs were synthetic; actual Altair application run and research export round-trip were **NOT RUN**. |
| Python worker and job queue | **PASS for explicit staging** | Real worker claimed PostgreSQL job and completed attempt 1. DB showed `SUCCEEDED`, nonempty result, `UNVERIFIED` artifact, stale source revision. Worker never connects directly to PostgreSQL. |
| Automation/publication safety | **PASS; gate remains closed** | Attempts to enable automation and enqueue automatic job were rejected (HTTP 422); DB remained `false`/`false`/`PENDING_VALIDATION`. Artifact publish attempt rejected (HTTP 400). Worker did not change recommendation batch count. |
| Responsive/accessibility smoke checks | **PARTIAL PASS** | Chromium checked 390px, 820px, and desktop layouts, no horizontal overflow, labeled form controls, visible keyboard focus, guest mobile login, and accessible logout name. Screen reader, full keyboard audit, contrast, and user usability review **NOT RUN**. |
| Mathematical parity | **PENDING VALIDATION** | Existing evidence unchanged: 43-rating transcription **MATCHED OUTPUT** (5/5); train-264 Top-1 **MISMATCH** (0/22 item IDs). Job success is not parity evidence. |
| Production security/operations | **NOT READY** | Production deployment, backup/restore, load/performance, persistent storage, and distributed rate-limit review not run. `npm audit --omit=dev` found one moderate `fast-uri` advisory. |

## Checks

| Check | Result |
| --- | --- |
| `npm run test:e2e` | **PASS**, 4/4 Playwright Chromium tests; production build also passed inside runner. |
| `npm run test:integration` | **PASS**, 6/6 PostgreSQL integration suites. |
| `npm test` | **PASS**, 15 tests. |
| `python -m unittest discover -s services/recommender/tests -v` | **PASS**, 24 tests. |
| `npm run lint` | **PASS**. |
| `npm run typecheck` | **PASS**. |
| `npx prisma validate` | **PASS**. |
| `git diff --check` | **PASS**. |
| `npm audit --omit=dev` | **FAIL / residual risk:** one moderate advisory for `fast-uri` (3.0.0–3.1.8; URI scheme/path/host normalization issues). No broad dependency update was applied. |

## Database isolation

- Integration suite used `foodrec_test`; browser suite used `foodrec_e2e_test`.
- Both runners applied migrations/seeds without reset. E2E adds users, ratings, snapshots, imports, batches, and jobs; fixture history remains in that test DB.
- No research rows were deleted. No database reset was run. No push or deployment occurred.

## Safety incident and disposition

First E2E runner created `foodrec_e2e_test` but passed the original `DATABASE_URL` to Prisma. Prisma applied five additive migrations to development database `foodrec` and seed created `phase-f-admin-a7f33877-54fa-4df1-9996-8948381b40bb@example.test`. Migrations:

- `20261111000000_recommendation_jobs`
- `20261112000000_rating_change_tracking`
- `20261112010000_recommendation_engine_config`
- `20261112020000_recommendation_scheduler`
- `20261112030000_lock_automatic_recommendations`

Browser stopped before creating USER accounts or ratings. No reset, rollback, or research-row deletion occurred. User explicitly chose to leave migrations and test Admin intact; no cleanup write was made. Runner now derives the final target URL before subprocesses, rejects a non-`_test`/primary target, and reasserts target before every child process. All later E2E runs reported Prisma target `foodrec_e2e_test`; integration runs targeted `foodrec_test`.

## Remaining gates

1. Obtain original Altair exports, confirmed workflow/settings, and intermediate score/neighbor evidence; rerun parity comparison. Keep automatic processing/publication OFF until separately approved migration.
2. Test real research CSV round-trip with confirmed provenance.
3. Complete manual screen-reader, keyboard, contrast, and usability review.
4. Resolve or formally accept `fast-uri` advisory; run production operations/security/performance review before release.
