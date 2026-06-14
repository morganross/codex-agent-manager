# How To Use Qexow CAM

Qexow CAM should be used from the machine where CAM is installed. Read your perspective first. On local Windows, use the Windows command forms. On a remote Linux node that already has CAM installed, use the Linux command forms there and do not wrap them in a second SSH hop unless you are intentionally operating on another node.

## Command Shapes By Perspective

Local Windows repo checkout:

```powershell
.\cam.cmd doctor
.\cam.cmd agent list
.\cam.cmd send operator "Hello"
```

Local Windows installed CAM on PATH:

```powershell
cam doctor
cam agent list
cam send operator "Hello"
```

Remote Linux installed CAM on PATH:

```bash
cam doctor
cam agent list
cam send operator "Hello"
```

Remote Linux legacy repo checkout at `/home/ubuntu/codex-agent-manager`:

```bash
node /home/ubuntu/codex-agent-manager/bin/cam.js doctor
node /home/ubuntu/codex-agent-manager/bin/cam.js agent list
node /home/ubuntu/codex-agent-manager/bin/cam.js send operator "Hello"
```

Do not report cached CAM output as fresh state. Rerun the command from the correct machine first. Use the installed `cam` command when it exists. Treat the repo-checkout Linux command form as compatibility/dev-only.

## Core Commands

Check local CAM health:

```text
doctor
daemon status
agent list
```

Send a message:

```text
send <target-agent> "<message>" [--from <sender-agent>]
```

Read inbox:

```text
inbox <agent-name>
```

Read an agent thread snapshot:

```text
agent read <agent-name>
```

Export inventory for remote discovery:

```text
inventory export
```

## GUI Diagnostic Rule

The GUI round-trip test passes only when both legs are real: the outbound message enters the selected agent thread, and a valid reply returns through the CAM receiver path from that exact selected agent. A queued mailbox row or a chat-only answer is not enough.

When replying to a GUI diagnostic, preserve the incoming `correlationId` and use `--message-type "cam-gui-test-reply"` when the prompt asks for it.

## Local Docs Rule

These CAM docs are installed locally under the CAM home on each machine:

```text
Windows: C:\Users\<user>\.qexow-cam\docs\
Linux:   ~/.qexow-cam/docs/
```

Use the local installed docs first. Do not assume the frontend private-docs repo is the canonical CAM usage path.
