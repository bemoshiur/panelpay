import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { URL } from "node:url";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { INSTANCE_TYPES, renderTemplate } from "../../pro/cfn/build-template.mjs";

// PRO-8: the "AMI with CloudFormation" template of the Marketplace listing (pro/cfn).
const clone = (v) => JSON.parse(JSON.stringify(v));
const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");
const committed = read("pro/cfn/panelpay-pro.yaml");
const t = parse(committed, { version: "1.1" });
const pool = parse(read("infra/org/pool-roles.yaml"));
const dns = parse(read("infra/org/dns-account.yaml"));
const R = t.Resources;
const TC = {
  TcProvisioner: pool,
  TcReader: pool,
  TcAccessDetails: pool,
  TcBillingReader: pool,
  TcDnsProvisioner: dns,
  TcDnsReader: dns,
};

describe("pro/cfn/panelpay-pro.yaml", () => {
  it("is the output of the generator (run node pro/cfn/build-template.mjs after a change)", () => {
    expect(committed).toBe(renderTemplate());
  });

  it("gives each Tc role exactly the permissions and the boundary of the SaaS role of the same name", () => {
    for (const [name, source] of Object.entries(TC)) {
      expect(R[name].Properties.RoleName, name).toBe(name);
      expect(R[name].Properties.Policies, name).toEqual(source.Resources[name].Properties.Policies);
      const boundary = R[name].Properties.PermissionsBoundary.Ref;
      const sourceBoundary = clone(source.Resources.PermissionsBoundary.Properties);
      delete sourceBoundary.ManagedPolicyName;
      expect(R[boundary].Properties, name).toEqual(sourceBoundary);
    }
  });

  it("lets only this stack's instance role assume a Tc role, with the stack's ExternalId (R3)", () => {
    for (const name of Object.keys(TC)) {
      const [s, ...more] = R[name].Properties.AssumeRolePolicyDocument.Statement;
      expect(more, name).toEqual([]);
      expect(s.Principal).toEqual({ AWS: { "Fn::Sub": "arn:aws:iam::${AWS::AccountId}:root" } });
      expect(s.Condition.ArnEquals["aws:PrincipalArn"]).toEqual({
        "Fn::GetAtt": ["InstanceRole", "Arn"],
      });
      expect(s.Condition.StringEquals["sts:ExternalId"]).toEqual(t.Outputs.ExternalId.Value);
    }
  });

  it("gives the instance role nothing but the Tc roles, the licence check, its own Cognito reads and invoice uploads", () => {
    const st = R.InstanceRole.Properties.Policies[0].PolicyDocument.Statement;
    expect(st.map((s) => s.Action)).toEqual([
      "sts:AssumeRole",
      ["license-manager:CheckoutLicense", "license-manager:CheckInLicense"],
      "cognito-idp:DescribeUserPoolClient",
      "cognito-idp:AdminGetUser",
      "s3:PutObject",
    ]);
    expect(st[0].Resource.map((r) => r["Fn::Sub"])).toEqual(
      Object.keys(TC).map((n) => `arn:aws:iam::\${AWS::AccountId}:role/${n}`),
    );
    expect(st.every((s) => s.Effect === "Allow")).toBe(true);
    expect(
      st.flatMap((s) => [s.Action].flat()).filter((a) => a.endsWith(":*") || a.startsWith("iam:")),
    ).toEqual([]);
  });

  it("requires IMDSv2 with a hop limit of 1 and an encrypted root volume", () => {
    const d = R.LaunchTemplate.Properties.LaunchTemplateData;
    expect(d.MetadataOptions).toEqual({
      HttpTokens: "required",
      HttpPutResponseHopLimit: 1,
      HttpEndpoint: "enabled",
    });
    expect(d.BlockDeviceMappings[0].Ebs.Encrypted).toBe(true);
  });

  it("references the AMI through a parameter of type AWS::EC2::Image::Id (Marketplace replaces it)", () => {
    expect(t.Parameters.ImageId.Type).toBe("AWS::EC2::Image::Id");
    expect(R.Instance.Properties.ImageId).toEqual({ Ref: "ImageId" });
  });

  it("offers exactly the instance types of the listing", () => {
    expect(t.Parameters.InstanceType.AllowedValues).toEqual(INSTANCE_TYPES);
    expect(INSTANCE_TYPES).toContain(t.Parameters.InstanceType.Default);
  });

  it("opens SSH to the operator's CIDR only, and only 80 and 443 to everyone", () => {
    const ingress = R.SecurityGroup.Properties.SecurityGroupIngress;
    for (const r of ingress) {
      if (r.FromPort === 22) expect(r.CidrIp).toEqual({ Ref: "OperatorCidr" });
      else expect([80, 443]).toContain(r.FromPort);
    }
  });

  it("puts no secret into the user data, and every answer it writes is one tc-install asks for", () => {
    const sub = R.Instance.Properties.UserData["Fn::Base64"]["Fn::Sub"][0];
    const keys = [...sub.matchAll(/^([A-Z_]+)=/gm)].map((m) => m[1]);
    expect(keys.length).toBeGreaterThan(15);
    expect(keys.filter((k) => /SECRET|PASSWORD|TOKEN/.test(k) && k !== "WHMCS_URL")).toEqual([]);
    const sh = read("pro/box/bin/tc-install.sh");
    for (const k of keys) expect(sh, k).toMatch(new RegExp(`\\bask ${k}\\b`));
  });

  it("creates the Route 53 roles only when the buyer enables domains (security review H1, R12)", () => {
    expect(t.Parameters.EnableDomains.Default).toBe("no");
    expect(t.Parameters.DedicatedAccount.AllowedValues).toEqual(["yes"]);
    for (const n of ["TcDnsProvisioner", "TcDnsReader", "DnsBoundary"]) {
      expect(R[n].Condition, n).toBe("DomainsEnabled");
    }
    for (const n of ["TcProvisioner", "TcReader", "TcAccessDetails", "TcBillingReader"]) {
      expect(R[n].Condition, n).toBeUndefined();
    }
  });

  it("refuses an operator CIDR wider than /8 (security review L3)", () => {
    const re = new RegExp(t.Parameters.OperatorCidr.AllowedPattern);
    for (const ok of ["203.0.113.7/32", "10.0.0.0/8"]) expect(re.test(ok), ok).toBe(true);
    for (const bad of ["0.0.0.0/0", "10.0.0.0/7", "203.0.113.7"])
      expect(re.test(bad), bad).toBe(false);
  });

  it("writes the first-boot files root-only (security review L2)", () => {
    const sub = R.Instance.Properties.UserData["Fn::Base64"]["Fn::Sub"][0];
    expect(sub.indexOf("umask 077")).toBeGreaterThan(-1);
    expect(sub.indexOf("umask 077")).toBeLessThan(sub.indexOf("answers.env"));
  });

  it("keeps user pools and the invoice bucket when the stack is deleted", () => {
    for (const n of ["CustomerPool", "AdminPool", "InvoicesBucket"]) {
      expect(R[n].DeletionPolicy, n).toBe("Retain");
    }
  });

  it("quotes ON so that CloudFormation's YAML 1.1 parser does not read a boolean", () => {
    expect(committed).toContain('MfaConfiguration: "ON"');
  });
});

