import { migratorDeps, runMigrator } from "@tc/fn-migrator";
import { proMigratorConfig } from "./migrate-config";

// PRO-4. Entry of `tc-migrate` (run by the installer and by each update before the apps restart). The same
// runMigrator as the Lambda: roles, forward-only migrations, launch seed (stage "pro" = production flags,
// all off), system accounts, first superadmin. Output is the migrator's own fixed JSON lines (R14).

async function main(): Promise<void> {
  let config;
  try {
    config = proMigratorConfig(process.env);
  } catch {
    console.log(JSON.stringify({ event: "migrate_failed", stage: "config" }));
    process.exit(1);
  }
  const report = await runMigrator(migratorDeps(config), { action: "migrate" });
  console.log(JSON.stringify({ event: "migrate_done", report }));
}

main().catch(() => {
  console.log(JSON.stringify({ event: "migrate_failed", stage: "run" }));
  process.exit(1);
});
