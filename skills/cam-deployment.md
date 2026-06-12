# Skill: Qexow CAM Remote Deployment Policy

Qexow CAM no longer supports autonomous remote shell deployment.

Do not install CAM on remote machines by SSH, curl, bash, PowerShell, Python, systemd, cron, scheduled task, or any other external command runner. CAM is a normal local Windows application and must not recreate the old remote deployment or polling system.

## Current Behavior

- Remote peers may appear as Codex-managed metadata discovered from Codex state.
- CAM does not open network ports for its daemon.
- CAM does not perform SSH routing.
- CAM does not poll remote mailboxes.
- CAM does not bootstrap remote daemons.

## If A User Requests Remote Deployment

Explain that remote shell deployment was intentionally removed. Do not provide or execute replacement shell commands from CAM.
