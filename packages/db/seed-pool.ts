// WPU-G1 (P1, P2, P5): the idempotent registration of the single pool account and its capacity rows.
// Pure plan plus one transaction. No import at run time, so that `scripts/seed-pool-account.mjs`
// loads this file directly (Node strips the types). It writes pool_accounts and pool_capacity as the
// table owner, never an application role, and holds no credential: an AWS account id, a plain
// ExternalId (6.3) and limits. It never changes a row that exists: an operator's limit and the
// inventory's `used` stay (R5-style append-only spirit for operational data, R7 idempotent by the
// unique keys of both tables). The admin app (`addPoolAccount`, `setCapacityLimit`) stays the audited
// path for later changes (R10); this is the bootstrap for a stage with no admin yet.

/** Same list as QUOTA_CODES of schema/provisioning.ts; a test compares the two. */
const QUOTA_CODE_LIST = [
  "instance_vcpu",
  "static_ip",
  "database",
  "load_balancer",
  "container_service",
  "certificate_active",
  "certificate_365d",
  "disk_gb",
  "bucket",
  "distribution",
] as const;
export type SeedQuotaCode = (typeof QUOTA_CODE_LIST)[number];

/** The three launch Regions (spec 10, packages/aws roles.ts). */
export const LAUNCH_REGIONS = ["ap-southeast-1", "ap-south-1", "us-east-1"] as const;

/** AWS counts these two per account (capacity-keys.ts: ACCOUNT_WIDE_CODES, ACCOUNT_REGION). */
const ACCOUNT_WIDE: readonly SeedQuotaCode[] = ["bucket", "distribution"];
const ACCOUNT_REGION = "global";

/**
 * PLACEHOLDERS, deliberately low, for a new account (V4): replace them with the quotas recorded in
 * the AWS console (pool-account-onboarding step 6) through `--limits` or `setCapacityLimit`. A limit
 * above the real AWS quota sells what AWS then refuses (gap P3), so these are not the documented
 * defaults of any plan. VERIFY every value in tc-pool-dev before production.
 */
export const DEFAULT_LIMITS: Readonly<Record<SeedQuotaCode, number>> = Object.freeze({
  instance_vcpu: 20,
  static_ip: 5,
  database: 2,
  load_balancer: 2,
  container_service: 2,
  certificate_active: 5,
  // 20 per Region in the last 365 days, fixed (spec 10.2)
  certificate_365d: 20,
  disk_gb: 500,
  bucket: 5,
  distribution: 5,
});

// "pro": the Pro edition (one EC2 instance in the buyer's account, pro/worker/migrate-config.ts).
const STAGES = ["local", "staging", "production", "pro"] as const;
const TIERS = ["new", "trusted"] as const;
const ACCOUNT_ID = /^[0-9]{12}$/;
const EXTERNAL_ID = /^[\w+=,.@:/-]{2,1224}$/;
const NAME = /^[a-z][a-z0-9-]{2,39}$/;
const ROLE_ARN = /^arn:aws:iam::[0-9]{12}:role\/[\w+=,.@/-]{1,128}$/;

export interface SeedPoolInput {
  /** `local`, `staging` or `production` (an allow-list: anything else, a mis-spelt production included, is refused). */
  readonly stage: string;
  /** Required for `production`. The script passes it only for an explicit flag. */
  readonly confirmProduction?: boolean;
  readonly awsAccountId: string;
  /** The plain ExternalId of the roles of this account (not a secret, 6.3). */
  readonly externalId: string;
  /** The alias, for example `tc-pool-1`. */
  readonly name: string;
  readonly tier?: string;
  readonly roleArn?: string;
  /** Per quota code; the same limit for every Region of that code. */
  readonly limits?: Readonly<Record<string, unknown>>;
}

export interface PlannedCell {
  readonly region: string;
  readonly quotaCode: SeedQuotaCode;
  readonly limit: number;
}

export interface PoolSeedPlan {
  readonly account: {
    readonly awsAccountId: string;
    readonly name: string;
    readonly tier: string;
    readonly roleArn: string;
    readonly externalId: string;
  };
  readonly cells: readonly PlannedCell[];
}

function refuse(message: string): never {
  // A fixed text: the rejected value (maybe a mistyped ExternalId) is never echoed.
  throw new Error(`seed-pool: ${message}`);
}

