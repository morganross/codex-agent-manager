import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";

import { runDaemon } from "./daemon.js";
import { acquireSpawnLock, releaseSpawnLock, startKillSwitchMonitor, startResourceWatchdog } from "./security.js";

const CAM_DIR = path.join(os.homedir(), ".qexow-cam");
const LOCK_FILE = path.join(CAM_DIR, "tray.lock");
const LOG_FILE = path.join(CAM_DIR, "logs", "tray.log");
const CONFIG_FILE = path.join(CAM_DIR, "config.json");
const DEFAULT_PORT = 37631;

function ensureLogDir() {
  try {
    fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });
  } catch (_) {}
}

function log(level, msg) {
  const line = `[${new Date().toISOString()}] [${level}] ${msg}`;
  console.log(line);
  try {
    ensureLogDir();
    fs.appendFileSync(LOG_FILE, line + "\n");
  } catch (_) {}
}

function loadPort() {
  try {
    const cfg = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8"));
    return cfg.port || DEFAULT_PORT;
  } catch (_) {
    return DEFAULT_PORT;
  }
}

function isDaemonRunning(port) {
  return new Promise((resolve) => {
    const sock = new net.Socket();
    sock.setTimeout(2000);
    sock.once("connect", () => {
      sock.destroy();
      resolve(true);
    });
    sock.once("timeout", () => {
      sock.destroy();
      resolve(false);
    });
    sock.once("error", () => resolve(false));
    sock.connect(port, "127.0.0.1");
  });
}

let daemonBooted = false;
async function ensureDaemonRunning() {
  if (daemonBooted) return;
  daemonBooted = true;
  try {
    await runDaemon();
    log("INFO", "Daemon start requested internally.");
  } catch (err) {
    daemonBooted = false;
    log("ERROR", `Failed to start daemon internally: ${err.message}`);
  }
}

function acquireLock() {
  try {
    fs.mkdirSync(CAM_DIR, { recursive: true });
    if (fs.existsSync(LOCK_FILE)) {
      const oldPid = parseInt(fs.readFileSync(LOCK_FILE, "utf8").trim(), 10);
      if (oldPid && oldPid !== process.pid) {
        try {
          process.kill(oldPid, 0);
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
  try {
    fs.unlinkSync(LOCK_FILE);
  } catch (_) {}
}

export async function runTray() {
  startKillSwitchMonitor();
  startResourceWatchdog();
  log("INFO", "=== Qexow CAM Tray starting ===");

  if (!acquireLock()) {
    log("ERROR", "Could not acquire tray lock.");
    process.exit(1);
  }

  process.on("exit", releaseLock);
  process.on("SIGINT", () => process.exit(0));
  process.on("SIGTERM", () => process.exit(0));

  const port = loadPort();
  log("INFO", `CAM port: ${port}`);

  if (!(await isDaemonRunning(port))) {
    log("INFO", "Daemon is not running. Starting it internally.");
    await ensureDaemonRunning();
  } else {
    log("INFO", "Daemon already running.");
  }

  setInterval(async () => {
    const running = await isDaemonRunning(port);
    if (!running) {
      log("WARN", "Daemon stopped. Starting it internally.");
      await ensureDaemonRunning();
    } else {
      log("INFO", "tray.status.green");
    }
  }, 5000);
}