describe("the instance role's Cognito reads (security review L1)", () => {
  it("are used by the installer only, never by the worker, web, admin or functions code", () => {
    const hits = execFileSync(
      "git",
      [
        "grep",
        "-l",
        "-E",
        "DescribeUserPoolClient|AdminGetUser|describe-user-pool-client|admin-get-user",
        "--",
        "apps",
        "functions",
        "packages",
        "pro",
      ],
      { cwd: new URL("../..", import.meta.url), encoding: "utf8" },
    )
      .split("\n")
      .filter(Boolean)
      .sort();
    expect(hits).toEqual([
      "pro/box/README.md",
      "pro/box/bin/tc-install.sh",
      "pro/cfn/build-template.mjs",
      "pro/cfn/panelpay-pro.yaml",
    ]);
  });
});

describe("tc-install, PRO-8", () => {
  const sh = read("pro/box/bin/tc-install.sh");
  it("hands the apps their SST links in single quotes (systemd keeps the JSON as is)", () => {
    for (const name of [
      "CustomerAppClient",
      "CustomerSignUpClient",
      "AuthLimitKey",
      "OtpHashKey",
      "OrderDraftSecret",
      "AdminIpLimitKey",
    ]) {
      expect(sh, name).toMatch(new RegExp(`^SST_RESOURCE_${name}='(\\{|\\$)`, "m"));
    }
  });

  it("sets what the provisioner refuses to start without, and registers the pool account", () => {
    for (const line of [
      "TC_ENV=production",
      "TC_POOL_ACCOUNT_IDS=",
      "TC_POOL_EXTERNAL_ID=",
      "TC_PROBE_SOURCES=",
    ]) {
      expect(sh).toContain(line);
    }
  });

  it("refuses an operator allowlist entry wider than /8 (security review L3)", () => {
    expect(sh).toContain("the operator allowlist must not be wider than /8");
  });

  it("never prints a Cognito client secret", () => {
    expect(sh).not.toMatch(/(say|echo|printf)[^\n]*(CUSTOMER|SIGNUP)_SECRET[^\n]*>&?[12]?\s*$/m);
    expect(sh).toMatch(/read -r -s -p "Client secret/);
  });
});

// PRO-9 (version 1.0.1).
describe("tc-install, PRO-9", () => {
  const sh = read("pro/box/bin/tc-install.sh");

  it("passes every question to ask as KEY, question, pattern (a missing space aborted 1.0.0 under set -u)", () => {
    const calls = sh.split("\n").filter((l) => /^\s*ask\b/.test(l) && !/^\s*ask\(\)/.test(l));
    expect(calls.length).toBeGreaterThan(15);
    for (const l of calls) expect(l, l).toMatch(/^\s*ask [A-Z_]+ ["']/);
  });

  it("parses under bash -n", () => {
    execFileSync("bash", ["-n", "pro/box/bin/tc-install.sh"], {
      cwd: new URL("../..", import.meta.url),
    });
  });

  it("ships the AWS Marketplace product id that License Manager expects as ProductSKU", () => {
    const sku = read("pro/box/product-sku").trim();
    expect(sku).toBe("prod-ill7oycvmsrme");
    expect(sku).toMatch(/^[A-Za-z0-9-]{1,128}$/);
  });

  it("rotates every generated secret on --rotate and gives the five app roles their new passwords", () => {
    expect(sh).toMatch(/"--rotate"/);
    expect(sh).toMatch(/ROTATE=1/);
    for (const role of ["web_rw", "admin_rw", "worker_rw", "migrator", "report_ro"]) {
      expect(sh, role).toContain(role);
    }
    // Same rule as tc_owner (security review H1): only a SCRAM verifier, on stdin.
    expect(sh).toMatch(/alter role %s password '%s'/);
  });
});

describe("the instance role's licence permissions (PRO-9)", () => {
  it("can check out and check in the AWS Marketplace licence, and nothing else of License Manager", () => {
    const docs = JSON.stringify(R.InstanceRole.Properties.Policies);
    const actions = [...docs.matchAll(/license-manager:[A-Za-z]+/g)].map((m) => m[0]).sort();
    expect([...new Set(actions)]).toEqual([
      "license-manager:CheckInLicense",
      "license-manager:CheckoutLicense",
    ]);
  });
});
