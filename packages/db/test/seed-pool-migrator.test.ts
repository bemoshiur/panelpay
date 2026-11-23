import { describe, expect, it } from "vitest";
import {
  DEFAULT_LIMITS,
  MIGRATOR_POOL_NAME,
  MIGRATOR_POOL_TIER,
  accountSuffix,
  isPoolSeedConflict,
  planPoolSeed,
  poolAccountDecision,
  PoolSeedConflictError,
} from "../seed-pool";

// WPU-X4: the decision of the migrator step "pool_account", before any database statement. Pure: no
// PostgreSQL. Placeholder ids only.
const ID = "111122223333";
const EXT = "tc-pool-ext-placeholder-0001";

describe("poolAccountDecision (pure)", () => {
  it("runs for one 12-digit id and a well-formed ExternalId, with the fixed alias, tier new and no limits", () => {
    const plan = poolAccountDecision({ stage: "staging", accountIds: ID, externalId: EXT });
    expect(plan).toEqual({
      kind: "run",
      input: {
        stage: "staging",
        confirmProduction: false,
        awsAccountId: ID,
        externalId: EXT,
        name: "pool-1",
        tier: "new",
      },
    });
    expect(MIGRATOR_POOL_NAME).toBe("pool-1");
    expect(MIGRATOR_POOL_TIER).toBe("new");
    // the seed's own placeholder limits, unchanged
    if (plan.kind !== "run") throw new Error("unreachable");
    expect(planPoolSeed(plan.input).cells.find((c) => c.quotaCode === "instance_vcpu")?.limit).toBe(
      DEFAULT_LIMITS.instance_vcpu,
    );
  });

  it("confirms production only for the production stage of the deploy", () => {
    const plan = poolAccountDecision({ stage: "production", accountIds: ID, externalId: EXT });
    expect(plan.kind === "run" && plan.input.confirmProduction).toBe(true);
    if (plan.kind === "run") expect(() => planPoolSeed(plan.input)).not.toThrow();
  });

  it("runs for the Pro edition (stage pro: the buyer's one account), without the production confirmation", () => {
    const plan = poolAccountDecision({ stage: "pro", accountIds: ID, externalId: EXT });
    expect(plan).toMatchObject({ kind: "run", input: { stage: "pro", confirmProduction: false } });
    if (plan.kind === "run") expect(() => planPoolSeed(plan.input)).not.toThrow();
  });

  it("trims the id list like readStageConfig", () => {
    const plan = poolAccountDecision({ stage: "staging", accountIds: ` ${ID} ,`, externalId: EXT });
    expect(plan.kind === "run" && plan.input.awsAccountId).toBe(ID);
  });

  it("is not configured without an ExternalId", () => {
    for (const externalId of [undefined, "", "   "]) {
      expect(poolAccountDecision({ stage: "staging", accountIds: ID, externalId })).toEqual({
        kind: "skip",
        decision: "skipped: not configured",
      });
    }
  });

  it("does nothing for several pool accounts (multi-account onboarding stays manual)", () => {
    expect(
      poolAccountDecision({ stage: "staging", accountIds: `${ID},444455556666`, externalId: EXT }),
    ).toEqual({ kind: "skip", decision: "skipped: several pool accounts" });
  });

  it("is malformed for a bad ExternalId, a bad or missing id, or an unknown stage", () => {
    for (const over of [
      { externalId: "short-ext-id" }, // under 16 characters (pool-roles.yaml AllowedPattern)
      { externalId: "tc pool ext with spaces" },
      { externalId: "tc-pool-ext-placeholder-0001\n" },
      { externalId: "x".repeat(1225) },
      { accountIds: "12345678901" },
      { accountIds: "1111222233334" },
      { accountIds: "" },
      { accountIds: undefined },
      { stage: "local" },
      { stage: undefined },
      { stage: "Production" },
    ]) {
      expect(
        poolAccountDecision({ stage: "staging", accountIds: ID, externalId: EXT, ...over }),
        JSON.stringify(over).slice(0, 60),
      ).toEqual({ kind: "skip", decision: "skipped: malformed" });
    }
  });

  it("accepts the full character set of the CloudFormation pattern at both length limits", () => {
    for (const externalId of ["A-z0+=,.@:/_9abcd", "a".repeat(16), "b".repeat(1224)]) {
      expect(poolAccountDecision({ stage: "staging", accountIds: ID, externalId }).kind).toBe(
        "run",
      );
    }
  });
});

describe("accountSuffix and the conflict error", () => {
  it("keeps the last 4 digits only", () => {
    expect(accountSuffix(ID)).toBe("3333");
  });

  it("marks the two conflict refusals of the seed, with the seed's fixed text", () => {
    const e = new PoolSeedConflictError("x");
    expect(e.message).toBe("seed-pool: x");
    expect(isPoolSeedConflict(e)).toBe(true);
    expect(isPoolSeedConflict(new Error("seed-pool: x"))).toBe(false);
    expect(isPoolSeedConflict("seed-pool: x")).toBe(false);
  });
});
