import type { MigratorConfig, RoleName } from "@tc/fn-migrator";

// PRO-4. The migrator configuration of the Pro edition, from /etc/tc/migrate.env (root only, written by
// the installer) instead of SST links. Same shape as readMigratorConfig of functions/migrator, so
// runMigrator is the same code on Lambda and on the box. One fixed error with no value in it (R14, R16).

export const PRO_MIGRATE_ERROR = "migrate: the configuration is not valid";

type Env = Readonly<Record<string, string | undefined>>;

const ROLE_ENV: Readonly<Record<RoleName, string>> = {
  web_rw: "TC_DB_PASSWORD_WEB_RW",
  admin_rw: "TC_DB_PASSWORD_ADMIN_RW",
  worker_rw: "TC_DB_PASSWORD_WORKER_RW",
  migrator: "TC_DB_PASSWORD_MIGRATOR",
  report_ro: "TC_DB_PASSWORD_REPORT_RO",
};

// The installer generates 32+ characters of [A-Za-z0-9]; anything weaker is refused.
const PASSWORD = /^[A-Za-z0-9]{32,128}$/;
// The database is on this box: loopback only (the Pro decision for R2).
// TLS even on loopback (R2: the migrator refuses a session without it): verify-full against the box's own
// certificate, which the installer generates (pro/box/bin/tc-install.sh).
const LOCAL_URL =
  /^postgres(ql)?:\/\/[A-Za-z0-9_]{1,63}:[A-Za-z0-9]{32,128}@(127\.0\.0\.1|localhost|\[::1\]):[0-9]{1,5}\/[A-Za-z0-9_]{1,63}\?sslmode=verify-full&sslrootcert=\/[A-Za-z0-9._/-]+$/;

const text = (v: string | undefined) => (v === undefined || v === "" ? undefined : v);

export function proMigratorConfig(env: Env): MigratorConfig {
  const fail = (): never => {
    throw new Error(PRO_MIGRATE_ERROR);
  };
  const masterUrl = env["TC_MASTER_URL"] ?? "";
  if (!LOCAL_URL.test(masterUrl)) return fail();
  const migrationsDir = env["TC_MIGRATIONS_DIR"] ?? "";
  if (!migrationsDir.startsWith("/") || migrationsDir.includes("..")) return fail();

  const rolePasswords = {} as Record<RoleName, string>;
  for (const [role, key] of Object.entries(ROLE_ENV) as [RoleName, string][]) {
    const value = env[key];
    if (value === undefined || !PASSWORD.test(value)) return fail();
    rolePasswords[role] = value;
  }
  // Each role its own password: a leak of one app's env file must not open another role.
  if (new Set(Object.values(rolePasswords)).size !== 5) return fail();

  return {
    masterUrl,
    migrationsDir,
    rolePasswords,
    stage: "pro",
    firstAdminSub: text(env["TC_FIRST_ADMIN_SUB"]),
    poolAccountIds: text(env["TC_POOL_ACCOUNT_IDS"]),
    poolExternalId: text(env["TC_POOL_EXTERNAL_ID"]),
  };
}
