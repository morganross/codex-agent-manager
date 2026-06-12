#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

if (process.env.GITHUB_ACTIONS !== "true") {
  console.error("Installer payload builds are disabled locally. Use the GitHub release workflow.");
  process.exit(1);
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DIST = path.join(ROOT, "dist");

fs.mkdirSync(DIST, { recursive: true });

function run(cmd) {
  console.log(`> ${cmd}`);
  const result = spawnSync(cmd, { shell: true, stdio: "inherit", cwd: ROOT });
  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

function setWindowsGuiSubsystem(exePath) {
  const buffer = fs.readFileSync(exePath);
  const peOffset = buffer.readUInt32LE(0x3c);
  const subsystemOffset = peOffset + 24 + 0x44;
  buffer.writeUInt16LE(2, subsystemOffset);
  fs.writeFileSync(exePath, buffer);
}

run("npx esbuild bin/cam.js --bundle --platform=node --format=cjs --outfile=dist/cam-bundle.cjs --external:fsevents");

fs.writeFileSync(path.join(DIST, "sea-config.json"), JSON.stringify({
  main: path.join(DIST, "cam-bundle.cjs"),
  output: path.join(DIST, "cam-sea.blob"),
  disableExperimentalSEAWarning: true,
}, null, 2));

run("node --experimental-sea-config dist/sea-config.json");
fs.copyFileSync(process.execPath, path.join(DIST, "cam.exe"));
run("npx postject dist/cam.exe NODE_SEA_BLOB dist/cam-sea.blob --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2 --overwrite");
setWindowsGuiSubsystem(path.join(DIST, "cam.exe"));

const cscPath = "C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe";
if (!fs.existsSync(cscPath)) {
  throw new Error(`csc.exe not found at ${cscPath}`);
}
run(`"${cscPath}" /nologo /target:winexe /reference:System.Web.Extensions.dll /out:dist\\qexow-cam-gui.exe src\\windows\\QexowCamGui.cs`);

for (const file of fs.readdirSync(DIST)) {
  if (!new Set(["cam.exe", "qexow-cam-gui.exe"]).has(file)) {
    fs.rmSync(path.join(DIST, file), { recursive: true, force: true });
  }
}
