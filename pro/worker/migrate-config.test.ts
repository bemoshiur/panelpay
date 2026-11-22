import { describe, expect, it } from "vitest";
import { PRO_MIGRATE_ERROR, proMigratorConfig } from "./migrate-config";

const pw = (c: string) => c.repeat(32);
const TLS = "?sslmode=verify-full&sslrootcert=/etc/tc/pg-ca.crt";
const good = {
  TC_MASTER_URL: `postgres://tc_owner:${pw("o")}@127.0.0.1:5432/ticoncloud${TLS}`,
  TC_MIGRATIONS_DIR: "/opt/tc/current/migrations",
  TC_DB_PASSWORD_WEB_RW: pw("a"),
  TC_DB_PASSWORD_ADMIN_RW: pw("b"),
  TC_DB_PASSWORD_WORKER_RW: pw("c"),
  TC_DB_PASSWORD_MIGRATOR: pw("d"),
  TC_DB_PASSWORD_REPORT_RO: pw("e"),
};

describe("proMigratorConfig", () => {
  it("reads the master URL, the five role passwords and the folder", () => {
    const c = proMigratorConfig(good);
    expect(c.masterUrl).toBe(good.TC_MASTER_URL);
    expect(c.migrationsDir).toBe("/opt/tc/current/migrations");
    expect(c.rolePasswords).toEqual({
      web_rw: pw("a"),
      admin_rw: pw("b"),
      worker_rw: pw("c"),
      migrator: pw("d"),
      report_ro: pw("e"),
    });
    // The Pro stage seeds as production: every product flag starts off (R12).
    expect(c.stage).toBe("pro");
    expect(c.firstAdminSub).toBeUndefined();
  });

  it("passes the first admin sub and the pool settings on raw", () => {
    const c = proMigratorConfig({
      ...good,
      TC_FIRST_ADMIN_SUB: "sub-1",
      TC_POOL_ACCOUNT_IDS: "123456789012",
      TC_POOL_EXTERNAL_ID: "ext",
    });
    expect(c.firstAdminSub).toBe("sub-1");
    expect(c.poolAccountIds).toBe("123456789012");
    expect(c.poolExternalId).toBe("ext");
  });

  it("refuses a database that is not on this box", () => {
    for (const url of [
      `postgres://tc_owner:${pw("o")}@10.0.0.5:5432/ticoncloud${TLS}`,
      `postgres://tc_owner:${pw("o")}@127.0.0.1:5432/ticoncloud`,
      `postgres://tc_owner:${pw("o")}@127.0.0.1:5432/ticoncloud?sslmode=disable`,
      `postgres://tc_owner:${pw("o")}@127.0.0.1:5432/ticoncloud?sslmode=no-verify`,
      `postgres://tc_owner:${pw("o")}@db.example.com:5432/ticoncloud`,
      `mysql://tc_owner:${pw("o")}@127.0.0.1:5432/ticoncloud`,
      "",
    ]) {
      expect(() => proMigratorConfig({ ...good, TC_MASTER_URL: url })).toThrow(PRO_MIGRATE_ERROR);
    }
  });

  it("refuses a weak, missing or repeated role password, and a relative folder", () => {
    expect(() => proMigratorConfig({ ...good, TC_DB_PASSWORD_WEB_RW: "short" })).toThrow(
      PRO_MIGRATE_ERROR,
    );
    expect(() => proMigratorConfig({ ...good, TC_DB_PASSWORD_REPORT_RO: undefined })).toThrow(
      PRO_MIGRATE_ERROR,
    );
    expect(() => proMigratorConfig({ ...good, TC_DB_PASSWORD_ADMIN_RW: pw("a") })).toThrow(
      PRO_MIGRATE_ERROR,
    );
    expect(() => proMigratorConfig({ ...good, TC_MIGRATIONS_DIR: "migrations" })).toThrow(
      PRO_MIGRATE_ERROR,
    );
  });

  it("never puts a value in the error", () => {
    try {
      proMigratorConfig({ ...good, TC_DB_PASSWORD_WEB_RW: "leak-me" });
    } catch (e) {
      expect((e as Error).message).not.toContain("leak-me");
    }
  });
});
