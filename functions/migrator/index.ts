// migrator: invoked by the deploy (infra/stacks/workers.ts, aws.lambda.Invocation) with
// { action: "migrate" }. It is the only function that holds the master user and the five role
// passwords (3.3). This file is the only place that touches the process: environment, console, pg.
//
// VERIFY at the first staging deploy: that the `host` of the linked Postgres component accepts the
// master user (a proxy lists only the four application roles, infra/lib/functions.ts PROXY_ROLES),
// that Node trusts the certificate chain of that host for sslmode verify-full, and that MIGRATIONS_DIR
// (copyFiles of the Migrator function) holds the migrations folder next to the bundle.
import { bootstrapFirstSuperadmin, createDatabase } from "@tc/db";
import { seedPoolAccount } from "@tc/db/seed-pool";
import { ensureSystemAccounts } from "@tc/core";
import { readMigrationHashes, runMigrations } from "@tc/db/migrate";
import { readMigratorConfig, type MigratorConfig } from "./config";
import { seedLaunchAsOwner } from "./launch-seed";
import { runMigrator, type MigratorReport, type MigratorDeps } from "./run";

export { runMigrator } from "./run";
export type { MigratorReport, MigratorDeps } from "./run";
export {
  readMigratorConfig,
  DB_PASSWORD_SECRETS,
  type MigratorConfig,
  type RoleName,
} from "./config";

/**
 * PRO-4: the wiring of the migrator for a given configuration. The Lambda handler reads it from SST links;
 * the Pro edition (pro/worker/migrate.ts) reads it from a root-only file on the box.
 */
export function migratorDeps(config: MigratorConfig): MigratorDeps {
  return {
    config,
    connect: (url) => {
      const { pool } = createDatabase(url, { max: 1 });
      // A broken idle connection must not crash the process; the next statement reports it.
      pool.on("error", () => {});
      return Promise.resolve({
        query: async (sql, params) => {
          const result = await pool.query(sql, params === undefined ? undefined : [...params]);
          return { rows: result.rows as Record<string, unknown>[] };
        },
        end: () => pool.end(),
      });
    },
    migrate: runMigrations,
    fileHashes: readMigrationHashes,
    seedLaunchData: seedLaunchAsOwner,
    now: () => new Date(),
    ensureSystemAccounts: async (url) => {
      // As the master user, which owns the tables: the platform accounts are written by no other role.
      const { db, pool } = createDatabase(url, { max: 1 });
      pool.on("error", () => {});
      try {
        const { created } = await db.transaction((tx) => ensureSystemAccounts(tx));
        return { created: created.length };
      } finally {
        await pool.end();
      }
    },
    bootstrapFirstAdmin: async (url, sub) => {
      // WPU-Z18: as the master user, which owns admin_users and audit_log. One transaction, pinned to
      // READ COMMITTED (bootstrapFirstSuperadmin refuses any other level): the advisory lock, the count
      // and the insert commit or roll back together.
      const { db, pool } = createDatabase(url, { max: 1 });
      pool.on("error", () => {});
      try {
        return await db.transaction((tx) => bootstrapFirstSuperadmin(tx, sub), {
          isolationLevel: "read committed",
        });
      } finally {
        await pool.end();
      }
    },
    seedPoolAccount: async (url, input) => {
      // WPU-X4: as the master user, which owns pool_accounts and pool_capacity. seedPoolAccount runs
      // begin, its statements and commit (or rollback) itself, so all of them go to ONE checked-out
      // connection (the same discipline as the CLI, scripts/seed-pool-account.mjs). With the audit
      // option: one audit_log row (actor system) in that transaction when it wrote something (M2).
      const { pool } = createDatabase(url, { max: 1 });
      pool.on("error", () => {});
      try {
        const client = await pool.connect();
        try {
          return await seedPoolAccount(
            async (sql, params) => {
              const result = await client.query(
                sql,
                params === undefined ? undefined : [...params],
              );
              return { rows: result.rows as Record<string, unknown>[] };
            },
            input,
            { audit: true },
          );
        } finally {
          client.release();
        }
      } finally {
        await pool.end();
      }
    },
    log: (e) => console.log(JSON.stringify(e)),
  };
}

export const handler = async (event?: unknown): Promise<MigratorReport> =>
  runMigrator(migratorDeps(readMigratorConfig(process.env)), event);
