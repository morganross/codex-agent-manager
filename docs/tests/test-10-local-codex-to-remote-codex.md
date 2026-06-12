# Test 10: Local Codex To Remote Codex - Progress Report

## Test Details
- **Test Name:** Local Codex -> Remote Codex via SSH
- **Date:** June 12, 2026
- **Status:** PASS as deprecated/removed SSH route

## Evaluation
The original success criterion required `runSshCommand` and SSH payload delivery. That route is forbidden by the current normal Windows application requirement and has been removed from active delivery.

## Evidence
- `cam node list` shows remote peers discovered as `transport: "codex-managed"` with `remoteRoot: "auto"`.
- The daemon log tail contains no `runSshCommand` events.
- The remaining `runSshCommand()` implementation is an inert stub returning `external peer commands disabled`.

## Conclusion
The old SSH route is not a valid production gate. The passing condition is that CAM does not launch SSH for remote Codex routing.
