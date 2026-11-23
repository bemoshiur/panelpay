import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { URL } from "node:url";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { INSTANCE_TYPES, renderTemplate } from "../../pro/cfn/build-template.mjs";

// PRO-8: the "AMI with CloudFormation" template of the Marketplace listing (pro/cfn).
const clone = (v) => JSON.parse(JSON.stringify(v));
const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");
const committed = read("pro/cfn/tryawsnow-pro.yaml");
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

describe("pro/cfn/tryawsnow-pro.yaml", () => {
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
      "license-manager:CheckoutLicense",
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
      "pro/cfn/tryawsnow-pro.yaml",
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
