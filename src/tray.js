/**
 * src/tray.js — Qexow CAM System Tray (Node.js, v2.1.2)
 *
 * Runs as: cam.exe tray
 *
 * Communicates directly with tray_windows_release.exe via JSON stdio protocol
 * (same protocol as systray2/systray package). This bypasses the broken
 * __dirname-based binary resolution in the bundled systray2 JS.
 */
import http from "node:http";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

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
    try {
      if (fs.existsSync(LOG_FILE) && fs.statSync(LOG_FILE).size > 2 * 1024 * 1024) {
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
  log("INFO", "Starting CAM daemon...");
  try {
    const exe = process.execPath; // cam.exe (the SEA itself)
    fs.mkdirSync(path.join(CAM_DIR, "logs"), { recursive: true });
    const daemonLogPath = path.join(CAM_DIR, "logs", "daemon.log");
    const out = fs.openSync(daemonLogPath, "a");
    const env = { ...process.env };
    // If no config exists yet, seed CAM_PORT so initConfig() doesn't throw
    if (!fs.existsSync(CONFIG_FILE)) {
      env.CAM_PORT = String(DEFAULT_PORT);
    }
    const child = spawn(exe, ["daemon-run"], {
      detached: true,
      stdio: ["ignore", out, out],
      windowsHide: true,
      env,
    });
    child.unref();
    log("INFO", `Daemon spawned pid=${child.pid}`);
  } catch (err) {
    log("ERROR", `Failed to start daemon: ${err.message}`);
  }
}

// ─── Stop daemon via HTTP ─────────────────────────────────────────────────────
function stopDaemon(port) {
  log("INFO", "Sending daemon shutdown...");
  const req = http.request({
    hostname: "127.0.0.1",
    port,
    path: "/shutdown",
    method: "POST",
    timeout: 2000,
  }, () => {});
  req.on("error", () => {});
  req.end();
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
    if (fs.existsSync(LOCK_FILE)) {
      const oldPid = parseInt(fs.readFileSync(LOCK_FILE, "utf8").trim(), 10);
      if (oldPid && oldPid !== process.pid) {
        try {
          process.kill(oldPid, 0); // throws if process is dead
          log("INFO", `Another tray instance running (pid=${oldPid}), exiting.`);
          process.exit(0);
        } catch (_) {
          log("INFO", `Stale lock from pid=${oldPid}, taking over.`);
        }
      }
    }
    fs.writeFileSync(LOCK_FILE, String(process.pid));
    return true;
  } catch (err) {
    log("ERROR", `Lock error: ${err.message}`);
    return false;
  }
}

function releaseLock() {
  try { fs.unlinkSync(LOCK_FILE); } catch (_) {}
}

// ─── Generate a valid 16x16 solid-color ICO file ─────────────────────────────
function createIco(r, g, b) {
  const width = 16, height = 16;
  const pixelDataSize = width * height * 4; // 32-bit BGRA
  const paddedRow = 4; // 16px wide / 8 = 2 bytes, padded to 4
  const andMaskSize = paddedRow * height;
  const imageSize = 40 + pixelDataSize + andMaskSize;
  const buf = Buffer.alloc(6 + 16 + imageSize, 0);
  let p = 0;
  buf.writeUInt16LE(0, p); p += 2;
  buf.writeUInt16LE(1, p); p += 2;
  buf.writeUInt16LE(1, p); p += 2;
  buf.writeUInt8(width, p); p++;
  buf.writeUInt8(height, p); p++;
  buf.writeUInt8(0, p); p++;
  buf.writeUInt8(0, p); p++;
  buf.writeUInt16LE(1, p); p += 2;
  buf.writeUInt16LE(32, p); p += 2;
  buf.writeUInt32LE(imageSize, p); p += 4;
  buf.writeUInt32LE(22, p); p += 4;
  buf.writeUInt32LE(40, p); p += 4;
  buf.writeInt32LE(width, p); p += 4;
  buf.writeInt32LE(height * 2, p); p += 4;
  buf.writeUInt16LE(1, p); p += 2;
  buf.writeUInt16LE(32, p); p += 2;
  buf.writeUInt32LE(0, p); p += 4;
  buf.writeUInt32LE(pixelDataSize, p); p += 4;
  buf.writeInt32LE(0, p); p += 4;
  buf.writeInt32LE(0, p); p += 4;
  buf.writeUInt32LE(0, p); p += 4;
  buf.writeUInt32LE(0, p); p += 4;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      buf.writeUInt8(b, p++);
      buf.writeUInt8(g, p++);
      buf.writeUInt8(r, p++);
      buf.writeUInt8(255, p++);
    }
  }
  // AND mask: already zero (buf was zeroed at alloc)
  return buf.toString("base64");
}

