# Agent Loops

This repo is run as a set of small agentic loops instead of one long unstructured stream of edits.

The goal is simple:

- keep the live app moving forward
- keep local, GitHub, and Render aligned
- keep each pass bounded enough to validate and ship

## Loop Stack

### 1. Active Delivery Loop

Purpose:
- move the product forward with one contained improvement at a time

Cycle:
1. Check the latest user pain point.
2. Inspect the current code surface.
3. Make one bounded change.
4. Build locally.
5. Push to `main`.
6. Verify the live frontend and backend state.
7. Log the next blocker.

Definition of done:
- the improvement is coded, validated, pushed, and its live state is known

### 2. UX Tightening Loop

Purpose:
- reduce friction, dead space, visual noise, and unclear states

Focus:
- dashboard density
- project tile hierarchy
- row clarity
- column rhythm
- dark mode polish
- login clarity

Definition of done:
- one visible UI problem is measurably better and does not regress adjacent surfaces

### 3. Mobile Fit Loop

Purpose:
- keep the iPhone and narrow-width experience usable without extra explanation

Focus:
- tap targets
- sidebar behavior
- card density
- task-group readability
- install flow
- safe viewport spacing

Definition of done:
- one mobile pain point is removed and the layout still feels native enough on phone

### 4. Data Interaction Loop

Purpose:
- make the workspace faster to update without making it heavier

Focus:
- task creation
- task group editing
- project editing
- notes and screenshots
- custom field creation
- board table control

Definition of done:
- one workflow is clearly simpler, faster, or more complete

### 5. Deploy Parity Loop

Purpose:
- keep local, GitHub, and Render in sync

Checks:
- local HEAD matches `origin/main`
- live frontend asset hash reflects the latest frontend push
- shared backend exposes the expected API shape
- expected deploys are not stalled

Definition of done:
- the live state is confirmed, or the exact remaining deploy blocker is identified

## Cadence

- Active Delivery Loop: every active work session
- UX Tightening Loop: several times per day during active polish
- Mobile Fit Loop: at least once per day while UI changes are ongoing
- Data Interaction Loop: whenever a workflow feels clumsy or incomplete
- Deploy Parity Loop: after every push and on recurring heartbeat checks

## Output Contract

Each loop should produce one of these outcomes:

- a pushed improvement
- a verified live-state check
- a bounded blocker with the exact failing surface
- a short next-step entry in the backlog

## Guardrails

- Prefer one finished pass over one broad unstable redesign.
- Do not mix unrelated redesigns into the same loop.
- Validate locally before pushing.
- Treat frontend and shared backend as separate deploy surfaces.
- Keep dealership usability above novelty.
- If a loop uncovers a deploy lag, report that explicitly instead of pretending the feature is live.

## Current Surfaces

- Frontend repo: `C:\Users\pando\OneDrive\Desktop\company-work-os`
- Shared backend repo: `C:\Users\pando\OneDrive\Desktop\dealership-tool`
- Frontend live URL: `https://orgtool-web.onrender.com`
- Shared backend live URL: `https://dealership-tool-api.onrender.com/orgtool/api`

## Operating Files

- backlog: [AGENT_BACKLOG.md](./AGENT_BACKLOG.md)
- live check script: [scripts/live_loop_check.py](./scripts/live_loop_check.py)
- primary frontend surface: [frontend/src/App.jsx](./frontend/src/App.jsx)
- primary frontend styles: [frontend/src/App.css](./frontend/src/App.css)

## Standard Commands

Frontend build:

```powershell
cd frontend
npm.cmd run build
```

Backend compile:

```powershell
cd ..\dealership-tool
python -m py_compile backend\orgtool_api.py
```

Live parity check:

```powershell
python .\scripts\live_loop_check.py
```
