# Qexow CAM

`qexow-cam` is a local daemon and CLI for routing messages between named agents without touching Codex Desktop UI state or transcript files.

The manager has two strict boundaries:

- Codex app-server is started only as `codex app-server --listen stdio://`.
- The manager HTTP API binds only to `127.0.0.1:37631`.

Remote peer records are discovered from Codex-managed state. CAM itself does not run SSH, shell scripts, Python helpers, polling scripts, or remote installers.

## Install

From this directory on Windows:

```powershell
.\cam.cmd init
.\cam.cmd doctor
.\cam.cmd daemon start
.\cam.cmd daemon status
```

The wrappers use `CAM_NODE_EXE` when set, otherwise they use `node` from `PATH`:

```powershell
$env:CAM_NODE_EXE = "C:\path\to\node.exe"
```

Linux binaries are produced by the release build for packaging and inspection. CAM no longer ships an autonomous remote shell installer.

Install login/reboot persistence:

```powershell
.\cam.cmd install-service
```

`install-service` records local CAM startup metadata only. It does not create scheduled tasks, systemd units, cron jobs, shell scripts, or hidden helper launchers.

On daemon start, CAM also rehydrates any already-registered agents with saved thread IDs so the next reboot usually needs less manual cleanup.

## Basic Use

```powershell
.\cam.cmd agent create frontend-local --cwd "C:\path\to\workspace"
.\cam.cmd agent create backend-local --cwd "C:\path\to\workspace"
.\cam.cmd agent create backend-local --cwd "C:\path\to\workspace" --model gpt-5.3-codex-spark --model-provider openai
.\cam.cmd agent list
.\cam.cmd agent read backend-local
.\cam.cmd inbox backend-local
.\cam.cmd logs
```

### Sending Messages

Message routing is the core function of Qexow CAM. You can easily send messages to any registered agent using the native `send` command.

```powershell
.\cam.cmd send backend-local "Please reply with your node name and cwd."
```
Optionally, specify which agent the message is from:
```powershell
.\cam.cmd send backend-local "Are you alive?" --from frontend-local
```

### Bulk model / effort / speed switching

Each agent can store a preferred model, provider, reasoning effort, and service tier without changing its chat, session UUID, or agent alias.

```powershell
.\cam.cmd agent set-model backend-local --model gpt-5.3-codex-spark --model-provider openai
.\cam.cmd agent set-model frontend-local --model gpt-5.5 --model-provider openai
.\cam.cmd agent set-model frontend-local --model gpt-5.5 --model-provider openai --effort medium --speed standard
.\cam.cmd agent set-model frontend-local --effort xhigh --speed fast
```

Do not use `--recreate`. It can start a new thread and swap the agent to that new session, which breaks the one chat/session/agent identity map. Model changes should update the existing agent preference only.

The safe form is always `cam agent set-model <name> --model <id> --model-provider <provider> --effort <minimal|low|medium|high|xhigh> --speed <standard|fast>` with no recreate flag. Partial updates are allowed.

Use `--speed standard` for normal speed. CAM stores that as no service tier override. Use `--speed fast` for Fast mode, which CAM sends as `serviceTier: "fast"` on future `turn/start` calls. Advanced callers may use `--service-tier <tier>` instead of `--speed`, but never use `default`.

Reasoning effort accepts `minimal`, `low`, `medium`, `high`, or `xhigh`; `extra-high` is normalized to `xhigh`.

If delivery through `turn/start` or `turn/steer` fails, the message is saved in a durable mailbox. Queued messages are surfaced into the next successful turn for that target agent.

## Remote Peer Metadata

CAM can list Codex-managed remote peers that already exist in Codex state, but CAM does not contact those machines directly. SSH routing, reverse mailbox polling, exponential backoff polling, and autonomous remote deployment have been removed.

## Storage

Default user-local state:

```text
C:\Users\<user>\.qexow-cam
/home/ubuntu/.qexow-cam
```

Important files:

```text
config.json
agents.json
mailbox.jsonl
events.jsonl
logs/daemon.log
secrets/local-api-token
```

Set `CAM_HOME` to use a different state directory.

## Determine Active vs Archived Chats

CAM discovers local Codex chats from Codex-managed JSON state and session metadata. It does not run Python or external database inspection helpers.

Use the files on disk as a quick visual signal only:

- Active transcripts: `$env:USERPROFILE\.codex\sessions\...`
- Archived transcripts: `$env:USERPROFILE\.codex\archived_sessions\...`

If your environment has a different `CAM_HOME` path than the default, use the path configured in that environment for `state_*.sqlite` and transcript folders.

## Security

- Codex app-server is spawned over stdio only.
- CLI-to-daemon API binds to `127.0.0.1`.
- CLI requests require `secrets/local-api-token`.
- Remote SSH execution and remote polling are disabled.
- Tokens, logs, mailbox data, and generated local state are ignored by git.
- Do not open public ports for Codex app-server or the manager daemon.
