#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DIST = path.join(ROOT, "dist");
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));

function run(cmd, args, cwd = ROOT) {
  const result = spawnSync(cmd, args, { cwd, stdio: "inherit" });
  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    out[key] = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : true;
  }
  return out;
}

function archToDeb(arch) {
  if (arch === "x64") return "amd64";
  if (arch === "arm64") return "arm64";
  throw new Error(`unsupported linux arch: ${arch}`);
}

function chmodRecursive(file, mode) {
  fs.chmodSync(file, mode);
}

function writeExecutable(file, body) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, body, "utf8");
  chmodRecursive(file, 0o755);
}

function escapeSh(value) {
  return String(value).replace(/'/g, `'\\''`);
}

function installFile(src, dest, mode = null) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
  if (mode !== null) fs.chmodSync(dest, mode);
}

const opts = parseArgs(process.argv.slice(2));
const arch = String(opts.arch || "").trim();
const nodeBin = String(opts["node-bin"] || "").trim();
const nodeVersion = String(opts["node-version"] || process.version.replace(/^v/, "")).trim();
if (!arch) throw new Error("--arch is required");
if (!nodeBin || !fs.existsSync(nodeBin)) throw new Error("--node-bin must point to an extracted Linux node binary");

const debArch = archToDeb(arch);
const stagingRoot = path.join(DIST, `linux-${arch}`);
const packageRoot = path.join(stagingRoot, "package-root");
const installedAppRoot = "/opt/qexow-cam";
const appRoot = path.join(packageRoot, "opt", "qexow-cam");
const debianDir = path.join(packageRoot, "DEBIAN");

fs.rmSync(stagingRoot, { recursive: true, force: true });
fs.mkdirSync(debianDir, { recursive: true });

const bundlePath = path.join(stagingRoot, "cam-bundle.cjs");
run("npx", ["esbuild", "bin/cam.js", "--bundle", "--platform=node", "--format=cjs", `--outfile=${bundlePath}`, "--external:fsevents"]);

installFile(nodeBin, path.join(appRoot, "bin", "node"), 0o755);
installFile(bundlePath, path.join(appRoot, "lib", "cam-bundle.cjs"), 0o644);
installFile(path.join(ROOT, "README.md"), path.join(appRoot, "README.md"), 0o644);
installFile(path.join(ROOT, "boss.md"), path.join(appRoot, "boss.md"), 0o644);
installFile(path.join(ROOT, "docs", "howto-use-qexow-cam.md"), path.join(appRoot, "docs", "howto-use-qexow-cam.md"), 0o644);
installFile(path.join(ROOT, "docs", "qexow-cam-plain-english.md"), path.join(appRoot, "docs", "qexow-cam-plain-english.md"), 0o644);

writeExecutable(path.join(appRoot, "bin", "cam"), `#!/bin/sh
set -eu
CAM_APP_ROOT="${installedAppRoot}"
export CAM_APP_ROOT
exec "${installedAppRoot}/bin/node" "${installedAppRoot}/lib/cam-bundle.cjs" "$@"
`);

const installUserStateDir = "/var/lib/qexow-cam";
const installUserStateFile = `${installUserStateDir}/install-user`;
const packageName = "qexow-cam";

const control = `Package: ${packageName}
Version: ${pkg.version}
Section: utils
Priority: optional
Architecture: ${debArch}
Maintainer: Qexow CAM
Depends: bash, systemd, coreutils, util-linux, procps
Description: Qexow CAM remote Linux packaged runtime
 Bundled Linux runtime for Qexow CAM with local docs, skills bootstrap,
 user-level systemd service, and aggressive reinstall/uninstall behavior.
`;
fs.writeFileSync(path.join(debianDir, "control"), control, "utf8");

writeExecutable(path.join(debianDir, "preinst"), `#!/bin/sh
set -eu
CAM_HOME_NAME=".qexow-cam"
LEGACY_HOME_NAME=".codex-agent-manager"
STATE_DIR="${installUserStateDir}"
STATE_FILE="${installUserStateFile}"
APP_ROOT="${installedAppRoot}"
TARGET_USER="\${CAM_INSTALL_USER:-\${SUDO_USER:-}}"
if [ -z "$TARGET_USER" ] && [ -f "$STATE_FILE" ]; then
  TARGET_USER="$(cat "$STATE_FILE" 2>/dev/null || true)"
fi
if [ -n "$TARGET_USER" ] && id "$TARGET_USER" >/dev/null 2>&1; then
  HOME_DIR="$(getent passwd "$TARGET_USER" | cut -d: -f6)"
  if [ -n "$HOME_DIR" ]; then
    if command -v loginctl >/dev/null 2>&1; then
      loginctl enable-linger "$TARGET_USER" >/dev/null 2>&1 || true
    fi
    if [ -x /usr/local/bin/cam ]; then
      runuser -u "$TARGET_USER" -- /usr/local/bin/cam uninstall-service >/dev/null 2>&1 || true
    fi
    TARGET_UID="$(id -u "$TARGET_USER")"
    RUNTIME_DIR="/run/user/$TARGET_UID"
    runuser -u "$TARGET_USER" -- env XDG_RUNTIME_DIR="$RUNTIME_DIR" systemctl --user disable --now CodexAgentManager.service >/dev/null 2>&1 || true
    rm -f "$HOME_DIR/.config/systemd/user/CodexAgentManager.service" "$HOME_DIR/.config/systemd/user/default.target.wants/CodexAgentManager.service"
    runuser -u "$TARGET_USER" -- env XDG_RUNTIME_DIR="$RUNTIME_DIR" systemctl --user daemon-reload >/dev/null 2>&1 || true
    pkill -u "$TARGET_USER" -f "/opt/qexow-cam" >/dev/null 2>&1 || true
    pkill -u "$TARGET_USER" -f "codex-agent-manager/.*/cam\\.js" >/dev/null 2>&1 || true
    pkill -u "$TARGET_USER" -f "codex-agent-manager/bin/cam\\.js" >/dev/null 2>&1 || true
    pkill -u "$TARGET_USER" -f "codex-agent-manager/.*/daemon-entry\\.js" >/dev/null 2>&1 || true
    pkill -u "$TARGET_USER" -f "codex-agent-manager/src/daemon-entry\\.js" >/dev/null 2>&1 || true
    if [ "\${CAM_PRESERVE_STATE:-0}" != "1" ]; then
      rm -rf "$HOME_DIR/$CAM_HOME_NAME" "$HOME_DIR/$LEGACY_HOME_NAME"
    fi
  fi
fi
exit 0
`);

writeExecutable(path.join(debianDir, "postinst"), `#!/bin/sh
set -eu
APP_ROOT="${installedAppRoot}"
STATE_DIR="${installUserStateDir}"
STATE_FILE="${installUserStateFile}"
TARGET_USER="\${CAM_INSTALL_USER:-\${SUDO_USER:-}}"
install -d -m 0755 /usr/local/bin "$STATE_DIR"
ln -sf "$APP_ROOT/bin/cam" /usr/local/bin/cam
if [ -n "$TARGET_USER" ] && id "$TARGET_USER" >/dev/null 2>&1; then
  HOME_DIR="$(getent passwd "$TARGET_USER" | cut -d: -f6)"
  TARGET_UID="$(id -u "$TARGET_USER")"
  RUNTIME_DIR="/run/user/$TARGET_UID"
  printf '%s\\n' "$TARGET_USER" > "$STATE_FILE"
  chmod 0644 "$STATE_FILE"
  if command -v loginctl >/dev/null 2>&1; then
    loginctl enable-linger "$TARGET_USER" >/dev/null 2>&1 || true
  fi
  if [ -n "$HOME_DIR" ]; then
    runuser -u "$TARGET_USER" -- env CAM_APP_ROOT="$APP_ROOT" XDG_RUNTIME_DIR="$RUNTIME_DIR" /usr/local/bin/cam init || true
    runuser -u "$TARGET_USER" -- env CAM_APP_ROOT="$APP_ROOT" XDG_RUNTIME_DIR="$RUNTIME_DIR" /usr/local/bin/cam install-skills || true
    runuser -u "$TARGET_USER" -- env CAM_APP_ROOT="$APP_ROOT" XDG_RUNTIME_DIR="$RUNTIME_DIR" /usr/local/bin/cam install-service || true
  fi
fi
exit 0
`);

writeExecutable(path.join(debianDir, "prerm"), `#!/bin/sh
set -eu
STATE_FILE="${installUserStateFile}"
TARGET_USER="\${CAM_INSTALL_USER:-\${SUDO_USER:-}}"
if [ -z "$TARGET_USER" ] && [ -f "$STATE_FILE" ]; then
  TARGET_USER="$(cat "$STATE_FILE" 2>/dev/null || true)"
fi
if [ -n "$TARGET_USER" ] && id "$TARGET_USER" >/dev/null 2>&1; then
  TARGET_UID="$(id -u "$TARGET_USER")"
  RUNTIME_DIR="/run/user/$TARGET_UID"
  runuser -u "$TARGET_USER" -- env XDG_RUNTIME_DIR="$RUNTIME_DIR" /usr/local/bin/cam uninstall-service >/dev/null 2>&1 || true
  runuser -u "$TARGET_USER" -- env XDG_RUNTIME_DIR="$RUNTIME_DIR" systemctl --user disable --now CodexAgentManager.service >/dev/null 2>&1 || true
  HOME_DIR="$(getent passwd "$TARGET_USER" | cut -d: -f6)"
  if [ -n "$HOME_DIR" ]; then
    rm -f "$HOME_DIR/.config/systemd/user/CodexAgentManager.service" "$HOME_DIR/.config/systemd/user/default.target.wants/CodexAgentManager.service"
  fi
  runuser -u "$TARGET_USER" -- env XDG_RUNTIME_DIR="$RUNTIME_DIR" systemctl --user daemon-reload >/dev/null 2>&1 || true
  pkill -u "$TARGET_USER" -f "/opt/qexow-cam" >/dev/null 2>&1 || true
  pkill -u "$TARGET_USER" -f "codex-agent-manager/.*/cam\\.js" >/dev/null 2>&1 || true
  pkill -u "$TARGET_USER" -f "codex-agent-manager/bin/cam\\.js" >/dev/null 2>&1 || true
  pkill -u "$TARGET_USER" -f "codex-agent-manager/.*/daemon-entry\\.js" >/dev/null 2>&1 || true
  pkill -u "$TARGET_USER" -f "codex-agent-manager/src/daemon-entry\\.js" >/dev/null 2>&1 || true
fi
exit 0
`);

writeExecutable(path.join(debianDir, "postrm"), `#!/bin/sh
set -eu
STATE_FILE="${installUserStateFile}"
TARGET_USER="\${CAM_INSTALL_USER:-\${SUDO_USER:-}}"
if [ -z "$TARGET_USER" ] && [ -f "$STATE_FILE" ]; then
  TARGET_USER="$(cat "$STATE_FILE" 2>/dev/null || true)"
fi
rm -f /usr/local/bin/cam
if [ "$1" = "purge" ] || [ "$1" = "remove" ]; then
  if [ -n "$TARGET_USER" ] && id "$TARGET_USER" >/dev/null 2>&1; then
    HOME_DIR="$(getent passwd "$TARGET_USER" | cut -d: -f6)"
    if [ -n "$HOME_DIR" ]; then
      rm -rf "$HOME_DIR/.qexow-cam" "$HOME_DIR/.codex-agent-manager"
    fi
  fi
  rm -f "$STATE_FILE"
  rmdir "${installUserStateDir}" >/dev/null 2>&1 || true
fi
exit 0
`);

run("dpkg-deb", ["--build", "--root-owner-group", packageRoot, path.join(DIST, `qexow-cam_${pkg.version}_${debArch}.deb`)]);

const metadata = {
  packageName,
  version: pkg.version,
  arch,
  debArch,
  nodeVersion,
  builtAt: new Date().toISOString(),
  output: path.join(DIST, `qexow-cam_${pkg.version}_${debArch}.deb`),
  appRoot: installedAppRoot,
  launcher: "/usr/local/bin/cam",
  runtime: `${installedAppRoot}/bin/node`,
  bundle: `${installedAppRoot}/lib/cam-bundle.cjs`,
  builderHost: os.hostname(),
};
fs.writeFileSync(path.join(stagingRoot, "linux-package-metadata.json"), JSON.stringify(metadata, null, 2), "utf8");
console.log(JSON.stringify(metadata, null, 2));