/**
 * WPU-X4: the two refusals that mean "a row exists that does not match the input" (not a database
 * failure). Same `seed-pool: <fixed text>` message as every other refusal, so the CLI prints the same;
 * the migrator tells it apart by its name (isPoolSeedConflict).
 */
export class PoolSeedConflictError extends Error {
  constructor(message: string) {
    super(`seed-pool: ${message}`);
    this.name = "PoolSeedConflictError";
  }
}

export function isPoolSeedConflict(error: unknown): boolean {
  return error instanceof Error && error.name === "PoolSeedConflictError";
}

function conflict(message: string): never {
  throw new PoolSeedConflictError(message);
}

function isQuotaCode(value: string): value is SeedQuotaCode {
  return (QUOTA_CODE_LIST as readonly string[]).includes(value);
}

export function planPoolSeed(input: SeedPoolInput): PoolSeedPlan {
  if (typeof input.stage !== "string" || !(STAGES as readonly string[]).includes(input.stage)) {
    refuse("the stage must be local, staging, production or pro.");
  }
  if (input.stage === "production" && input.confirmProduction !== true) {
    refuse("production needs the explicit confirmation flag; nothing was written.");
  }
  if (typeof input.awsAccountId !== "string" || !ACCOUNT_ID.test(input.awsAccountId)) {
    refuse("the AWS account id must be 12 digits.");
  }
  if (typeof input.externalId !== "string" || !EXTERNAL_ID.test(input.externalId)) {
    refuse("the ExternalId is missing or has characters that IAM does not allow.");
  }
  if (typeof input.name !== "string" || !NAME.test(input.name)) {
    refuse("the name must be 3 to 40 characters of a-z, 0-9 and a hyphen, starting with a letter.");
  }
  const tier = input.tier ?? "new";
  if (!(TIERS as readonly string[]).includes(tier)) refuse("the tier must be new or trusted.");
  const roleArn = input.roleArn ?? `arn:aws:iam::${input.awsAccountId}:role/TcProvisioner`;
  if (typeof roleArn !== "string" || !ROLE_ARN.test(roleArn)) refuse("the role ARN is not valid.");

  const limits: Record<SeedQuotaCode, number> = { ...DEFAULT_LIMITS };
  for (const [code, value] of Object.entries(input.limits ?? {})) {
    if (!isQuotaCode(code)) refuse("a limit names no quota code.");
    if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
      refuse("a limit must be a whole number from 0 up.");
    }
    limits[code] = value;
  }

  const cells: PlannedCell[] = [];
  for (const quotaCode of QUOTA_CODE_LIST) {
    if (ACCOUNT_WIDE.includes(quotaCode)) {
      cells.push({ region: ACCOUNT_REGION, quotaCode, limit: limits[quotaCode] });
      continue;
    }
    for (const region of LAUNCH_REGIONS) {
      cells.push({ region, quotaCode, limit: limits[quotaCode] });
    }
  }
  return {
    account: {
      awsAccountId: input.awsAccountId,
      name: input.name,
      tier,
      roleArn,
      externalId: input.externalId,
    },
    cells,
  };
}

/**
 * `--stage <name> --aws-account-id <12 digits> --external-id <value> --name <alias>
 * [--tier new|trusted] [--role-arn <arn>] [--limits '{"instance_vcpu":40}'] [--confirm-production]`.
 * The stage falls back to the STAGE variable. Unknown flags are refused.
 */
export function parseSeedArgs(
  argv: readonly string[],
  env: Readonly<Record<string, string | undefined>>,
): SeedPoolInput {
  const out: {
    stage: string;
    confirmProduction?: boolean;
    awsAccountId: string;
    externalId: string;
    name: string;
    tier?: string;
    roleArn?: string;
    limits?: Record<string, unknown>;
  } = { stage: env["STAGE"] ?? "", awsAccountId: "", externalId: "", name: "" };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (flag === "--confirm-production") {
      out.confirmProduction = true;
      continue;
    }
    const value = argv[i + 1];
    if (value === undefined) refuse("a flag has no value.");
    i += 1;
    if (flag === "--stage") out.stage = value;
    else if (flag === "--aws-account-id") out.awsAccountId = value;
    else if (flag === "--external-id") out.externalId = value;
    else if (flag === "--name") out.name = value;
    else if (flag === "--tier") out.tier = value;
    else if (flag === "--role-arn") out.roleArn = value;
    else if (flag === "--limits") {
      let parsed: unknown;
      try {
        parsed = JSON.parse(value);
      } catch {
        refuse("--limits must be a JSON object of quota code to whole number.");
      }
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        refuse("--limits must be a JSON object of quota code to whole number.");
      }
      out.limits = parsed as Record<string, unknown>;
    } else refuse("an unknown flag was given.");
  }
  return out;
}

