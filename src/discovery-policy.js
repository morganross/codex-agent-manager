const TEMPORARY_NAME_RE = /^(audit|assess|check|find|inspect|locate|map|prepare|restore|test)-/i;
const CAM_MESSAGE_NAME_RE = /^codex-agent-manager-message-messageid-/i;
const GENERIC_CODEX_CHAT_RE = /^codex-chat-agent(?:-\d+)?$/i;

export function sourceKind(source) {
  if (!source) return "unknown";
  if (typeof source === "string") return source || "unknown";
  if (source?.subagent?.thread_spawn) return "machine-subagent";
  return "machine-generated";
}

export function classifyThreadDiscovery(thread, proposedName, cwd) {
  const name = String(proposedName || "").trim();
  const kind = sourceKind(thread?.source);

  if (!thread?.id) {
    return { disposition: "rejected", reason: "missing-thread-id", sourceKind: kind, approved: false };
  }
  if (!cwd || cwd === "outside-of-project") {
    return { disposition: "rejected", reason: "missing-workspace", sourceKind: kind, approved: false };
  }
  if (kind === "machine-subagent") {
    return { disposition: "quarantined", reason: "machine-spawned-subagent", sourceKind: kind, approved: false };
  }
  if (CAM_MESSAGE_NAME_RE.test(name)) {
    return { disposition: "quarantined", reason: "cam-message-session", sourceKind: kind, approved: false };
  }
  if (GENERIC_CODEX_CHAT_RE.test(name)) {
    return { disposition: "candidate", reason: "generic-codex-chat-title", sourceKind: kind, approved: false };
  }
  if (TEMPORARY_NAME_RE.test(name)) {
    return { disposition: "candidate", reason: "temporary-work-title", sourceKind: kind, approved: false };
  }
  if (kind === "machine-generated") {
    return { disposition: "candidate", reason: "machine-generated-source", sourceKind: kind, approved: false };
  }
  return { disposition: "approved", reason: "direct-human-session", sourceKind: kind, approved: true };
}

export function classifyRegistryAgent(agent) {
  if (!agent || typeof agent !== "object") {
    return { disposition: "rejected", reason: "invalid-agent", approved: false };
  }
  const existing = String(agent.discoveryDisposition || "").trim();
  if (existing && existing !== "approved") {
    return {
      disposition: existing,
      reason: agent.discoveryReason || "existing-non-approved-disposition",
      approved: false,
    };
  }
  if (agent.approvedForSync === false) {
    return {
      disposition: existing || "candidate",
      reason: agent.discoveryReason || "not-approved-for-sync",
      approved: false,
    };
  }
  if (!agent.name) {
    return { disposition: "rejected", reason: "missing-agent-name", approved: false };
  }
  return {
    disposition: "approved",
    reason: agent.discoveryReason || "registry-approved",
    approved: true,
  };
}

export function discoveryCounts(rows = []) {
  const counts = { total: 0, approved: 0, candidate: 0, quarantined: 0, rejected: 0 };
  for (const row of rows || []) {
    counts.total += 1;
    const disposition = String(row?.disposition || "candidate");
    if (Object.prototype.hasOwnProperty.call(counts, disposition)) {
      counts[disposition] += 1;
    }
  }
  return counts;
}
