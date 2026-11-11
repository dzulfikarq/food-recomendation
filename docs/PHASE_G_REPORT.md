# FoodRec V2 — Phase G Report

**Date:** 2026-11-11

**Release decision:** **NOT READY**. Mathematical parity is blocked; processing and publication gates remain closed. No deploy or push.

## Executive status

| Area | Status | Evidence / blocker |
| --- | --- | --- |
| Python–Altair parity | **BLOCKED / Pending Validation** | Toy comparison matches 5/5 screenshot-transcribed rows; train-264 comparison matches 0/22 Top-1 item IDs. Full train-264 workflow and native Altair CSV/scores are unavailable. No root cause proven. |
| Python holdout prediction | **Diagnostic only** | 42/66 test ratings predicted; 24 unavailable. No Altair holdout output to compare. |
| `fast-uri` | **Patched; production audit clean** | Compatible minimum override 3.1.9 addresses vulnerable versions through 3.1.8. Full audit retains 7 moderate development-tool advisories through nested `minimatch`; no compatible low-risk fix verified. |
| Test database isolation | **Guards implemented; DB-backed validation blocked** | Integration/E2E require separate explicit local `_test` URLs, compare source host/port/credentials, and verify live PostgreSQL identity before migration/seed/test. Current `.env` has no test URL variables; runners abort before database access. |
| Automatic processing | **OFF** | `autoProcessingEnabled=false`, `validationStatus=PENDING_VALIDATION`; database trigger rejects automatic jobs. |
| Publication and worker artifacts | **OFF / UNVERIFIED** | Automatic publication remains false. Worker output remains `UNVERIFIED`; stale output cannot replace active batch. |
| Manual Altair path | **Available** | Manual CSV export/import/validation/publication remains the research workflow; no gate opened. |

## Parity investigation

The audit checked the Python engine, available Altair XML, 264/66/toy CSVs, screenshot transcriptions, and Phase B regression tests. Python implementation was not changed to fit screenshots.

- Training fixture has 264 unique user-food ratings: 22 users × 12; 40 foods; integer IDs and ratings 1–5.
- Holdout has 66 unique ratings: 22 users × 3; all user-food pairs disjoint from training.
- Toy fixture has 43 unique ratings, 8 users, 6 foods. CSV SHA-256 values and detailed validation are in [`RECOMMENDATION_ENGINE_VALIDATION.md`](RECOMMENDATION_ENGINE_VALIDATION.md).
- Parsed identifiers/types and rating ranges are consistent. No data-shape or ID-type cause found in supplied files.
- Per-user train-264 comparison records each screenshot item, Python Top-1, Python rank/score, and selected neighbor overlaps in the validation report. Python predicts 19/22 transcribed screenshot items: 4 tie with Python's best score, 15 rank below it, and 3 receive no score.
- Baseline (`overlap`, min overlap 1, k=3) selected neighbors include 62/66 cosine values of 1.0 and 16/66 pairs with only one common rating. 15/22 users tie at the k=3 neighbor cutoff.
- Diagnostic sweep varied cosine strategy, overlap threshold, k, and weighted/unweighted averaging. No tested combination exceeded 1/22 Top-1 matches. This is not evidence for changing engine parameters.
- The available toy workflow points to a local Altair repository entry; it is not self-contained. No complete train-264 workflow, original CSV export, candidate scores, or actual Altair neighbor list is present. Transcriptions cannot establish operator semantics or parity.

**Conclusion:** root cause remains unproven. Required evidence: exact Altair version/extensions and train-264 workflow; native output CSVs for toy and train-264; per-user neighbors/similarities and pre-ranking candidate scores; confirmed dataset and split provenance. Keep parity **BLOCKED** until reproducible evidence exists.

## Dependency security

