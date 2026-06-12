/**
 * src/tray.js — Qexow CAM System Tray (Node.js)
 *
 * Replaces the old C# CamTray.exe. Runs as a long-lived process:
 *   cam.exe tray
 *
 * Responsibilities:
 *  - Show a tray icon (green = daemon running, red = stopped)
 *  - Auto-start the CAM daemon if not already running
 *  - Provide menu: Status (opens browser), Start/Stop Daemon, Exit
 *  - Enforce single-instance via a lock file
 *  - Never spawn visible cmd/powershell windows
 */
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { createServer } from "node:http";

// Resolve paths safely in both SEA and regular Node.js contexts
function selfDir() {
  try {
    const u = import.meta.url;
    if (u) return path.dirname(fileURLToPath(u));
  } catch (_) {}
  // SEA context: use directory of executable
  return path.dirname(process.execPath);
}

const SELF_DIR = selfDir();

// ─── Paths ───────────────────────────────────────────────────────────────────
const CAM_DIR = path.join(os.homedir(), ".qexow-cam");
const LOCK_FILE = path.join(CAM_DIR, "tray.lock");
const LOG_FILE = path.join(CAM_DIR, "logs", "tray.log");
const CONFIG_FILE = path.join(CAM_DIR, "config.json");
const DEFAULT_PORT = 37631;

// ─── Logging ─────────────────────────────────────────────────────────────────
function ensureLogDir() {
  try { fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true }); } catch (_) {}
}
function log(level, msg) {
  const line = `[${new Date().toISOString()}] [${level}] ${msg}`;
  console.log(line);
  try {
    ensureLogDir();
    // Rotate if > 2MB
    try {
      const stat = fs.statSync(LOG_FILE);
      if (stat.size > 2 * 1024 * 1024) {
        fs.renameSync(LOG_FILE, LOG_FILE + ".1");
      }
    } catch (_) {}
    fs.appendFileSync(LOG_FILE, line + "\n");
  } catch (_) {}
}

// ─── Config ──────────────────────────────────────────────────────────────────
function loadPort() {
  try {
    const cfg = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8"));
    return cfg.port || DEFAULT_PORT;
  } catch (_) {
    return DEFAULT_PORT;
  }
}

// ─── Daemon health check ─────────────────────────────────────────────────────
function isDaemonRunning(port) {
  return new Promise((resolve) => {
    const sock = new net.Socket();
    sock.setTimeout(500);
    sock.once("connect", () => { sock.destroy(); resolve(true); });
    sock.once("timeout", () => { sock.destroy(); resolve(false); });
    sock.once("error", () => resolve(false));
    sock.connect(port, "127.0.0.1");
  });
}

// ─── Start daemon ─────────────────────────────────────────────────────────────
function startDaemon() {
  log("INFO", "Starting daemon...");
  try {
    // cam.exe daemon start   → spawns cam.exe daemon-run (detached, hidden)
    const exe = process.execPath; // This is cam.exe itself (the SEA)
    fs.mkdirSync(path.join(CAM_DIR, "logs"), { recursive: true });
    const daemonLogPath = path.join(CAM_DIR, "logs", "daemon.log");
    const out = fs.openSync(daemonLogPath, "a");
    const child = spawn(exe, ["daemon-run"], {
      detached: true,
      stdio: ["ignore", out, out],
      windowsHide: true,
      env: process.env,
    });
    child.unref();
    log("INFO", `Daemon spawned pid=${child.pid}`);
  } catch (err) {
    log("ERROR", `Failed to start daemon: ${err.message}`);
  }
}

// ─── Open browser status page ─────────────────────────────────────────────────
function openStatusPage(port) {
  const url = `http://127.0.0.1:${port}/status-ui`;
  log("INFO", `Opening status page: ${url}`);
  try {
    spawn("cmd.exe", ["/c", "start", "", url], {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    }).unref();
  } catch (err) {
    log("ERROR", `Failed to open browser: ${err.message}`);
  }
}