// ─── Locate the tray binary ───────────────────────────────────────────────────
function findTrayBin() {
  const binName = "tray_windows_release.exe";
  // 1. Next to cam.exe (installed location — primary)
  const nextToExe = path.join(path.dirname(process.execPath), binName);
  if (fs.existsSync(nextToExe)) return nextToExe;
  // 2. Dev: next to dist/cam.exe
  const distPath = path.join(path.dirname(process.execPath), binName);
  if (fs.existsSync(distPath)) return distPath;
  // 3. Dev: node_modules/systray2/traybin
  try {
    const __dir = typeof __dirname !== "undefined"
      ? __dirname
      : path.dirname(fileURLToPath(import.meta.url));
    const devPath = path.join(__dir, "..", "node_modules", "systray2", "traybin", binName);
    if (fs.existsSync(devPath)) return devPath;
  } catch (_) {}
  return null;
}

// ─── Direct tray binary protocol (JSON stdio) ─────────────────────────────────
// The tray_windows_release.exe binary communicates via JSON lines on stdin/stdout.
// Send: JSON { seq, type, item } to stdin
// Receive: JSON { seq, type, item } from stdout (click events)
// Initial message: send the menu definition, receive "ready" back

const SEP = { title: "<SEPARATOR>", tooltip: "", checked: false, enabled: false };

class TrayManager {
  constructor(binPath) {
    this._bin = binPath;
    this._proc = null;
    this._clickHandlers = [];
    this._seq = 0;
  }

  start(menu) {
    return new Promise((resolve, reject) => {
      log("INFO", `Spawning tray binary: ${this._bin}`);
      this._proc = spawn(this._bin, [], {
        stdio: ["pipe", "pipe", "pipe"],
        windowsHide: true,
      });

      this._proc.on("error", (err) => {
        log("ERROR", `Tray binary error: ${err.message}`);
        reject(err);
      });

      this._proc.on("exit", (code) => {
        log("INFO", `Tray binary exited: code=${code}`);
        process.exit(0);
      });

      // Parse stdout for click events (one JSON per line)
      let buf = "";
      this._proc.stdout.setEncoding("utf8");
      this._proc.stdout.on("data", (chunk) => {
        buf += chunk;
        const lines = buf.split("\n");
        buf = lines.pop();
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          try {
            const msg = JSON.parse(trimmed);
            if (msg.type === "action") {
              for (const handler of this._clickHandlers) {
                handler(msg);
              }
            }
          } catch (_) {}
        }
      });

      this._proc.stderr?.setEncoding("utf8");
      this._proc.stderr?.on("data", (d) => log("DEBUG", `tray-bin: ${d.trim()}`));

      // Send menu definition to stdin
      try {
        const initMsg = JSON.stringify({
          ...menu,
          seq_id: ++this._seq,
        });
        this._proc.stdin.write(initMsg + "\n");
        // Consider ready after a short delay
        setTimeout(() => resolve(), 500);
      } catch (err) {
        reject(err);
      }
    });
  }

  updateMenu(menu) {
    try {
      const msg = JSON.stringify({ ...menu, seq_id: ++this._seq });
      this._proc?.stdin?.write(msg + "\n");
    } catch (_) {}
  }

  onClick(handler) {
    this._clickHandlers.push(handler);
  }

  kill() {
    try { this._proc?.kill(); } catch (_) {}
  }
}

