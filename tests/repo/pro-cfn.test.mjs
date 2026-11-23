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

  it("keeps user pools and the invoice bucket when the stack is deleted", () => {
    for (const n of ["CustomerPool", "AdminPool", "InvoicesBucket"]) {
      expect(R[n].DeletionPolicy, n).toBe("Retain");
    }
  });

  it("quotes ON so that CloudFormation's YAML 1.1 parser does not read a boolean", () => {
    expect(committed).toContain('MfaConfiguration: "ON"');
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

  it("never prints a Cognito client secret", () => {
    expect(sh).not.toMatch(/(say|echo|printf)[^\n]*(CUSTOMER|SIGNUP)_SECRET[^\n]*>&?[12]?\s*$/m);
    expect(sh).toMatch(/read -r -s -p "Client secret/);
  });
});
