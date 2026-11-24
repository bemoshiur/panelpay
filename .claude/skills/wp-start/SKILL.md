---
name: wp-start
description: Start one task of the PanelPay mega plan by its id, for example WP3-T1
disable-model-invocation: true
---
Task id: $ARGUMENTS

1. Open docs/spec/E-backlog-and-prompts.md and find the row of this task and the "Read" list of its
   work package. Read those docs/spec files first. Read another docs/spec file only when the task
   row names a route, function or rule that they do not contain, and name that file in the plan.
   Read the last 60 lines of JOURNEY.md.
2. Write the plan for this task only: files to create or change, the interfaces you consume and
   produce (docs/spec/F-contracts-between-tracks.md), the tests that prove the task, every VERIFY
   item it touches, and anything that needs a decision. Stop and show the plan.
3. After the plan is approved: write the failing tests, run them and show that they fail, implement,
   run them until they pass. Keep to the package boundaries in CLAUDE.md.
4. Run pnpm verify --task <id> and show the output.
5. Ask the reviewer subagent that fits the paths you changed (security-reviewer, money-reviewer or
   spec-checker) to review the diff. Fix what affects correctness or the specification.
6. Append a JOURNEY.md entry from the template. Commit as "<task id>: <change>", push the branch,
   and open a pull request with gh pr create using the template. Do not merge.
If anything on the "Stop and write a Needs decision entry" list in CLAUDE.md applies, do that instead
of guessing.