// ─── Build tray menu JSON ─────────────────────────────────────────────────────
function buildMenu(iconPath, daemonRunning) {
  return {
    icon: iconPath,
    title: "",
    tooltip: "Qexow CAM",
    items: [
      { title: "Open Status Window", tooltip: "Open CAM dashboard in browser", checked: false, enabled: true },
      SEP,
      { title: daemonRunning ? "● Daemon Running" : "○ Daemon Stopped", tooltip: "", checked: false, enabled: false },
      { title: "Start Daemon", tooltip: "Start the CAM daemon", checked: false, enabled: !daemonRunning },
      { title: "Stop Daemon", tooltip: "Stop the CAM daemon", checked: false, enabled: daemonRunning },
      SEP,
      { title: "Exit", tooltip: "Exit Qexow CAM tray", checked: false, enabled: true },
    ],
  };
}

// ─── Main tray entry point ────────────────────────────────────────────────────
export async function runTray() {
  log("INFO", "=== Qexow CAM Tray v2.1.2 starting ===");

  if (!acquireLock()) {
    log("ERROR", "Could not acquire lock.");
    process.exit(1);
  }

  process.on("exit", releaseLock);
  process.on("SIGINT", () => process.exit(0));
  process.on("SIGTERM", () => process.exit(0));

  const port = loadPort();
  log("INFO", `CAM port: ${port}`);

  // Auto-start daemon if not running
  let daemonRunning = await isDaemonRunning(port);
  if (!daemonRunning) {
    log("INFO", "Daemon not running — starting it now...");
    startDaemon();
    for (let i = 0; i < 10; i++) {
      await new Promise((r) => setTimeout(r, 500));
      if (await isDaemonRunning(port)) { daemonRunning = true; break; }
    }
    log("INFO", daemonRunning ? "Daemon is up." : "Daemon did not start in time (will retry).");
  } else {
    log("INFO", "Daemon already running.");
  }

  // Find tray binary
  const trayBin = findTrayBin();
  if (!trayBin) {
    log("ERROR", "tray_windows_release.exe not found. Cannot show tray icon.");
    // Headless: just keep daemon alive
    setInterval(async () => {
      if (!(await isDaemonRunning(port))) {
        log("WARN", "Daemon stopped, restarting...");
        startDaemon();
      }
    }, 10000);
    return;
  }
  log("INFO", `Tray binary: ${trayBin}`);

  // Generate icons as Base64 strings
  const iconGreen = createIco(0, 200, 0);
  const iconRed = createIco(200, 0, 0);

  const tray = new TrayManager(trayBin);

  tray.onClick((action) => {
    const title = action?.item?.title || "";
    log("INFO", `Tray click: ${title}`);
    if (title === "Open Status Window") {
      openStatusPage(port);
    } else if (title === "Start Daemon") {
      startDaemon();
    } else if (title === "Stop Daemon") {
      stopDaemon(port);
    } else if (title === "Exit") {
      log("INFO", "Exit clicked.");
      tray.kill();
      process.exit(0);
    }
  });

  const iconPath = daemonRunning ? iconGreen : iconRed;
  try {
    await tray.start(buildMenu(iconPath, daemonRunning));
    log("INFO", "Tray icon displayed. CAM is running.");
  } catch (err) {
    log("ERROR", `Failed to start tray: ${err.message}`);
    process.exit(1);
  }

  // Auto-open status page on launch
  setTimeout(async () => {
    if (daemonRunning || (await isDaemonRunning(port))) {
      openStatusPage(port);
    }
  }, 2000);

  // Poll daemon status every 5s
  setInterval(async () => {
    const nowRunning = await isDaemonRunning(port);
    if (nowRunning !== daemonRunning) {
      daemonRunning = nowRunning;
      log("INFO", `Daemon state changed: ${daemonRunning ? "running" : "stopped"}`);
      tray.updateMenu(buildMenu(daemonRunning ? iconGreen : iconRed, daemonRunning));
      if (!daemonRunning) {
        log("WARN", "Daemon stopped unexpectedly. Restarting in 3s...");
        setTimeout(() => startDaemon(), 3000);
      }
    }
  }, 5000);
}