// ─── Single instance lock ─────────────────────────────────────────────────────
function acquireLock() {
  try {
    fs.mkdirSync(CAM_DIR, { recursive: true });
    const pid = String(process.pid);
    // Check if existing lock is still live
    if (fs.existsSync(LOCK_FILE)) {
      const oldPid = parseInt(fs.readFileSync(LOCK_FILE, "utf8").trim(), 10);
      if (oldPid && oldPid !== process.pid) {
        try {
          // Send signal 0 to check if process is alive
          process.kill(oldPid, 0);
          log("INFO", `Another tray instance running (pid=${oldPid}), exiting.`);
          process.exit(0);
        } catch (_) {
          // Process is dead, take over
          log("INFO", `Stale lock from pid=${oldPid}, taking over.`);
        }
      }
    }
    fs.writeFileSync(LOCK_FILE, pid);
    return true;
  } catch (err) {
    log("ERROR", `Lock error: ${err.message}`);
    return false;
  }
}

function releaseLock() {
  try { fs.unlinkSync(LOCK_FILE); } catch (_) {}
}

// ─── Systray binary path ──────────────────────────────────────────────────────
function getTrayBinPath() {
  const binName = "tray_windows_release.exe";
  // In SEA context: look next to cam.exe (installer puts it there)
  const nextToExe = path.join(path.dirname(process.execPath), binName);
  if (fs.existsSync(nextToExe)) return nextToExe;
  // Dev context: look in node_modules/systray2/traybin
  const devPath = path.join(SELF_DIR, "..", "node_modules", "systray2", "traybin", binName);
  if (fs.existsSync(devPath)) return devPath;
  // Fallback: same dir as this file
  const here = path.join(SELF_DIR, binName);
  if (fs.existsSync(here)) return here;
  return null;
}

// ─── Tray icon (base64 ICO embedded inline) ───────────────────────────────────
// 16x16 green circle ICO, base64-encoded
const ICO_GREEN_B64 =
  "AAABAAEAEBAAAAEAIABoBAAAFgAAACgAAAAQAAAAIAAAAAEAIAAAAAAAAAAAABMLAAATCwAAAAAAAAAAAAD" +
  "///8A////AP///wD///8A////AP///wD///8A////AP///wD///8A////AP///wD///8A////AP///wD///" +
  "8A////AP///wD///8A////AAAA/wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD///" +
  "8A////AP///wD///8AAAAAAAAAAAAAAAAAWv8XAAD/LQAA/ywAAP8rAAD/KwAA/ywAAP8tWv8XAAAAAP//" +
  "/wD///8A////AAAAAAAAAAAAAP8BAAD/tQAA//8AAP//AAD//wAA//8AAP//AAD/tQAA/wEAAAAA////AP" +
  "///wD///8AAAAAAAAAAAAA/8UAAP//AAD//wAA//8AAP//AAD//wAA//8AAP/FAAAAAAD///8A////AAAA" +
  "AAAAAAAAAP8CAAD//wAA//8AAP//AAD//wAA//8AAP//AAD/AgAAAAD///8A////AAAAAAAAAAAAWP/hAA" +
  "D//wAA//8AAP//AAD//wAA//8AAP//AAD/4Vj/AAAAAAD///8A////AAAAAAAAAAAAAP//AAD//wAA//8A" +
  "AP//AAD//wAA//8AAP//AAD//wAAAAAA////AP///wAAAAAAAAAAAAD//wAA//8AAP//AAD//wAA//8AAP/" +
  "/AAD//wAA//8AAAAAA////AP///wAAAAAAAAAAAABY/+EAAP//AAD//wAA//8AAP//AAD//wAA//8AAP/h" +
  "WP8AAAAAA////AP///wAAAAAAAAAAAAD/AgAA//8AAP//AAD//wAA//8AAP//AAD//wAA/wIAAAAA////AP" +
  "///wAAAAAAAAAAAAD/xQAA//8AAP//AAD//wAA//8AAP//AAD//wAA/8UAAAAAA////AP///wAAAAAAAAA" +
  "AAAD/AQAA/7UAAP//AAD//wAA//8AAP//AAD//wAA/7UAAP8BAAAAAP///wD///8AAAAAAAAAAAAAAAD/" +
  "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP///wD///8A////AP///wD///8AAAAAAAAAAAAAAAAAAAAAAAAAA" +
  "AAAAAAAAAAAAAAAAAAAD///8A////AP///wD///8A////AP///wD///8A////AP///wD///8A////AP///wD" +
  "///8A////AP///wAAAAAAAA==";

