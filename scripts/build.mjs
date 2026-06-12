#!/usr/bin/env node
/**
 * Build script for cam.exe — a Node.js Single Executable Application (SEA).
 *
 * Output:
 *   dist/cam.exe
 *   dist/cam-linux-x64 (optional)
 *   dist/cam-linux-arm64 (optional)
 *
 * The old remote peer helper bundle and tray helper binary have been removed.
 */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DIST = path.join(ROOT, "dist");

fs.mkdirSync(DIST, { recursive: true });

function run(cmd, opts = {}) {
  console.log(`> ${cmd}`);
  const result = spawnSync(cmd, { shell: true, stdio: "inherit", cwd: ROOT, ...opts });
  if (result.status !== 0) {
    console.error(`Command failed: ${cmd}`);
    process.exit(result.status || 1);
  }
}

console.log("\n[BUILD] Step 1: Bundling with esbuild...");
run(`npx esbuild bin/cam.js --bundle --platform=node --format=cjs --outfile=dist/cam-bundle.cjs --external:fsevents`);

console.log("\n[BUILD] Step 2: Writing SEA config...");
const seaConfig = {
  main: path.join(DIST, "cam-bundle.cjs"),
  output: path.join(DIST, "cam-sea.blob"),
  disableExperimentalSEAWarning: true,
};
fs.writeFileSync(path.join(DIST, "sea-config.json"), JSON.stringify(seaConfig, null, 2));

console.log("\n[BUILD] Step 3: Generating SEA blob...");
run(`node --experimental-sea-config dist/sea-config.json`);

console.log("\n[BUILD] Step 4: Copying node.exe -> dist/cam.exe...");
fs.copyFileSync(process.execPath, path.join(DIST, "cam.exe"));

console.log("\n[BUILD] Step 5: Injecting blob into cam.exe via postject...");
run(`npx postject dist/cam.exe NODE_SEA_BLOB dist/cam-sea.blob --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2 --overwrite`);

const home = os.homedir();
const x64Base = path.join(home, ".bin", "node-v22.22.3-linux-x64", "bin", "node");
const arm64Base = path.join(home, ".bin", "node-v22.22.3-linux-arm64", "bin", "node");
let hasX64 = false;
let hasArm64 = false;

if (fs.existsSync(x64Base)) {
  console.log("\n[BUILD] Copying and injecting into dist/cam-linux-x64...");
  fs.copyFileSync(x64Base, path.join(DIST, "cam-linux-x64"));
  run(`npx postject dist/cam-linux-x64 NODE_SEA_BLOB dist/cam-sea.blob --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2 --overwrite`);
  hasX64 = true;
}

if (fs.existsSync(arm64Base)) {
  console.log("\n[BUILD] Copying and injecting into dist/cam-linux-arm64...");
  fs.copyFileSync(arm64Base, path.join(DIST, "cam-linux-arm64"));
  run(`npx postject dist/cam-linux-arm64 NODE_SEA_BLOB dist/cam-sea.blob --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2 --overwrite`);
  hasArm64 = true;
}

console.log("\n[BUILD] Step 6: Cleaning up intermediate dist files...");
const keep = new Set(["cam.exe", "cam-bundle.cjs", "cam-linux-x64", "cam-linux-arm64"]);
for (const file of fs.readdirSync(DIST)) {
  if (!keep.has(file)) {
    try {
      fs.rmSync(path.join(DIST, file), { recursive: true, force: true });
    } catch (e) {
      console.warn(`[BUILD] Could not delete ${file}: ${e.message}`);
    }
  }
}

console.log("\n[BUILD] ✅ Build complete! Outputs:");
console.log(`  dist/cam.exe         — Windows x64 binary`);
if (hasX64) console.log(`  dist/cam-linux-x64   — Linux x64 binary`);
if (hasArm64) console.log(`  dist/cam-linux-arm64 — Linux arm64 binary`);
console.log(`  dist/cam-bundle.cjs  — Raw Javascript bundle`);
