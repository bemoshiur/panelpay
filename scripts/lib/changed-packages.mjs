// Maps changed files to workspace packages for `pnpm verify --quick`.
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const WORKSPACE_FOLDERS = ["apps", "packages", "functions", "pro"];

// Folder -> package name for every workspace package, for example "packages/core" -> "@tc/core".
export function readWorkspacePackages(root) {
  const packages = {};
  for (const parent of WORKSPACE_FOLDERS) {
    const parentDir = join(root, parent);
    if (!existsSync(parentDir)) continue;
    for (const entry of readdirSync(parentDir, { withFileTypes: true })) {
      const manifest = join(parentDir, entry.name, "package.json");
      if (!entry.isDirectory() || !existsSync(manifest)) continue;
      packages[`${parent}/${entry.name}`] = JSON.parse(readFileSync(manifest, "utf8")).name;
    }
  }
  return packages;
}

// Changed files of the repository at `root`: tracked changes against HEAD (a rename lists the old
// and the new path) plus untracked files. Returns null when git cannot tell.
export function listChangedFiles(root) {
  const git = (...args) => spawnSync("git", args, { cwd: root, encoding: "utf8" });
  const changed = git("diff", "--name-only", "--no-renames", "HEAD");
  const untracked = git("ls-files", "--others", "--exclude-standard");
  if (changed.status !== 0 || untracked.status !== 0) return null;
  return `${changed.stdout}\n${untracked.stdout}`.split("\n").filter(Boolean);
}

// The package names touched by `files`, or "all" when a file lies outside every package or when
// nothing changed (then the whole repository is checked).
export function changedPackages(files, packages) {
  if (files.length === 0) return "all";
  const names = [];
  for (const file of files) {
    const folder = Object.keys(packages).find((dir) => file.startsWith(`${dir}/`));
    if (folder === undefined) return "all";
    if (!names.includes(packages[folder])) names.push(packages[folder]);
  }
  return names;
}