const ICO_RED_B64 =
  "AAABAAEAEBAAAAEAIABoBAAAFgAAACgAAAAQAAAAIAAAAAEAIAAAAAAAAAAAABMLAAATCwAAAAAAAAAAAAD" +
  "///8A////AP///wD///8A////AP///wD///8A////AP///wD///8A////AP///wD///8A////AP///wD///" +
  "8A////AP///wD///8A////AAAA/wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD///" +
  "8A////AP///wD///8AAAAAAAAAAAAAAAAAWv8XAAD/LQAA/ywAAP8rAAD/KwAA/ywAAP8tWv8XAAAAAP//" +
  "/wD///8A////AAAAAAAAAAAAAP8BAAD/tQAA//8AAP//AAD//wAA//8AAP//AAD/tQAA/wEAAAAA////AP" +
  "///wD///8AAAAAAAAAAAAA/8UAAP//AAD//wAA//8AAP//AAD//wAA//8AAP/FAAAAAAD///8A////AAAA" +
  "AAAAAAAAAP8CAAD//wAA//8AAP//AAD//wAA//8AAP//AAD/AgAAAAD///8A////AAAAAAAAAAAAWP/hAA" +
  "D//wAA//8AAP//AAD//wAA//8AAP//AAD/4Vj/AAAAAAD///8A////AAAAAAAAAAAAAP//AAD//wAA//8A" +
  "AP//AAD//wAA//8AAP//AAD//wAAAAAA////AP///wAAAAAAAAAAAAD//wAA//8AAP//AAD//wAA//8AAP/" +
  "/AAD//wAA//8AAAAAA////AP///wAAAAAAAAAAAABY/+EAAP//AAD//wAA//8AAP//AAD//wAA//8AAP/h" +
  "WP8AAAAAA////AP///wAAAAAAAAAAAAD/AgAA//8AAP//AAD//wAA//8AAP//AAD//wAA/wIAAAAA////AP" +
  "///wAAAAAAAAAAAAD/xQAA//8AAP//AAD//wAA//8AAP//AAD//wAA/8UAAAAAA////AP///wAAAAAAAAA" +
  "AAAD/AQAA/7UAAP//AAD//wAA//8AAP//AAD//wAA/7UAAP8BAAAAAP///wD///8AAAAAAAAAAAAAAAD/" +
  "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP///wD///8A////AP///wD///8AAAAAAAAAAAAAAAAAAAAAAAAAA" +
  "AAAAAAAAAAAAAAAAAAAD///8A////AP///wD///8A////AP///wD///8A////AP///wD///8A////AP///wD" +
  "///8A////AP///wAAAAAAAA==";

function writeIconFile(b64, filePath) {
  try {
    fs.writeFileSync(filePath, Buffer.from(b64, "base64"));
  } catch (_) {}
}

