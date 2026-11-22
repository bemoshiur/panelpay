#!/bin/bash
# PRO-7. User data of the temporary build instance (build-ami.sh fills the three values). It runs once as
# root, bakes the release into the image and powers the instance off; build-ami.sh then takes the image.
# No SSH, no SSM, no key pair: the only way out is the console line TC-BAKE-OK or TC-BAKE-FAILED.
# Nothing secret is in the image: every secret is made by tc-install at the buyer's first run.
set -euo pipefail
RELEASE_URL='__RELEASE_URL__'
RELEASE_SHA256='__RELEASE_SHA256__'
RELEASE_ID='__RELEASE_ID__'

say() { echo "tc-bake: $*" >/dev/console; }
fail() {
  say "TC-BAKE-FAILED at line $1"
  shutdown -h now
}
trap 'fail $LINENO' ERR

export DEBIAN_FRONTEND=noninteractive
# Wait for the dpkg lock (unattended-upgrades holds it at first boot) instead of failing. Kept in the image:
# it also helps the buyer's first tc-install run.
printf 'DPkg::Lock::Timeout "600";\n' >/etc/apt/apt.conf.d/50tc-lock-wait
# Do not wait on cloud-init here: this script runs inside its final stage, so a wait never returns.
say "download"
curl -fsSL --proto '=https' --retry 3 -o /root/release.tgz "$RELEASE_URL"
echo "$RELEASE_SHA256  /root/release.tgz" | sha256sum -c --quiet -
mkdir -p /opt/tc/releases
tar -xzf /root/release.tgz -C /opt/tc/releases --no-same-owner
mv "/opt/tc/releases/tc-pro-$RELEASE_ID" "/opt/tc/releases/$RELEASE_ID" 2>/dev/null || true
ln -sfn "/opt/tc/releases/$RELEASE_ID" /opt/tc/current
chown -R root:root /opt/tc
chmod -R go-w /opt/tc
rm -f /root/release.tgz

say "updates"
apt-get update -qq
apt-get -y -qq -o Dpkg::Options::=--force-confold upgrade >/dev/null

say "install"
/opt/tc/current/box/bin/tc-install.sh --bake >/dev/null
# The AWS CLI is not in Ubuntu 24.04's archive; only the optional S3 copy of the backups uses it.
snap install aws-cli --classic >/dev/null
ln -sfn /opt/tc/current/box/bin/tc-install.sh /usr/local/sbin/tc-install

cat >/etc/update-motd.d/99-tryawsnow <<'MOTD'
#!/bin/sh
if [ ! -f /etc/tc/answers.env ]; then
  echo
  echo "  TryAWS.now Pro is installed but not set up yet."
  echo "  Run:  sudo tc-install      (guide: /opt/tc/current/box/README.md)"
  echo
fi
MOTD
chmod 0755 /etc/update-motd.d/99-tryawsnow

say "clean"
# AWS Marketplace AMI rules: no keys, no history, no logs of the build, a fresh identity at first boot.
rm -f /root/.ssh/authorized_keys /home/*/.ssh/authorized_keys
rm -f /root/.bash_history /home/*/.bash_history
truncate -s 0 /etc/machine-id
rm -f /var/lib/dbus/machine-id
apt-get clean
journalctl --rotate >/dev/null 2>&1 || true
journalctl --vacuum-time=1s >/dev/null 2>&1 || true
find /var/log -type f \( -name '*.gz' -o -name '*.1' \) -delete
find /var/log -type f -exec truncate -s 0 {} +
cloud-init clean --logs --seed >/dev/null 2>&1 || true
say "TC-BAKE-OK $RELEASE_ID"
sync
shutdown -h now