/** Runs one statement on ONE connection (begin and commit must share it). */
export type SeedQuery = (
  sql: string,
  params?: readonly unknown[],
) => Promise<{ rows: readonly Record<string, unknown>[] }>;

export interface SeedPoolResult {
  readonly accountId: string;
  readonly accountCreated: boolean;
  readonly cellsCreated: number;
  readonly cellsExisting: number;
}

/** WPU-X4 review M2: the audit row of a bootstrap by the migrator (the same shape as the first superadmin's). */
export const POOL_BOOTSTRAP_ACTION = "pool_account.bootstrap";
export const POOL_BOOTSTRAP_REASON = "pool account bootstrap";

export interface SeedPoolOptions {
  /**
   * Write one audit_log row (actor `system`) in the same transaction when the run created the account
   * or a capacity cell. The migrator sets it; the CLI does not (its operator writes the Log section of
   * the runbook). The row holds the alias, tier, status, the last 4 digits of the account id and the
   * counts, never the ExternalId (R14).
   */
  readonly audit?: boolean;
}

export async function seedPoolAccount(
  query: SeedQuery,
  input: SeedPoolInput,
  options: SeedPoolOptions = {},
): Promise<SeedPoolResult> {
  const plan = planPoolSeed(input);
  const { account } = plan;
  await query("begin");
  try {
    const sameName = await query(
      "select id from pool_accounts where name = $1 and aws_account_id <> $2",
      [account.name, account.awsAccountId],
    );
    if (sameName.rows.length > 0) conflict("the name belongs to another AWS account.");

    const inserted = await query(
      `insert into pool_accounts (id, aws_account_id, name, tier, role_arn, external_id, status)
       values (gen_random_uuid(), $1, $2, $3, $4, $5, 'active')
       on conflict (aws_account_id) do nothing
       returning id`,
      [account.awsAccountId, account.name, account.tier, account.roleArn, account.externalId],
    );
    let accountId: string;
    let accountCreated = false;
    if (inserted.rows.length === 1) {
      accountId = inserted.rows[0]?.id as string;
      accountCreated = true;
    } else {
      const found = await query(
        "select id, name, tier, external_id from pool_accounts where aws_account_id = $1",
        [account.awsAccountId],
      );
      const row = found.rows[0];
      if (row === undefined) refuse("the account could not be read back.");
      if (
        row.name !== account.name ||
        row.tier !== account.tier ||
        row.external_id !== account.externalId
      ) {
        conflict(
          "the account exists and differs in name, tier or ExternalId; nothing was changed.",
        );
      }
      accountId = row.id as string;
    }

    const added = await query(
      `insert into pool_capacity (id, pool_account_id, region, quota_code, quota_limit)
       select gen_random_uuid(), $1::uuid, c.region, c."quotaCode", c."limit"
         from jsonb_to_recordset($2::jsonb) as c(region text, "quotaCode" text, "limit" int)
       on conflict (pool_account_id, region, quota_code) do nothing
       returning id`,
      [accountId, JSON.stringify(plan.cells)],
    );
    const cellsCreated = added.rows.length;
    const cellsExisting = plan.cells.length - cellsCreated;
    if (options.audit === true && (accountCreated || cellsCreated > 0)) {
      // The columns and values of insertAudit (repositories/audit-log.ts) for a system actor: no
      // actor id, no IP, no user agent, the reason with before and after in metadata (R10 shape).
      // Plain SQL because this file has no import at run time (the CLI loads it directly).
      const metadata = {
        reason: POOL_BOOTSTRAP_REASON,
        before: accountCreated ? null : { cellsExisting },
        after: {
          name: account.name,
          tier: account.tier,
          status: "active",
          accountSuffix: accountSuffix(account.awsAccountId),
          accountCreated,
          cellsCreated,
        },
      };
      await query(
        `insert into audit_log (id, actor_type, actor_id, action, target_type, target_id, ip, user_agent, metadata)
         values (gen_random_uuid(), 'system', null, $1, 'pool_account', $2, null, null, $3::jsonb)`,
        [POOL_BOOTSTRAP_ACTION, accountId, JSON.stringify(metadata)],
      );
    }
    await query("commit");
    return { accountId, accountCreated, cellsCreated, cellsExisting };
  } catch (error) {
    await query("rollback");
    throw error;
  }
}

