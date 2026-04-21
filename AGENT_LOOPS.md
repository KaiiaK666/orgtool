# Agent Loops

This project runs best when changes are made in short, bounded loops instead of broad redesign swings.

## Primary Loop

1. Check the current user pain point.
2. Compare local code against the live Render deployment.
3. Fix one contained problem end to end.
4. Build locally.
5. Push to `main`.
6. Verify the live frontend and shared backend state.
7. Log the next highest-signal issue.

## Active Loops

### 1. UX Tightening Loop

Goal: reduce friction and visual noise in the main workspace.

Focus:
- dashboard density
- project tile clarity
- row readability
- form alignment
- dark mode polish

Stop condition:
- one clearly visible UX problem is improved and verified

### 2. Mobile Fit Loop

Goal: make the app easy to use on phone-sized screens.

Focus:
- navigation reachability
- card density
- tap target sizing
- board readability on narrow widths
- install flow on iPhone

Stop condition:
- one mobile pain point is removed and the layout still builds cleanly

### 3. Data Interaction Loop

Goal: make editing faster without making the UI heavier.

Focus:
- notes and screenshots
- task group editing
- project editing
- custom field creation
- column sizing and board controls

Stop condition:
- one workflow is measurably simpler or more complete

### 4. Deploy Parity Loop

Goal: keep local, GitHub, and Render aligned.

Checks:
- latest local commit matches `origin/main`
- live frontend asset hash updates after pushes
- shared backend exposes the expected API shape
- Render rollout is not lagging behind the repo

Stop condition:
- current change is confirmed live or the remaining blocker is identified clearly

## Guardrails

- Prefer one small finished pass over one large unstable pass.
- Do not redesign unrelated surfaces in the same loop.
- Validate locally before pushing.
- Treat frontend and shared backend as separate deploy surfaces.
- Keep changes legible for dealership users first, cleverness second.

## Current Surfaces

- Frontend repo: `C:\Users\pando\OneDrive\Desktop\company-work-os`
- Shared backend repo: `C:\Users\pando\OneDrive\Desktop\dealership-tool`
- Frontend live URL: `https://orgtool-web.onrender.com`
- Shared backend live URL: `https://dealership-tool-api.onrender.com/orgtool/api`
