# FoodRec research deployment and recovery runbook

**Prepared, not executed.** No production database, backup, migration, deployment, or study was touched. Use only after separate written release approval and completion of `RESEARCH_COLLECTION_LAUNCH_CHECKLIST.md`. Do not use real participant data for rehearsal.

## Preconditions

- Release owner and second reviewer approve code SHA, migration SQL, maintenance window, recovery point, and rollback owner.
- CI checks pass; staging smoke test passes with synthetic accounts/data. Engine gates remain `OFF` / `PENDING_VALIDATION`; no study is opened as part of deployment.
- Secret manager supplies separate staging/production `DATABASE_URL`, `AUTH_SECRET`, `AUTH_URL`, and private absolute `FOODREC_STORAGE_DIR`. Never print, paste, or pass secret values as command-line arguments.
- Provision `FOODREC_STORAGE_DIR/research-exports` persistently, owned by application/backup principals with least privilege, before first export or backup.
- PostgreSQL CLI access uses protected `PGSERVICEFILE` and `PGPASSFILE`; backup directory is encrypted at rest, access-restricted, and outside repository/web root. Windows hosts need explicit restrictive NTFS ACLs; POSIX modes below do not secure Windows ACLs.
- Freeze research mutations, exports, and withdrawal processing while taking the paired DB/filesystem checkpoint, or use platform snapshots with equivalent consistency.

## Create and verify backup

Run on approved Linux backup host. Inject `PGSERVICEFILE`/`PGPASSFILE` via secret manager; configure service `foodrec-production` to target only the approved database. Set backup/storage paths through deployment configuration, not shell history.

```sh
set -eu
umask 077
: "${BACKUP_DIR:?set to encrypted, access-restricted backup volume}"
: "${FOODREC_STORAGE_DIR:?set to persistent private export directory}"
case "$FOODREC_STORAGE_DIR" in /*) ;; *) echo "FOODREC_STORAGE_DIR must be absolute" >&2; exit 1;; esac
test -d "$FOODREC_STORAGE_DIR/research-exports"
install -d -m 700 "$BACKUP_DIR"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
DB_BACKUP="$BACKUP_DIR/foodrec-$STAMP.dump"
EXPORT_BACKUP="$BACKUP_DIR/research-exports-$STAMP.tar"
EXPORT_HASHES="$BACKUP_DIR/research-exports-$STAMP.sha256"

psql --dbname="service=foodrec-production" -XAtc 'select current_database(), inet_server_addr(), current_user'
pg_dump --dbname="service=foodrec-production" --format=custom --no-owner --no-privileges --file="$DB_BACKUP"
pg_restore --list "$DB_BACKUP" >/dev/null
tar -C "$FOODREC_STORAGE_DIR" -cf "$EXPORT_BACKUP" research-exports
(cd "$FOODREC_STORAGE_DIR" && find research-exports -type f -name '*.csv' -print0 | sort -z | xargs -0 -r sha256sum) > "$EXPORT_HASHES"
chmod 600 "$DB_BACKUP" "$EXPORT_BACKUP" "$EXPORT_HASHES"
(cd "$BACKUP_DIR" && sha256sum "$(basename "$DB_BACKUP")" "$(basename "$EXPORT_BACKUP")" "$(basename "$EXPORT_HASHES")" > "checksums-$STAMP.sha256")
chmod 600 "$BACKUP_DIR/checksums-$STAMP.sha256"
```

Store DB dump, file archive, hash list, and checksum manifest together under approved encrypted backup policy. Record checkpoint time and retention owner, not participant details. Keep paired DB/filesystem checkpoint; a DB-only backup is insufficient.

## Restore rehearsal (isolated only)

Automated local check uses explicit local `FOODREC_TEST_DATABASE_URL`, verifies separate `_test` target/server, dumps source `_test`, restores into disposable `foodrec_restore_*_test`, compares every public table row count, then drops scratch DB and dump:

```sh
npm run test:db-restore
```

For an approved artifact rehearsal, use a separate encrypted recovery host, never production. Provision protected `foodrec-recovery-admin` and `foodrec-restore` PostgreSQL services; configure the latter for `foodrec_restore_test` on the recovery host. Create and confirm target before restore:

```sh
createdb --maintenance-db="service=foodrec-recovery-admin" foodrec_restore_test
test "$(psql --dbname="service=foodrec-restore" -XAtc 'select current_database()')" = "foodrec_restore_test"
```

Restore DB and files into empty private scratch paths:

```sh
pg_restore --exit-on-error --no-owner --no-privileges --dbname="service=foodrec-restore" "$DB_BACKUP"
install -d -m 700 "$RESTORE_STORAGE_DIR"
test -z "$(find "$RESTORE_STORAGE_DIR" -mindepth 1 -print -quit)"
tar -xf "$EXPORT_BACKUP" -C "$RESTORE_STORAGE_DIR"
(cd "$RESTORE_STORAGE_DIR" && sha256sum -c "$EXPORT_HASHES")
```

Verify migration status, expected schema/table counts, application read-only smoke test, export checksums, and private storage ACL. Before any restored export can be downloaded, reconcile withdrawals/revocations recorded after checkpoint; old backups can reintroduce withdrawn data. Remove disposable recovery data under the approved retention policy. Promoting a recovery copy to production requires separate incident approval; this runbook does not authorize it.

## Deploy

1. CI: install from lockfile; run `npm run lint`, `npm test`, `npm run typecheck`, `npm run test:integration`, `npm run test:e2e`, `npm run test:db-restore`, and production-dependency audit. Integration/E2E/restore runners must use isolated local `_test` DBs only. Build with non-production configuration.
2. Staging: deploy exact release SHA; inject staging secrets; run `npx prisma migrate status`, then `npm run db:migrate:deploy`; verify status and run synthetic-data smoke/security/accessibility checks. Do not run seed/demo scripts.
3. Production, only after separate authorization: confirm service/database identity through protected release configuration and read-only `npx prisma migrate status`; recheck backup checksums, paired storage, open-study state, gates, and reviewer approval.
4. Apply only reviewed migrations with `npm run db:migrate:deploy` using production secret injection. Deploy the approved application SHA. Never use `prisma migrate dev`, `db push`, `migrate reset`, integration/E2E runners, or demo seeds on production.
5. Run read-only Admin/dashboard and service health checks. Do not create a smoke study, consent, rating, or export in production. Keep real collection closed until researcher approval; confirm engine automation/publication remain off and validation remains pending.

Production log collection, DB/storage/backup alerts, and on-call ownership must be configured and tested by the deployment operator. Local Docker healthcheck and sanitized application logs are not production monitoring.

## Rollback

- Stop release/traffic on failed migration or smoke check; preserve logs without request bodies, secrets, or participant values. Do not blindly retry a partially failed migration.
- If no participant data exists, roll back the application artifact only when schema compatibility is confirmed. Keep additive DB migrations; repair forward rather than dropping tables/triggers or editing migration history.
- After collection begins, close the study through Admin and pause writes. Do not downgrade/drop research tables or restore an older checkpoint as routine rollback. Preserve consent/withdrawal/export audit and deploy a forward fix or compatible application artifact.
- Disaster restore is incident response, not code rollback: restore paired DB/files into isolation first, reconcile later withdrawals/revocations and external copies with the data owner, verify ACL/checksums/gates, then obtain separate approval before any production recovery action.
