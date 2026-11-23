// PRO-8. Builds pro/cfn/tryawsnow-pro.yaml, the "AMI with CloudFormation" template of the Marketplace
// listing: one stack in the buyer's account that makes everything TryAWS.now Pro needs and launches the
// instance. The Tc roles are copied from infra/org/pool-roles.yaml and infra/org/dns-account.yaml (same
// permissions, same boundaries); only the trust changes: instead of the Lambda roles of a control plane,
// the instance role of this stack, in this account, with the stack's ExternalId (R3).
//
//   node pro/cfn/build-template.mjs          # writes the template
//   node pro/cfn/build-template.mjs --check  # exits 1 when the committed template differs
//
// tests/repo/pro-cfn.test.mjs runs the check, so a change to the SaaS roles cannot leave Pro behind.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import YAML from "yaml";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT = join(ROOT, "pro", "cfn", "tryawsnow-pro.yaml");
const load = (p) => YAML.parse(readFileSync(join(ROOT, p), "utf8"));

// Plain JSON data: a JSON round trip is a deep copy.
const clone = (v) => JSON.parse(JSON.stringify(v));

const pool = load("infra/org/pool-roles.yaml");
const dns = load("infra/org/dns-account.yaml");

// The instance types of the listing (Marketplace: the template's list must match the product's).
export const INSTANCE_TYPES = [
  "t3.small",
  "t3.medium",
  "t3.large",
  "t3.xlarge",
  "t3a.small",
  "t3a.medium",
  "t3a.large",
  "m6i.large",
  "m7i.large",
];

// The ExternalId of this install: the UUID at the end of the stack id. Unique per stack, 36 characters
// of [0-9a-f-], inside the AllowedPattern of pool-roles.yaml. Not a secret (6.3).
const EXTERNAL_ID = { "Fn::Select": [2, { "Fn::Split": ["/", { Ref: "AWS::StackId" }] }] };

// The SaaS trust names the control plane's function roles; Pro has one caller, the instance role.
function proTrust(sid) {
  return {
    Version: "2012-10-17",
    Statement: [
      {
        Sid: sid,
        Effect: "Allow",
        Principal: { AWS: { "Fn::Sub": "arn:aws:iam::${AWS::AccountId}:root" } },
        Action: "sts:AssumeRole",
        Condition: {
          ArnEquals: { "aws:PrincipalArn": { "Fn::GetAtt": ["InstanceRole", "Arn"] } },
          StringEquals: { "sts:ExternalId": EXTERNAL_ID },
        },
      },
    ],
  };
}

function copyRole(source, name, boundary) {
  const role = clone(source.Resources[name]);
  delete role.Condition;
  role.Properties.MaxSessionDuration = 3600;
  role.Properties.PermissionsBoundary = { Ref: boundary };
  role.Properties.AssumeRolePolicyDocument = proTrust("InstanceRoleOfThisStack");
  return role;
}

function copyBoundary(source) {
  const b = clone(source.Resources.PermissionsBoundary);
  // No fixed policy name: the name is the stack's, so a second stack in another Region does not clash
  // over the boundary (the role names stay fixed: the platform builds the role ARN from them).
  delete b.Properties.ManagedPolicyName;
  return b;
}

const TC_ROLES = [
  ["TcProvisioner", pool, "PoolBoundary"],
  ["TcReader", pool, "PoolBoundary"],
  ["TcAccessDetails", pool, "PoolBoundary"],
  ["TcBillingReader", pool, "PoolBoundary"],
  ["TcDnsProvisioner", dns, "DnsBoundary"],
  ["TcDnsReader", dns, "DnsBoundary"],
];

const HOST = "^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\\.)+[a-z]{2,63}$";
const CIDR =
  "^(25[0-5]|2[0-4][0-9]|1?[0-9]?[0-9])(\\.(25[0-5]|2[0-4][0-9]|1?[0-9]?[0-9])){3}/([89]|[12][0-9]|3[0-2])$"; // never wider than /8 (review L3)
