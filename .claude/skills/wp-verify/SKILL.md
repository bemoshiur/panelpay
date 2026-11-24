---
name: wp-verify
description: Run the proof of a task or a gate of the PanelPay mega plan and report evidence
disable-model-invocation: true
---
Target: $ARGUMENTS (a task id such as WP3-T1, or a gate M0 to M7)

Run pnpm verify --task <id> or pnpm verify --gate <gate>. Show the table and, for every failed
check, the command, the last lines of its output and the most likely cause. Do not change code in
this skill. If a check cannot run, report it as failed and say what is missing.
