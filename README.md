# Organization Tool

Simple internal project workspace with:

- user-specific dashboards
- lightweight projects and groups
- inline task editing
- color-coded priority and status
- custom fields added directly from a board
- admin-only user management

## Frontend repo

This repo deploys the `orgtool-web` static site on Render.

The live frontend talks to the shared `dealership-tool-api` service through the `/orgtool` namespace.

## Production host

```text
organize.bertogden123.com
```

## Important files

- [render.yaml](./render.yaml)
- [AGENT_LOOPS.md](./AGENT_LOOPS.md)
- [AGENT_BACKLOG.md](./AGENT_BACKLOG.md)
- [scripts/live_loop_check.py](./scripts/live_loop_check.py)
- [frontend/src/App.jsx](./frontend/src/App.jsx)
- [frontend/src/App.css](./frontend/src/App.css)
- [frontend/src/api.js](./frontend/src/api.js)

## Agentic operation

This project now has an explicit loop-based operating model:

- loop definitions in [AGENT_LOOPS.md](./AGENT_LOOPS.md)
- active queue in [AGENT_BACKLOG.md](./AGENT_BACKLOG.md)
- live/local parity script in [scripts/live_loop_check.py](./scripts/live_loop_check.py)

Run the parity check with:

```powershell
python .\scripts\live_loop_check.py
```