const PASSWORD_POLICY = {
  MinimumLength: 12,
  RequireLowercase: true,
  RequireUppercase: true,
  RequireNumbers: true,
  RequireSymbols: false,
  TemporaryPasswordValidityDays: 3,
};
const NO_OAUTH = {
  AllowedOAuthFlowsUserPoolClient: false,
  PreventUserExistenceErrors: "ENABLED",
};

// First boot: the answers come from this stack (none of them is a secret); tc-install fetches the two
// Cognito client secrets and the first operator's sub itself, with the instance role, and writes them
// to root-only files. The instance user data therefore holds no secret (R3).
const USER_DATA = [
  "#!/bin/bash",
  "# TryAWS.now Pro first boot (pro/cfn/build-template.mjs). No secret in this script.",
  "set -euo pipefail",
  "umask 077 # the first-boot log and the answers are root-only (review L2)",
  "install -d -m 0700 /root/tc",
  "cat >/root/tc/answers.env <<'TCEOF'",
  "TC_PANEL_HOST=${PanelDomain}",
  "TC_ADMIN_HOST=${AdminDomain}",
  "TC_ADMIN_ALLOW=${OperatorCidr}",
  "TC_ACME_EMAIL=${OperatorEmail}",
  "AWS_REGION=${AWS::Region}",
  "COGNITO_CUSTOMER_POOL_ID=${CustomerPool}",
  "COGNITO_CUSTOMER_CLIENT_ID=${CustomerAppClient}",
  "COGNITO_SIGNUP_CLIENT_ID=${CustomerSignUpClient}",
  "COGNITO_ADMIN_POOL_ID=${AdminPool}",
  "COGNITO_ADMIN_CLIENT_ID=${AdminAppClient}",
  "TC_FIRST_ADMIN_EMAIL=${OperatorEmail}",
  "TC_FIRST_ADMIN_SUB=",
  "TC_ACCOUNT_ID=${AWS::AccountId}",
  "TC_POOL_EXTERNAL_ID=${ExternalId}",
  "TC_PUBLIC_IP=${PublicAddress}",
  "TC_INVOICES_BUCKET=${InvoicesBucket}",
  "WHMCS_URL=",
  "TCEOF",
  "chmod 0600 /root/tc/answers.env",
  "if /usr/local/sbin/tc-install --answers /root/tc/answers.env >/var/log/tc-firstboot.log 2>&1; then",
  "  echo 'tc-firstboot: TryAWS.now Pro is installed' >/dev/console",
  "else",
  "  echo 'tc-firstboot: install failed, see /var/log/tc-firstboot.log' >/dev/console",
  "fi",
  "",
].join("\n");