`fast-uri` arrived through `prisma → @prisma/dev → @prisma/streams-local → ajv@8.20.0 → fast-uri@3.1.8`. `ajv` accepts `fast-uri ^3.0.1`; minimum patched release 3.1.9 is compatible. Root npm override and package-lock pin to `fast-uri@3.1.9` avoid broad upgrades and `--force`. `npm audit --omit=dev`: **0 vulnerabilities**.

Full `npm audit`: **7 moderate findings** in `@typescript-eslint/{eslint-plugin,parser,type-utils,typescript-estree,utils}`, `typescript-eslint`, and nested `minimatch@10.2.6`; advisory is GHSA-g3hv-75wg-m249 (globparts-amplification DoS), range `>=7.0.0 <11.0.1`. Findings are confined to development tooling. npm's suggested route changes `typescript-eslint` in a breaking dependency transition; it was not applied without compatibility checks. Validate a supported `typescript-eslint` release/override before release, or document explicit acceptance of this dev-only risk.

## Database isolation changes

- `scripts/test-integration.mjs` and `scripts/test-e2e.mjs` no longer derive or silently substitute test URLs. Each requires its dedicated explicit environment variable.
- `scripts/test-database.mjs` checks `_test` suffix, distinct source DB, separate integration/E2E DB names, same local PostgreSQL host/port/credentials, non-production runner environment, and live database/user/server identity. Runners repeat identity checks before migration, seeding, and tests.
- Test child processes receive `FOODREC_TEST_RUN`, explicit original/test URLs, and a pinned `DATABASE_URL`. `lib/env.ts` rejects missing, inconsistent, production-database, or cross-target test configuration during Prisma runtime.
- Integration test setup verifies actual PostgreSQL database/user before test execution. `seed.ts` and `seed-foods.ts` require an `_test` DB or exact `FOODREC_ALLOW_MANUAL_SEED=<database>` acknowledgement. Demo ratings seed requires explicit local `foodrec_test` and refuses `foodrec` and production.
- `tests/database-isolation.test.ts` and `scripts/test-database.test.mjs` cover fail-closed URL checks.
- `.env.example` documents `foodrec_test` and `foodrec_e2e_test`. Configure matching URLs locally before running DB-backed suites.

**Validation boundary:** current `.env` targets `foodrec`; `FOODREC_TEST_DATABASE_URL` and `FOODREC_E2E_DATABASE_URL` are unset. Integration and E2E database suites were not run; runner preflights abort before connecting or creating databases. No Phase G migration, seed, reset, or write was run against `foodrec`; the five Phase F migrations and agreed Admin account remain untouched.

## Checks run

| Check | Result |
| --- | --- |
| `npm run test` | **PASS** — 17 tests, including fail-closed isolation coverage. |
| `npm run lint` | **PASS**. |
| `npm run typecheck` | **PASS**. |
| Python recommender unittest suite | **PASS** — 24 tests. |
| `npm run build` | **PASS** — Prisma generation and Next production build completed with `DATABASE_URL` pinned to `foodrec_test`; `next-env.d.ts` and `tsconfig.json` restored to their pre-build contents. |
| `npm audit --omit=dev` | **PASS** — 0 vulnerabilities; `fast-uri@3.1.9` resolved in dependency tree. |
| `npm audit` | **7 moderate dev-tool findings** — nested `minimatch`; command exits nonzero. |
| Integration / E2E DB suites | **BLOCKED, not run** — explicit URLs unset. Preflight aborts before connecting or creating a database. |

No migration, database seed, reset, deployment, or push was run during Phase G.

## Release blockers and next evidence

1. Obtain original Altair workflow/export and establish mathematical parity against reproducible scores/neighbors.
2. Confirm research dataset provenance and acceptance criteria; get independent validation approval.
3. Run integration and E2E against explicitly configured `_test` targets; verify live DB identity and preserved main DB state.
4. Review the remaining dev-only advisory against compatible `typescript-eslint` releases; resolve it or document explicit risk acceptance before release.
5. Complete manual accessibility review and production operations/security review from Phase F/roadmap.

Until blockers clear, keep processing/publication gates and worker artifact status unchanged.
