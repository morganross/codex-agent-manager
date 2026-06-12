import fs from "node:fs";
import path from "node:path";
import os from "node:os";

// Paths
const CAM_DIR = path.join(os.homedir(), ".qexow-cam");
const LOCK_FILE = path.join(CAM_DIR, "spawn.lock");
const CIRCUIT_BREAKER = path.join(CAM_DIR, "circuit_breaker.json");

// Security helpers now stay entirely internal. They only manage local state
// and never patch or launch external processes.
export function enforceSpawnBlocks() {
  return;
}

export function acquireSpawnLock() {
  try {
    fs.mkdirSync(CAM_DIR, { recursive: true });
    if (fs.existsSync(LOCK_FILE)) {
      const stats = fs.statSync(LOCK_FILE);
      if (Date.now() - stats.mtimeMs > 15000) {
        fs.unlinkSync(LOCK_FILE);
      }
    }
    const fd = fs.openSync(LOCK_FILE, "wx");
    fs.writeSync(fd, String(Date.now()));
    fs.closeSync(fd);
    return true;
  } catch (err) {
    if (err.code === "EEXIST") return false;
    return false;
  }
}

export function releaseSpawnLock() {
  try {
    if (fs.existsSync(LOCK_FILE)) fs.unlinkSync(LOCK_FILE);
  } catch (_) {}
}

let recentSpawns = [];
export function checkCircuitBreaker() {
  if (fs.existsSync(CIRCUIT_BREAKER)) {
    try {
      const state = JSON.parse(fs.readFileSync(CIRCUIT_BREAKER, "utf8"));
      if (state.tripped) return false;
    } catch (_) {}
  }

  const now = Date.now();
  recentSpawns = recentSpawns.filter(t => now - t < 60000);

  if (recentSpawns.length >= 3) {
    fs.writeFileSync(CIRCUIT_BREAKER, JSON.stringify({ tripped: true, time: now }));
    return false;
  }

  recentSpawns.push(now);
  return true;
}

export function resetCircuitBreaker() {
  recentSpawns = [];
  try {
    if (fs.existsSync(CIRCUIT_BREAKER)) fs.unlinkSync(CIRCUIT_BREAKER);
  } catch (_) {}
}

export function startKillSwitchMonitor() {
  return;
}

export function startResourceWatchdog() {
  return;
}
