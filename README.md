# Claude Task Manager

Trello-style AI task board that runs Claude agents in parallel. Queue tasks, assign skills, and let AI do the work.

![Status](https://img.shields.io/badge/status-beta-yellow)

## Requirements

- **Node.js** 18+ — [Download](https://nodejs.org)
- **Claude CLI** — [Download](https://claude.ai/download)
  - After install run: `claude login`
  - Then run once: `claude --dangerously-skip-permissions` (accept the permission prompt)

## Install (2 minutes)

### Windows
```
1. Download and unzip this folder
2. Double-click setup.bat
3. Double-click start.bat
4. Open http://localhost:3456
```

### Mac / Linux
```bash
cd claude-task-manager
chmod +x setup.sh
./setup.sh
npm start
# Open http://localhost:3456
```

## How It Works

1. **Create tasks** — describe what you want done in plain English
2. **Assign a skill** — optional AI agent preset (writing, stories, research, etc.)
3. **Hit Run** — Claude agents process your queue in terminal windows
4. **View results** — click completed cards to see full output

## Features

- Kanban board (Pending → Running → Done / Failed)
- Multiple workspaces with separate task queues
- Skills system — reusable AI agent configurations
- Task Master — describe a goal, AI plans all the steps
- Output chaining — sequential tasks feed results forward
- Live progress — see what each worker is doing in real-time
- Templates & routines — one-click task presets
- Archive & history — keep your board clean
- Browser notifications when tasks complete

## Adding Skills

Skills are AI agent presets. Create a markdown file describing the agent's behavior, then register it in `skills.json`:

```json
{
  "my-skill": {
    "file": "path/to/my-skill.md",
    "description": "What this skill does",
    "context": ["path/to/context-file.md"]
  }
}
```

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `N` | New task |
| `M` | Open Task Master |
| `Esc` | Close any modal |

## Troubleshooting

**"Claude CLI not found"** — Install from [claude.ai/download](https://claude.ai/download), then run `claude login`

**Tasks fail immediately** — Run `claude --dangerously-skip-permissions` once in terminal to accept the permission prompt

**Port 3456 in use** — Another instance is running. Close it or change PORT in server.js

**Blank page** — Server isn't running. Open terminal in this folder and run `npm start`
