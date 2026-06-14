import fs from "node:fs";
import path from "node:path";
import os from "node:os";

function detectAppRoot() {
  if (process.env.CAM_APP_ROOT) {
    return path.resolve(process.env.CAM_APP_ROOT);
  }
  if (process.argv[1]) {
    return path.resolve(path.dirname(process.argv[1]), "..");
  }
  return path.resolve(process.cwd());
}

const REPO_ROOT = detectAppRoot();
const CAM_DIR = path.join(os.homedir(), ".qexow-cam");
const DOCS_DIR = path.join(CAM_DIR, "docs");
const CODEX_HOME = path.join(os.homedir(), ".codex");
const AGY_HOME = path.join(os.homedir(), ".gemini", "antigravity");
const CAM_SKILL_NAME = "qexow-cam-messaging";
const DOC_FILENAMES = [
  "README.md",
  "howto-use-qexow-cam.md",
  "qexow-cam-plain-english.md",
];
const APP_ROOT = REPO_ROOT;

function firstExistingFile(candidates) {
  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function readJsonSafe(file, fallback = {}) {
  try {
    if (!file || !fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function unique(values) {
  return [...new Set((values || []).filter(Boolean))];
}

function isAbsoluteExistingDir(dir) {
  if (!dir || typeof dir !== "string") return false;
  if (!path.isAbsolute(dir)) return false;
  try {
    return fs.existsSync(dir) && fs.statSync(dir).isDirectory();
  } catch {
    return false;
  }
}

function isLikelyWorkspaceRoot(dir) {
  if (!isAbsoluteExistingDir(dir)) return false;
  const normalized = normalizeDir(dir)?.toLowerCase() || "";
  const home = normalizeDir(os.homedir())?.toLowerCase() || "";
  const camHome = normalizeDir(CAM_DIR)?.toLowerCase() || "";
  const codexHome = normalizeDir(CODEX_HOME)?.toLowerCase() || "";
  const agyHome = normalizeDir(AGY_HOME)?.toLowerCase() || "";
  const appRoot = normalizeDir(APP_ROOT)?.toLowerCase() || "";
  if (!normalized) return false;
  if (normalized === path.parse(normalized).root.toLowerCase()) return false;
  if (normalized === camHome || normalized.startsWith(`${camHome}${path.sep}`.toLowerCase())) return false;
  if (normalized === codexHome || normalized.startsWith(`${codexHome}${path.sep}`.toLowerCase())) return false;
  if (normalized === agyHome || normalized.startsWith(`${agyHome}${path.sep}`.toLowerCase())) return false;
  if (appRoot && (normalized === appRoot || normalized.startsWith(`${appRoot}${path.sep}`.toLowerCase()))) return false;
  if (process.platform === "win32") {
    if (/^[a-z]:\\home\\ubuntu(\\|$)/i.test(normalized)) return false;
    if (/^[a-z]:\\opt\\(\\|$)/i.test(normalized)) return false;
    if (/^[a-z]:\\program files( \(x86\))?(\\|$)/i.test(normalized)) return false;
    if (/^[a-z]:\\windows(\\|$)/i.test(normalized)) return false;
  } else {
    if (home && normalized.startsWith(`${home}/.codex/`)) return false;
    if (home && normalized.startsWith(`${home}/.gemini/`)) return false;
  }
  return true;
}

function normalizeDir(dir) {
  try {
    return path.resolve(String(dir));
  } catch {
    return null;
  }
}

function decodeFileUri(uri) {
  if (!String(uri || "").startsWith("file://")) return null;
  try {
    const decoded = decodeURIComponent(String(uri).replace(/^file:\/\//i, ""));
    if (/^\/[A-Za-z]:/.test(decoded)) return decoded.slice(1);
    return decoded;
  } catch {
    return null;
  }
}

function installBundledDoc(logFunc, relativeSourcePath, destinationPath, label) {
  const source = firstExistingFile([
    path.join(REPO_ROOT, relativeSourcePath),
    path.join(process.cwd(), relativeSourcePath),
    path.join(APP_ROOT, relativeSourcePath),
    path.join(path.dirname(process.execPath), relativeSourcePath),
  ]);
  if (!source) {
    logFunc("bootstrap.antigravity.docs.missing", {
      message: `${label} source not found for local CAM docs install`,
    });
    return false;
  }
  fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
  fs.copyFileSync(source, destinationPath);
  logFunc("bootstrap.antigravity.docs", {
    message: `${label} installed locally at ${destinationPath}`,
  });
  return true;
}

function bundledDocSourceMap() {
  return new Map([
    ["README.md", firstExistingFile([
      path.join(REPO_ROOT, "README.md"),
      path.join(process.cwd(), "README.md"),
      path.join(APP_ROOT, "README.md"),
      path.join(path.dirname(process.execPath), "README.md"),
    ])],
    ["howto-use-qexow-cam.md", firstExistingFile([
      path.join(REPO_ROOT, "docs", "howto-use-qexow-cam.md"),
      path.join(process.cwd(), "docs", "howto-use-qexow-cam.md"),
      path.join(APP_ROOT, "docs", "howto-use-qexow-cam.md"),
      path.join(path.dirname(process.execPath), "docs", "howto-use-qexow-cam.md"),
    ])],
    ["qexow-cam-plain-english.md", firstExistingFile([
      path.join(REPO_ROOT, "docs", "qexow-cam-plain-english.md"),
      path.join(process.cwd(), "docs", "qexow-cam-plain-english.md"),
      path.join(APP_ROOT, "docs", "qexow-cam-plain-english.md"),
      path.join(path.dirname(process.execPath), "docs", "qexow-cam-plain-english.md"),
    ])],
  ]);
}

function stateValue(state, key, fallback = null) {
  if (state && Object.prototype.hasOwnProperty.call(state, key)) return state[key];
  const persisted = state?.["electron-persisted-atom-state"];
  if (persisted && Object.prototype.hasOwnProperty.call(persisted, key)) return persisted[key];
  return fallback;
}

function discoverCodexWorkspaceRoots() {
  const state = readJsonSafe(path.join(CODEX_HOME, ".codex-global-state.json"), {});
  const roots = [
    ...stateValue(state, "active-workspace-roots", []),
    ...stateValue(state, "electron-saved-workspace-roots", []),
    ...Object.values(stateValue(state, "thread-workspace-root-hints", {}) || {}),
  ];
  return unique(
    roots
      .map(normalizeDir)
      .filter((dir) => dir && dir !== "outside-of-project" && isLikelyWorkspaceRoot(dir)),
  );
}

function discoverRegistryRoots() {
  const registry = readJsonSafe(path.join(CAM_DIR, "agents.json"), {});
  const roots = [];
  for (const agent of Object.values(registry?.agents || {})) {
    if (!agent?.cwd || agent.cwd === "outside-of-project") continue;
    const hostKind = String(agent.hostKind || "").toLowerCase();
    const transport = String(agent.transport || "").toLowerCase();
    if (hostKind && hostKind !== "local" && transport !== "antigravity") continue;
    roots.push(agent.cwd);
  }
  return unique(
    roots
      .map(normalizeDir)
      .filter((dir) => dir && isLikelyWorkspaceRoot(dir)),
  );
}

function discoverAntigravityProjectRoots() {
  const roots = [];
  const projectsDir = path.join(os.homedir(), ".gemini", "config", "projects");
  if (fs.existsSync(projectsDir)) {
    for (const entry of fs.readdirSync(projectsDir, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
      const project = readJsonSafe(path.join(projectsDir, entry.name), {});
      const resources = project?.projectResources?.resources || [];
      for (const resource of resources) {
        const folder = decodeFileUri(resource?.folderUri);
        if (folder) roots.push(folder);
      }
    }
  }
  return unique(
    roots
      .map(normalizeDir)
      .filter((dir) => dir && isLikelyWorkspaceRoot(dir)),
  );
}

function discoverWorkspaceInstallRoots() {
  const localRoots = process.env.CAM_APP_ROOT
    ? []
    : [
        normalizeDir(REPO_ROOT),
        normalizeDir(process.cwd()),
      ];
  return unique([
    ...localRoots,
    ...discoverCodexWorkspaceRoots(),
    ...discoverRegistryRoots(),
    ...discoverAntigravityProjectRoots(),
  ].filter((dir) => dir && isLikelyWorkspaceRoot(dir)));
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function installDocCopiesIntoDir(docSourceMap, destinationDir) {
  ensureDir(destinationDir);
  for (const name of DOC_FILENAMES) {
    const source = docSourceMap.get(name);
    if (!source) continue;
    fs.copyFileSync(source, path.join(destinationDir, name));
  }
}

function skillMarkdownForBundle({ destBossMd, referenceDirHint, localReadme, localHowto, localOverview }) {
  return `---
name: qexow-cam-messaging
description: Send and receive messages to/from other agents using the Qexow CAM protocol.
---
# Instructions

You are connected to the Qexow CAM messaging fabric. Communicate through the local Qexow CAM daemon only.

> **Boss Agents:** If you are a Boss agent, please read the rules of engagement at:
> \`${destBossMd}\`

> **Preferred local CAM docs on this machine:**
> \`${localReadme}\`
> \`${localHowto}\`
> \`${localOverview}\`

> **Bundled reference copies in this skill install:**
> \`${referenceDirHint}/README.md\`
> \`${referenceDirHint}/howto-use-qexow-cam.md\`
> \`${referenceDirHint}/qexow-cam-plain-english.md\`

## Command Path Rules
Do not assume one CAM command shape works everywhere.

- Local Windows repo checkout: \`./cam.cmd ...\`
- Local Windows installed CAM on PATH: \`cam ...\`
- Remote Linux installed CAM on PATH: \`cam ...\`
- Remote Linux legacy repo checkout: \`node /home/ubuntu/codex-agent-manager/bin/cam.js ...\` (legacy/dev-only)

## Sending a Message
To send a message to another agent, use the installed Qexow CAM command. Do not use retired \`codex-agent-manager\` paths, direct CAM HTTP, or PowerShell helper scripts.

**Example CLI call:**
\`\`\`text
cam send operator "Hello" --from coder-bot
\`\`\`

When replying to a CAM GUI diagnostic test, send a CAM message back to the requested target mailbox and preserve the incoming \`correlationId\`. Use \`--message-type "cam-gui-test-reply"\` when the incoming message asks for it. Chat-only replies do not pass the GUI diagnostic. A valid GUI diagnostic reply must be accepted by the daemon as \`delivery: "received"\` and must answer the semantic test question in the prompt.

**Example diagnostic reply:**
\`\`\`text
cam send "CAM test, Kexau CAM test suite mailbox" "CAM_GUI_TEST_RESPONSE <testId>. Agent: coder-bot. Node: RyzenLaptop. Status: idle. The capital of Missouri is Jefferson City." --from coder-bot --correlation-id "<testId>" --message-type "cam-gui-test-reply"
\`\`\`

## Checking Your Inbox
To check for incoming messages, use the installed Qexow CAM command.

**Example CLI call:**
\`\`\`text
cam inbox coder-bot
\`\`\`
`;
}

function installCodexSkillBundle(targetDir, logFunc, bundleOptions) {
  ensureDir(targetDir);
  const referencesDir = ensureDir(path.join(targetDir, "references"));
  installDocCopiesIntoDir(bundleOptions.docSourceMap, referencesDir);
  const skillMd = skillMarkdownForBundle({
    destBossMd: bundleOptions.destBossMd,
    referenceDirHint: "references",
    localReadme: bundleOptions.localReadme,
    localHowto: bundleOptions.localHowto,
    localOverview: bundleOptions.localOverview,
  });
  fs.writeFileSync(path.join(targetDir, "SKILL.md"), skillMd.trim(), "utf8");
  logFunc("bootstrap.antigravity.skill", {
    message: `Codex CAM skill bundle installed/updated at ${targetDir}`,
  });
}

// Bootstrap / Auto-Discovery / OAuth Phase
export function bootstrapAntigravity(logFunc) {
  logFunc("bootstrap.antigravity.start", { message: "Verifying Codex and Antigravity Environments..." });

  logFunc("bootstrap.antigravity.info", {
    message: "External CLI probing is disabled. CAM only installs local messaging skill metadata.",
  });
  installLocalDocs(logFunc);
  installAntigravitySkills(logFunc);
  installCodexSkills(logFunc);

  logFunc("bootstrap.antigravity.complete", { message: "Environment Verification Complete" });
}

function installLocalDocs(logFunc) {
  fs.mkdirSync(DOCS_DIR, { recursive: true });
  installBundledDoc(logFunc, "README.md", path.join(DOCS_DIR, "README.md"), "CAM README");
  installBundledDoc(logFunc, path.join("docs", "howto-use-qexow-cam.md"), path.join(DOCS_DIR, "howto-use-qexow-cam.md"), "CAM how-to");
  installBundledDoc(logFunc, path.join("docs", "qexow-cam-plain-english.md"), path.join(DOCS_DIR, "qexow-cam-plain-english.md"), "CAM plain-English overview");
}

function installAntigravitySkills(logFunc) {
  const skillsDir = path.join(os.homedir(), ".gemini", "antigravity", "skills");
  const camSkillDir = path.join(skillsDir, "qexow-cam-messaging");
  const camExe = process.env.CAM_NODE_EXE || process.execPath;
  const docSourceMap = bundledDocSourceMap();
  
  if (!fs.existsSync(camSkillDir)) {
    fs.mkdirSync(camSkillDir, { recursive: true });
  }

  const skillDef = {
    name: "cam_send_message",
    description: `Send a message to another agent via the Qexow CAM (CAM) protocol. Use this to respond to incoming requests from other agents. This basic Antigravity send skill cannot satisfy strict CAM GUI diagnostics unless it can preserve correlationId and messageType cam-gui-test-reply. Boss Agents: If you are a Boss agent, please read the rules of engagement at: ${path.join(os.homedir(), ".qexow-cam", "boss.md")}`,
    entrypoint: `"${camExe}" send "{{TargetAgent}}" "{{MessageText}}" --from antigravity`,
    parameters: {
      type: "object",
      properties: {
        TargetAgent: { type: "string", description: "The name of the target agent to send the message to." },
        MessageText: { type: "string", description: "The text body of the message." }
      },
      required: ["TargetAgent", "MessageText"]
    }
  };

  fs.writeFileSync(path.join(camSkillDir, "skill.json"), JSON.stringify(skillDef, null, 2), "utf8");
  installDocCopiesIntoDir(docSourceMap, ensureDir(path.join(camSkillDir, "docs")));
  logFunc("bootstrap.antigravity.skill", { message: `Skill 'cam_send_message' successfully installed at ${camSkillDir}` });

  // Install Check Inbox Skill
  const inboxSkillDir = path.join(skillsDir, "qexow-cam-inbox");
  if (!fs.existsSync(inboxSkillDir)) {
    fs.mkdirSync(inboxSkillDir, { recursive: true });
  }

  const inboxSkillDef = {
    name: "cam_check_inbox",
    description: "Check your Qexow CAM inbox for any pending messages from other agents. Set WaitSeconds to block and wait for a response if none are currently available.",
    entrypoint: `"${camExe}" inbox antigravity --wait {{WaitSeconds}}`,
    parameters: {
      type: "object",
      properties: {
        WaitSeconds: { type: "integer", description: "Optional. Number of seconds to block and wait for a message if the inbox is currently empty (up to 30). Defaults to 20." }
      },
      required: []
    }
  };

  fs.writeFileSync(path.join(inboxSkillDir, "skill.json"), JSON.stringify(inboxSkillDef, null, 2), "utf8");
  logFunc("bootstrap.antigravity.skill", { message: `Skill 'cam_check_inbox' successfully installed at ${inboxSkillDir}` });

  // Install Eavesdrop Skill
  const eavesdropSkillDir = path.join(skillsDir, "qexow-cam-eavesdrop");
  if (!fs.existsSync(eavesdropSkillDir)) {
    fs.mkdirSync(eavesdropSkillDir, { recursive: true });
  }

  const eavesdropSkillDef = {
    name: "cam_eavesdrop",
    description: "Look back over the shoulder of another agent and retrieve their most recent execution history. This will show you exactly what they thought, the tools they executed, and the tool outputs. Use this to review their progress.",
    entrypoint: `"${camExe}" agent read "{{TargetAgent}}" --turns {{Turns}}`,
    parameters: {
      type: "object",
      properties: {
        TargetAgent: { type: "string", description: "The name of the agent to eavesdrop on." },
        Turns: { type: "integer", description: "The number of recent turns to retrieve. Defaults to 5." }
      },
      required: ["TargetAgent"]
    }
  };

  fs.writeFileSync(path.join(eavesdropSkillDir, "skill.json"), JSON.stringify(eavesdropSkillDef, null, 2), "utf8");
  logFunc("bootstrap.antigravity.skill", { message: `Skill 'cam_eavesdrop' successfully installed at ${eavesdropSkillDir}` });
}

function installCodexSkills(logFunc) {
  const docSourceMap = bundledDocSourceMap();
  const destBossMd = path.join(CAM_DIR, "boss.md");
  const srcBossMd = firstExistingFile([
    path.join(REPO_ROOT, "boss.md"),
    path.join(process.cwd(), "boss.md"),
    path.join(APP_ROOT, "boss.md"),
    path.join(path.dirname(process.execPath), "boss.md"),
  ]);
  if (srcBossMd) {
    if (!fs.existsSync(CAM_DIR)) fs.mkdirSync(CAM_DIR, { recursive: true });
    fs.copyFileSync(srcBossMd, destBossMd);
  }
  const localReadme = path.join(DOCS_DIR, "README.md");
  const localHowto = path.join(DOCS_DIR, "howto-use-qexow-cam.md");
  const localOverview = path.join(DOCS_DIR, "qexow-cam-plain-english.md");
  const globalTargets = [
    path.join(os.homedir(), ".agents", "skills", CAM_SKILL_NAME),
    path.join(CODEX_HOME, "skills", CAM_SKILL_NAME),
  ];
  const workspaceTargets = discoverWorkspaceInstallRoots().map((root) =>
    path.join(root, ".agents", "skills", CAM_SKILL_NAME),
  );
  const allTargets = unique([...globalTargets, ...workspaceTargets]);
  for (const targetDir of allTargets) {
    try {
      installCodexSkillBundle(targetDir, logFunc, {
        docSourceMap,
        destBossMd,
        localReadme,
        localHowto,
        localOverview,
      });
    } catch (error) {
      logFunc("bootstrap.antigravity.skill_target_failed", {
        message: `Failed to install CAM skill bundle at ${targetDir}: ${error.message}`,
      });
    }
  }
  logFunc("bootstrap.antigravity.skill_targets", {
    message: `Discovered ${workspaceTargets.length} workspace CAM skill target(s) and ${globalTargets.length} global Codex skill target(s)`,
  });
}