// ---- WPU-X4: the bootstrap by the migrator at deploy time ---------------------------------------------
// The database is private (R2) and has no bastion, so on staging and production the CLI above cannot
// reach it. The migrator (functions/migrator, in the VPC, master user) runs this decision at every deploy
// and, for a run plan, seedPoolAccount above with the same idempotent SQL. Only the one-account stage is
// covered: several pool accounts stay with the CLI and the audited admin path.

/** The fixed alias and tier of the account that the migrator registers. */
export const MIGRATOR_POOL_NAME = "pool-1";
export const MIGRATOR_POOL_TIER = "new";

/** The AllowedPattern of the ExternalId parameter of infra/org/pool-roles.yaml (stricter than EXTERNAL_ID). */
const POOL_ROLES_EXTERNAL_ID = /^[A-Za-z0-9+=,.@:/_-]{16,1224}$/;
/**
 * The stages that register a pool account: the two a deploy hands the migrator in TC_STAGE
 * (infra/lib/stage.ts, tcStage), and "pro", the stage of the Pro edition's migrator
 * (pro/worker/migrate-config.ts), whose one pool account is the buyer's own account.
 */
const DEPLOY_STAGES = ["staging", "production", "pro"] as const;

export type PoolAccountDecision =
  | "inserted"
  | "skipped: exists"
  | "skipped: not configured"
  | "skipped: several pool accounts"
  | "skipped: malformed"
  // review round 1: a row that differs (PoolSeedConflictError) is left as it is; the deploy goes on.
  | "skipped: differs";

export type PoolAccountPlan =
  | {
      readonly kind: "skip";
      readonly decision:
        "skipped: not configured" | "skipped: several pool accounts" | "skipped: malformed";
    }
  | { readonly kind: "run"; readonly input: SeedPoolInput };

export interface PoolAccountRaw {
  /** TC_STAGE of the function: staging or production. */
  readonly stage?: string | undefined;
  /** TC_POOL_ACCOUNT_IDS as the deploy has it: a comma list of 12-digit ids. */
  readonly accountIds?: string | undefined;
  /** TC_POOL_EXTERNAL_ID: the plain ExternalId of the tc-pool-roles stack (not a secret, 6.3). */
  readonly externalId?: string | undefined;
}

/**
 * The decision before the database. No ExternalId: not configured. More than one id: left to the manual
 * path. Anything not well formed: malformed. All three write nothing (R16). A production deploy that
 * carries the variable is the explicit confirmation that the CLI asks for with --confirm-production.
 */
export function poolAccountDecision(raw: PoolAccountRaw): PoolAccountPlan {
  const externalId = raw.externalId;
  if (externalId === undefined || externalId.trim() === "") {
    return { kind: "skip", decision: "skipped: not configured" };
  }
  const ids = (raw.accountIds ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value !== "");
  if (ids.length > 1) return { kind: "skip", decision: "skipped: several pool accounts" };
  const awsAccountId = ids[0];
  const stage = raw.stage;
  if (
    awsAccountId === undefined ||
    !ACCOUNT_ID.test(awsAccountId) ||
    !POOL_ROLES_EXTERNAL_ID.test(externalId) ||
    stage === undefined ||
    !(DEPLOY_STAGES as readonly string[]).includes(stage)
  ) {
    return { kind: "skip", decision: "skipped: malformed" };
  }
  return {
    kind: "run",
    input: {
      stage,
      confirmProduction: stage === "production",
      awsAccountId,
      externalId,
      name: MIGRATOR_POOL_NAME,
      tier: MIGRATOR_POOL_TIER,
    },
  };
}

/** At most the last 4 digits of an AWS account id: the only part a log may hold (R14). */
export function accountSuffix(awsAccountId: string): string {
  return awsAccountId.slice(-4);
}
