#!/usr/bin/env bash
# PRO-7. Builds the PanelPay Pro AMI in the AWS account of the current AWS CLI profile. The owner
# approved this step and its cost on 23 Nov 2026: one t3.small for about 15-30 minutes, a temporary S3
# object and security group (deleted at the end, also on failure), and the AMI snapshot that stays.
#
#   pro/ami/build-ami.sh pro/ami/out/tc-pro-<commit>.tar.gz [region]
#
# Steps: upload the release to a temporary bucket -> launch the build instance with bake-userdata.sh
# (IMDSv2 only, no key pair, no inbound port) -> wait until it powers itself off -> require the console
# line TC-BAKE-OK -> create the image (IMDSv2 required) -> delete the instance, bucket and group.
set -euo pipefail

TGZ="${1:?release archive}"
REGION="${2:-ap-southeast-1}"
TYPE=t3.small
HERE="$(cd "$(dirname "$0")" && pwd)"
[[ -f "$TGZ" ]] || { echo "build-ami: no such archive" >&2; exit 1; }
NAME="$(basename "$TGZ" .tar.gz)"
RELEASE_ID="${NAME#tc-pro-}"
[[ "$RELEASE_ID" =~ ^[0-9a-f]{7,40}$ ]] || { echo "build-ami: unexpected archive name" >&2; exit 1; }
SHA="$(shasum -a 256 "$TGZ" | cut -d' ' -f1)"
aws() { command aws --region "$REGION" --output text "$@"; }
ACCOUNT="$(aws sts get-caller-identity --query Account)"
STAMP="$(date -u +%Y%m%d%H%M%S)"
BUCKET="tc-pro-ami-build-$ACCOUNT-$STAMP"
INSTANCE=""
SG=""

cleanup() {
  set +e
  [[ -n "$INSTANCE" ]] && aws ec2 terminate-instances --instance-ids "$INSTANCE" >/dev/null &&
    aws ec2 wait instance-terminated --instance-ids "$INSTANCE"
  [[ -n "$SG" ]] && aws ec2 delete-security-group --group-id "$SG" >/dev/null
  command aws s3 rm "s3://$BUCKET" --recursive --region "$REGION" >/dev/null 2>&1
  command aws s3api delete-bucket --bucket "$BUCKET" --region "$REGION" >/dev/null 2>&1
  echo "build-ami: temporary instance, security group and bucket removed"
}
trap cleanup EXIT

echo "build-ami: account $ACCOUNT, region $REGION, release $RELEASE_ID"
BASE_AMI="$(aws ssm get-parameter --name /aws/service/canonical/ubuntu/server/24.04/stable/current/amd64/hvm/ebs-gp3/ami-id --query Parameter.Value)"
VPC="$(aws ec2 describe-vpcs --filters Name=is-default,Values=true --query 'Vpcs[0].VpcId')"
[[ "$VPC" =~ ^vpc- ]] || { echo "build-ami: no default VPC in $REGION" >&2; exit 1; }

command aws s3api create-bucket --bucket "$BUCKET" --region "$REGION" \
  --create-bucket-configuration "LocationConstraint=$REGION" >/dev/null
command aws s3api put-public-access-block --bucket "$BUCKET" --region "$REGION" \
  --public-access-block-configuration BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
command aws s3 cp "$TGZ" "s3://$BUCKET/$NAME.tar.gz" --region "$REGION" --only-show-errors
URL="$(command aws s3 presign "s3://$BUCKET/$NAME.tar.gz" --expires-in 3600 --region "$REGION")"

SG="$(aws ec2 create-security-group --group-name "tc-pro-ami-build-$STAMP" \
  --description "PanelPay Pro AMI build: no inbound" --vpc-id "$VPC" --query GroupId)"
# No inbound rule at all; the default egress rule lets the instance download its packages.

USERDATA="$(mktemp)"
sed -e "s#__RELEASE_URL__#$URL#" -e "s#__RELEASE_SHA256__#$SHA#" -e "s#__RELEASE_ID__#$RELEASE_ID#" \
  "$HERE/bake-userdata.sh" >"$USERDATA"

INSTANCE="$(aws ec2 run-instances --image-id "$BASE_AMI" --instance-type "$TYPE" \
  --security-group-ids "$SG" --user-data "file://$USERDATA" \
  --metadata-options HttpTokens=required,HttpPutResponseHopLimit=1,HttpEndpoint=enabled \
  --block-device-mappings 'DeviceName=/dev/sda1,Ebs={VolumeSize=16,VolumeType=gp3,DeleteOnTermination=true,Encrypted=false}' \
  --instance-initiated-shutdown-behavior stop \
  --tag-specifications "ResourceType=instance,Tags=[{Key=Name,Value=tc-pro-ami-build},{Key=Project,Value=panelpay-pro}]" \
  --query 'Instances[0].InstanceId')"
rm -f "$USERDATA"
echo "build-ami: build instance $INSTANCE ($TYPE) started; waiting for it to power off (up to 45 minutes)"

for _ in $(seq 1 90); do
  STATE="$(aws ec2 describe-instances --instance-ids "$INSTANCE" --query 'Reservations[0].Instances[0].State.Name')"
  [[ "$STATE" == stopped ]] && break
  sleep 30
done
[[ "$STATE" == stopped ]] || { echo "build-ami: the build did not finish in time" >&2; exit 1; }

CONSOLE="$(aws ec2 get-console-output --instance-id "$INSTANCE" --latest --query Output 2>/dev/null || true)"
if ! grep -q "TC-BAKE-OK $RELEASE_ID" <<<"$CONSOLE"; then
  echo "build-ami: the bake did not report success; console tail:" >&2
  grep 'tc-bake:' <<<"$CONSOLE" | tail -n 20 >&2 || true
  exit 1
fi

IMAGE="$(aws ec2 create-image --instance-id "$INSTANCE" --name "panelpay-pro-$RELEASE_ID-$STAMP" \
  --description "PanelPay Pro $RELEASE_ID (Ubuntu 24.04, run sudo tc-install)" \
  --tag-specifications "ResourceType=image,Tags=[{Key=Project,Value=panelpay-pro},{Key=Release,Value=$RELEASE_ID}]" \
  "ResourceType=snapshot,Tags=[{Key=Project,Value=panelpay-pro},{Key=Release,Value=$RELEASE_ID}]" \
  --query ImageId)"
echo "build-ami: image $IMAGE being created"
aws ec2 wait image-available --image-ids "$IMAGE"
aws ec2 modify-image-attribute --image-id "$IMAGE" --imds-support v2.0 >/dev/null
echo "build-ami: DONE image $IMAGE (IMDSv2 required) in $REGION"
