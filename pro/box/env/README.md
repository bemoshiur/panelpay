# /etc/tc/*.env

The installer (PRO-4) writes these files on the buyer's box. None is in the repo with a value; the
`.example` files list the keys only.

| File        | Owner and mode | Read by                                          |
| ----------- | -------------- | ------------------------------------------------ |
| common.env  | root:root 0600 | web, admin, worker                               |
| web.env     | root:root 0600 | tc-web                                           |
| admin.env   | root:root 0600 | tc-admin                                         |
| worker.env  | root:root 0600 | tc-worker                                        |
| caddy.env   | root:root 0600 | caddy                                            |
| backup.env  | root:root 0600 | tc-backup                                        |
| bridge.env  | root:root 0600 | tc-bridge (only when the WHMCS bridge is set up) |
| migrate.env | root:root 0600 | tc-migrate (installer, updates)                  |
| pg-ca.crt   | root:root 0644 | all (public certificate of the local PostgreSQL) |

Every env file is root:root 0600: systemd reads EnvironmentFile as root before it drops privileges, so
no app user can read another app's file (security review L1). Each app connects with its own database role (web_rw, admin_rw, worker_rw), so a leak of one file does
not give the others' rights. The invoke token is in web.env and worker.env only.

This is the Pro decision for R3 (JOURNEY PRO-3): secrets live in root-owned files on the buyer's own
instance instead of SST Secrets, because the Pro edition creates no AWS resource besides that instance.
Credentials for AWS calls come from the instance role, never from these files.