// ─── Main tray entry point ────────────────────────────────────────────────────
export async function runTray() {
  log("INFO", "=== Qexow CAM Tray starting ===");

  if (!acquireLock()) {
    log("ERROR", "Could not acquire lock, another instance may be running.");
    process.exit(1);
  }

  process.on("exit", releaseLock);
  process.on("SIGINT", () => process.exit(0));
  process.on("SIGTERM", () => process.exit(0));

  const port = loadPort();
  log("INFO", `Using CAM daemon port: ${port}`);

  // Auto-start daemon if not running
  const running = await isDaemonRunning(port);
  if (!running) {
    startDaemon();
    // Give daemon 2 seconds to start
    await new Promise((r) => setTimeout(r, 2000));
  } else {
    log("INFO", "Daemon already running.");
  }

  // Locate tray binary
  const trayBin = getTrayBinPath();
  if (!trayBin) {
    log("ERROR", "Could not find tray_windows_release.exe. Cannot show system tray icon.");
    // Fall back to minimal headless mode: just keep daemon alive
    setInterval(async () => {
      const alive = await isDaemonRunning(port);
      if (!alive) {
        log("WARN", "Daemon stopped, restarting...");
        startDaemon();
      }
    }, 10000);
    return;
  }

  log("INFO", `Using tray binary: ${trayBin}`);

  // Write icon files to temp dir
  const tmpDir = path.join(os.tmpdir(), "qexow-cam-tray");
  fs.mkdirSync(tmpDir, { recursive: true });
  const iconGreen = path.join(tmpDir, "icon_green.ico");
  const iconRed = path.join(tmpDir, "icon_red.ico");
  writeIconFile(ICO_GREEN_B64, iconGreen);
  writeIconFile(ICO_RED_B64, iconRed);

  // Dynamically import systray2
  let SysTray;
  try {
    const mod = await import("systray2");
    SysTray = mod.default || mod.SysTray || mod;
  } catch (err) {
    log("ERROR", `Failed to import systray2: ${err.message}`);
    process.exit(1);
  }

  let daemonRunning = await isDaemonRunning(port);
  const iconPath = daemonRunning ? iconGreen : iconRed;

  const itemStatus = {
    title: "Open Status Window",
    tooltip: "Open the CAM status dashboard in your browser",
    checked: false,
    enabled: true,
  };
  const itemSep = { title: "<SEPARATOR>", tooltip: "", checked: false, enabled: false };
  const itemStartDaemon = {
    title: "Start Daemon",
    tooltip: "Start the CAM background daemon",
    checked: false,
    enabled: !daemonRunning,
  };
  const itemStopDaemon = {
    title: "Stop Daemon",
    tooltip: "Stop the CAM background daemon",
    checked: false,
    enabled: daemonRunning,
  };
  const itemSep2 = { title: "<SEPARATOR>", tooltip: "", checked: false, enabled: false };
  const itemExit = {
    title: "Exit",
    tooltip: "Exit the Qexow CAM tray application",
    checked: false,
    enabled: true,
  };

  const systray = new SysTray({
    menu: {
      icon: iconPath,
      isTemplateIcon: false,
      title: "",
      tooltip: "Qexow CAM",
      items: [itemStatus, itemSep, itemStartDaemon, itemStopDaemon, itemSep2, itemExit],
    },
    debug: false,
    copyDir: tmpDir,
  });

  systray.onClick((action) => {
    const title = action?.item?.title || "";
    if (title === "Open Status Window") {
      openStatusPage(port);
    } else if (title === "Start Daemon") {
      startDaemon();
    } else if (title === "Stop Daemon") {
      // Send shutdown to daemon HTTP API
      try {
        const req = require("http").request({
          hostname: "127.0.0.1",
          port,
          path: "/shutdown",
          method: "POST",
          timeout: 2000,
        }, () => {});
        req.on("error", () => {});
        req.end();
      } catch (_) {}
      log("INFO", "Sent daemon shutdown request.");
    } else if (title === "Exit") {
      log("INFO", "Exit clicked. Stopping tray.");
      systray.kill(false);
      process.exit(0);
    }
  });

  await systray.ready();
  log("INFO", "Tray icon displayed successfully.");

  // Poll daemon status every 5 seconds and update icon
  setInterval(async () => {
    const nowRunning = await isDaemonRunning(port);
    if (nowRunning !== daemonRunning) {
      daemonRunning = nowRunning;
      log("INFO", `Daemon status changed: ${daemonRunning ? "running" : "stopped"}`);
      const newIcon = daemonRunning ? iconGreen : iconRed;
      try {
        systray.sendAction({
          type: "update-menu",
          item: {
            ...systray.internalId,
            icon: newIcon,
            items: [
              itemStatus,
              itemSep,
              { ...itemStartDaemon, enabled: !daemonRunning },
              { ...itemStopDaemon, enabled: daemonRunning },
              itemSep2,
              itemExit,
            ],
          },
        });
      } catch (_) {}

      // Auto-restart daemon if it stopped unexpectedly
      if (!daemonRunning) {
        log("WARN", "Daemon stopped unexpectedly. Restarting in 3s...");
        setTimeout(() => startDaemon(), 3000);
      }
    }
  }, 5000);
}