export function buildTemplate() {
  const resources = {
    PoolBoundary: copyBoundary(pool),
    DnsBoundary: copyBoundary(dns),
  };
  for (const [name, source, boundary] of TC_ROLES) {
    resources[name] = copyRole(source, name, boundary);
    // Security review H1: Route 53 has no tag condition for hosted zones, so the DNS roles could change
    // every zone of the account. They exist only when the buyer turns domains on (R12: off by default).
    if (source === dns) resources[name].Condition = "DomainsEnabled";
  }
  resources.DnsBoundary.Condition = "DomainsEnabled";

  resources.InstanceRole = {
    Type: "AWS::IAM::Role",
    Properties: {
      Description:
        "TryAWS.now Pro instance. Only the tc-worker service reaches its credentials (IMDS).",
      AssumeRolePolicyDocument: {
        Version: "2012-10-17",
        Statement: [
          {
            Effect: "Allow",
            Principal: { Service: "ec2.amazonaws.com" },
            Action: "sts:AssumeRole",
          },
        ],
      },
      Policies: [
        {
          PolicyName: "TryAwsNowPro",
          PolicyDocument: {
            Version: "2012-10-17",
            Statement: [
              {
                Sid: "AssumeTheTcRolesOnly",
                Effect: "Allow",
                Action: "sts:AssumeRole",
                Resource: TC_ROLES.map(([name]) => ({
                  "Fn::Sub": `arn:aws:iam::\${AWS::AccountId}:role/${name}`,
                })),
              },
              {
                // CheckoutLicense and CheckInLicense have no resource-level permission (security review
                // L5 of PRO-5). PRO-9: the worker checks the unit back in right after the checkout.
                Sid: "MarketplaceLicence",
                Effect: "Allow",
                Action: ["license-manager:CheckoutLicense", "license-manager:CheckInLicense"],
                Resource: "*",
              },
              {
                Sid: "InstallerReadsTheClientSecretsOfThisStack",
                Effect: "Allow",
                Action: "cognito-idp:DescribeUserPoolClient",
                Resource: { "Fn::GetAtt": ["CustomerPool", "Arn"] },
              },
              {
                Sid: "InstallerReadsTheFirstOperator",
                Effect: "Allow",
                Action: "cognito-idp:AdminGetUser",
                Resource: { "Fn::GetAtt": ["AdminPool", "Arn"] },
              },
              {
                Sid: "InvoicePdfs",
                Effect: "Allow",
                Action: "s3:PutObject",
                Resource: { "Fn::Sub": "${InvoicesBucket.Arn}/*" },
              },
            ],
          },
        },
      ],
    },
  };
  resources.InstanceProfile = {
    Type: "AWS::IAM::InstanceProfile",
    Properties: { Roles: [{ Ref: "InstanceRole" }] },
  };

  resources.InvoicesBucket = {
    Type: "AWS::S3::Bucket",
    DeletionPolicy: "Retain",
    UpdateReplacePolicy: "Retain",
    Properties: {
      BucketEncryption: {
        ServerSideEncryptionConfiguration: [
          { ServerSideEncryptionByDefault: { SSEAlgorithm: "AES256" }, BucketKeyEnabled: true },
        ],
      },
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,
        BlockPublicPolicy: true,
        IgnorePublicAcls: true,
        RestrictPublicBuckets: true,
      },
      OwnershipControls: { Rules: [{ ObjectOwnership: "BucketOwnerEnforced" }] },
    },
  };
  resources.InvoicesBucketPolicy = {
    Type: "AWS::S3::BucketPolicy",
    Properties: {
      Bucket: { Ref: "InvoicesBucket" },
      PolicyDocument: {
        Version: "2012-10-17",
        Statement: [
          {
            Sid: "TlsOnly",
            Effect: "Deny",
            Principal: "*",
            Action: "s3:*",
            Resource: [
              { "Fn::GetAtt": ["InvoicesBucket", "Arn"] },
              { "Fn::Sub": "${InvoicesBucket.Arn}/*" },
            ],
            Condition: { Bool: { "aws:SecureTransport": "false" } },
          },
        ],
      },
    },
  };

  // Cognito, as infra/stacks/auth.ts (WPU-X12) minus the two Lambda triggers: the messages stay
  // Cognito's own, and sign-up is closed to anyone without a client secret (both customer clients have
  // one), which is what the preSignUp guard adds behind in the SaaS stack.
  const userPool = (extra) => ({
    Type: "AWS::Cognito::UserPool",
    DeletionPolicy: "Retain",
    UpdateReplacePolicy: "Retain",
    Properties: {
      UsernameAttributes: ["email"],
      AutoVerifiedAttributes: ["email"],
      UserAttributeUpdateSettings: { AttributesRequireVerificationBeforeUpdate: ["email"] },
      Policies: { PasswordPolicy: PASSWORD_POLICY },
      AccountRecoverySetting: { RecoveryMechanisms: [{ Name: "verified_email", Priority: 1 }] },
      EmailConfiguration: { EmailSendingAccount: "COGNITO_DEFAULT" },
      DeletionProtection: "ACTIVE",
      EnabledMfas: ["SOFTWARE_TOKEN_MFA"],
      ...extra,
    },
  });
  resources.CustomerPool = userPool({
    MfaConfiguration: "OPTIONAL",
    AdminCreateUserConfig: { AllowAdminCreateUserOnly: false },
  });
  resources.CustomerAppClient = {
    Type: "AWS::Cognito::UserPoolClient",
    Properties: {
      UserPoolId: { Ref: "CustomerPool" },
      GenerateSecret: true,
      WriteAttributes: ["name"],
      ExplicitAuthFlows: [
        "ALLOW_USER_PASSWORD_AUTH",
        "ALLOW_REFRESH_TOKEN_AUTH",
        "ALLOW_USER_SRP_AUTH",
      ],
      ...NO_OAUTH,
    },
  };
  resources.CustomerSignUpClient = {
    Type: "AWS::Cognito::UserPoolClient",
    Properties: {
      UserPoolId: { Ref: "CustomerPool" },
      GenerateSecret: true,
      WriteAttributes: ["email", "name", "locale"],
      ReadAttributes: ["email", "name", "locale"],
      ExplicitAuthFlows: ["ALLOW_REFRESH_TOKEN_AUTH"],
      AccessTokenValidity: 5,
      IdTokenValidity: 5,
      RefreshTokenValidity: 60,
      TokenValidityUnits: { AccessToken: "minutes", IdToken: "minutes", RefreshToken: "minutes" },
      ...NO_OAUTH,
    },
  };
  resources.AdminPool = userPool({
    MfaConfiguration: "ON",
    AdminCreateUserConfig: { AllowAdminCreateUserOnly: true },
  });
  resources.AdminAppClient = {
    Type: "AWS::Cognito::UserPoolClient",
    Properties: {
      UserPoolId: { Ref: "AdminPool" },
      GenerateSecret: false,
      WriteAttributes: [],
      AccessTokenValidity: 1,
      IdTokenValidity: 1,
      RefreshTokenValidity: 8,
      TokenValidityUnits: { AccessToken: "hours", IdToken: "hours", RefreshToken: "hours" },
      ExplicitAuthFlows: ["ALLOW_USER_PASSWORD_AUTH", "ALLOW_REFRESH_TOKEN_AUTH"],
      ...NO_OAUTH,
    },
  };
  // The first operator. Cognito e-mails a temporary password; MFA (TOTP) is set up at the first sign-in.
  resources.FirstOperator = {
    Type: "AWS::Cognito::UserPoolUser",
    Properties: {
      UserPoolId: { Ref: "AdminPool" },
      Username: { Ref: "OperatorEmail" },
      DesiredDeliveryMediums: ["EMAIL"],
      UserAttributes: [
        { Name: "email", Value: { Ref: "OperatorEmail" } },
        { Name: "email_verified", Value: "true" },
      ],
    },
  };

  resources.SecurityGroup = {
    Type: "AWS::EC2::SecurityGroup",
    Properties: {
      GroupDescription: "TryAWS.now Pro: HTTPS and HTTP for everyone, SSH for the operator only",
      VpcId: { Ref: "VpcId" },
      SecurityGroupIngress: [
        {
          IpProtocol: "tcp",
          FromPort: 443,
          ToPort: 443,
          CidrIp: "0.0.0.0/0",
          Description: "HTTPS",
        },
        { IpProtocol: "tcp", FromPort: 443, ToPort: 443, CidrIpv6: "::/0", Description: "HTTPS" },
        {
          IpProtocol: "tcp",
          FromPort: 80,
          ToPort: 80,
          CidrIp: "0.0.0.0/0",
          Description: "HTTP (certificate challenge and redirect)",
        },
        { IpProtocol: "tcp", FromPort: 80, ToPort: 80, CidrIpv6: "::/0", Description: "HTTP" },
        {
          IpProtocol: "tcp",
          FromPort: 22,
          ToPort: 22,
          CidrIp: { Ref: "OperatorCidr" },
          Description: "SSH from the operator",
        },
      ],
    },
  };
  resources.PublicAddress = { Type: "AWS::EC2::EIP", Properties: { Domain: "vpc" } };
  resources.LaunchTemplate = {
    Type: "AWS::EC2::LaunchTemplate",
    Properties: {
      LaunchTemplateData: {
        MetadataOptions: {
          HttpTokens: "required",
          HttpPutResponseHopLimit: 1,
          HttpEndpoint: "enabled",
        },
        BlockDeviceMappings: [
          {
            DeviceName: "/dev/sda1",
            Ebs: {
              VolumeSize: { Ref: "RootVolumeGiB" },
              VolumeType: "gp3",
              Encrypted: true,
              DeleteOnTermination: true,
            },
          },
        ],
      },
    },
  };
  resources.Instance = {
    Type: "AWS::EC2::Instance",
    // The Tc roles are named in the instance role's policy by ARN (no reference), so wait for them
    // explicitly: the worker assumes them from the first minute.
    DependsOn: [
      ...TC_ROLES.filter(([, source]) => source === pool).map(([name]) => name),
      "FirstOperator",
    ],
    Properties: {
      ImageId: { Ref: "ImageId" },
      InstanceType: { Ref: "InstanceType" },
      LaunchTemplate: {
        LaunchTemplateId: { Ref: "LaunchTemplate" },
        Version: { "Fn::GetAtt": ["LaunchTemplate", "LatestVersionNumber"] },
      },
      SubnetId: { Ref: "SubnetId" },
      SecurityGroupIds: [{ "Fn::GetAtt": ["SecurityGroup", "GroupId"] }],
      IamInstanceProfile: { Ref: "InstanceProfile" },
      KeyName: { "Fn::If": ["HasKeyName", { Ref: "KeyName" }, { Ref: "AWS::NoValue" }] },
      Tags: [
        { Key: "Name", Value: "tryawsnow-pro" },
        // The buyer's confirmation (security review H1), kept where an auditor can see it.
        { Key: "tryawsnow:dedicated-account", Value: { Ref: "DedicatedAccount" } },
      ],
      UserData: {
        "Fn::Base64": {
          "Fn::Sub": [USER_DATA, { ExternalId: EXTERNAL_ID }],
        },
      },
    },
  };
  resources.PublicAddressAssociation = {
    Type: "AWS::EC2::EIPAssociation",
    Properties: {
      AllocationId: { "Fn::GetAtt": ["PublicAddress", "AllocationId"] },
      InstanceId: { Ref: "Instance" },
    },
  };

  return {
    AWSTemplateFormatVersion: "2010-09-09",
    Description:
      "TryAWS.now Pro by TiCON System Limited: one EC2 instance, its IAM roles and two Cognito user pools. " +
      "Use an AWS account dedicated to TryAWS.now. Built by pro/cfn/build-template.mjs; do not edit by hand.",
    Metadata: {
      "AWS::CloudFormation::Interface": {
        ParameterGroups: [
          { Label: { default: "Your domains" }, Parameters: ["PanelDomain", "AdminDomain"] },
          {
            Label: { default: "Operator" },
            Parameters: ["OperatorEmail", "OperatorCidr", "KeyName"],
          },
          {
            Label: { default: "Instance and network" },
            Parameters: ["ImageId", "InstanceType", "RootVolumeGiB", "VpcId", "SubnetId"],
          },
        ],
      },
    },
    Parameters: {
      ImageId: {
        Type: "AWS::EC2::Image::Id",
        Description: "The TryAWS.now Pro AMI (AWS Marketplace fills this in).",
      },
      InstanceType: {
        Type: "String",
        Default: "t3.medium",
        AllowedValues: INSTANCE_TYPES,
        Description: "t3.medium is recommended; t3.small is the minimum.",
      },
      RootVolumeGiB: { Type: "Number", Default: 30, MinValue: 16, MaxValue: 500 },
      VpcId: { Type: "AWS::EC2::VPC::Id", Description: "The VPC of the subnet below." },
      SubnetId: {
        Type: "AWS::EC2::Subnet::Id",
        Description: "A PUBLIC subnet (route to an internet gateway) in that VPC.",
      },
      PanelDomain: {
        Type: "String",
        AllowedPattern: HOST,
        Description: "Domain of the customer panel, e.g. panel.example.com",
      },
      AdminDomain: {
        Type: "String",
        AllowedPattern: HOST,
        Description: "Domain of the operator app, e.g. ops.example.com",
      },
      OperatorEmail: {
        Type: "String",
        AllowedPattern: "^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[a-z]{2,}$",
        Description:
          "First operator; Cognito e-mails a temporary password here. Also the Let's Encrypt contact.",
      },
      OperatorCidr: {
        Type: "String",
        AllowedPattern: CIDR,
        Description:
          "Your office IP as a CIDR (e.g. 203.0.113.7/32): SSH and the operator app allow only this.",
      },
      DedicatedAccount: {
        Type: "String",
        AllowedValues: ["yes"],
        Description:
          "Install in an AWS account (or AWS Organizations member account) used only for TryAWS.now: the " +
          "platform's roles can change every Lightsail resource of this account in its Regions. Type yes to confirm.",
      },
      EnableDomains: {
        Type: "String",
        Default: "no",
        AllowedValues: ["no", "yes"],
        Description:
          "yes: also create the Route 53 roles for selling domains and DNS zones (they can change every " +
          "hosted zone of this account; keep your own domains in another account).",
      },
      KeyName: {
        Type: "String",
        Default: "",
        Description:
          "Optional EC2 key pair for SSH. Empty: no key (use EC2 Instance Connect or none).",
      },
    },
    Conditions: {
      HasKeyName: { "Fn::Not": [{ "Fn::Equals": [{ Ref: "KeyName" }, ""] }] },
      DomainsEnabled: { "Fn::Equals": [{ Ref: "EnableDomains" }, "yes"] },
    },
    Resources: resources,
    Outputs: {
      PublicIp: {
        Description: "Point BOTH domains at this address (DNS A records).",
        Value: { Ref: "PublicAddress" },
      },
      PanelUrl: { Value: { "Fn::Sub": "https://${PanelDomain}" } },
      AdminUrl: { Value: { "Fn::Sub": "https://${AdminDomain}" } },
      InstanceId: { Value: { Ref: "Instance" } },
      ExternalId: {
        Description: "The ExternalId of the Tc roles of this install (not a secret).",
        Value: EXTERNAL_ID,
      },
    },
  };
}

export function renderTemplate() {
  return (
    "# Generated by pro/cfn/build-template.mjs from infra/org/pool-roles.yaml and dns-account.yaml.\n" +
    "# Do not edit: change the generator or the source templates, then run it.\n" +
    // YAML 1.1 output quotes ON, OFF, yes and no (CloudFormation reads YAML 1.1); no aliases (CloudFormation
    // rejects them).
    YAML.stringify(buildTemplate(), { lineWidth: 0, version: "1.1", aliasDuplicateObjects: false })
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const text = renderTemplate();
  if (process.argv.includes("--check")) {
    const current = readFileSync(OUT, "utf8");
    if (current !== text) {
      process.stderr.write(
        "pro/cfn/tryawsnow-pro.yaml is out of date: run node pro/cfn/build-template.mjs\n",
      );
      process.exit(1);
    }
  } else {
    writeFileSync(OUT, text);
  }
}
