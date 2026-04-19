# Bert Ogden Dealer Work OS

Minimal dealership project management app inspired by monday.com, but tuned for Bert Ogden teams.

## Stack

- Frontend: React + Vite
- Backend: FastAPI
- Storage: local JSON file

## Product shape

- Login-first workspace
- User-specific dashboard after login
- Projects
- Groups inside each project
- Inline task editing
- Priority and status color coding
- Custom fields added directly on the board with `+ Add Field`
- Simple settings area for users, rooftops, and manifest notes
- Dedicated admin area for user and rooftop setup

## Login

- Default admin account: `Kai Rivers`
- Default admin password: `bertogden`
- Other users use their own unique password

## Run

Backend:

```powershell
cd backend
python -m pip install -r requirements.txt
python -m uvicorn main:app --host 0.0.0.0 --port 8124 --reload
```

Frontend:

```powershell
cd frontend
npm.cmd install
npm.cmd run dev
```

Open:

```text
http://localhost:4174
```

## Important files

- Product manifest: [MANIFEST.md](./MANIFEST.md)
- Backend API and data model: [backend/main.py](./backend/main.py)
- Frontend app: [frontend/src/App.jsx](./frontend/src/App.jsx)
- Render blueprint: [render.yaml](./render.yaml)

## Recommended production host

Use:

```text
organize.bertogden123.com
```

That keeps this app separate from the existing scheduler already using:

```text
app.bertogden123.com
```

## Render + IONOS

This repo includes a Render blueprint that creates:

- a FastAPI web service with a persistent disk
- a static frontend site with SPA rewrites

Use `organize.bertogden123.com` as the frontend custom domain.

The simplest production setup is:

1. Push this folder to GitHub.
2. In Render, create a new Blueprint from this repo.
3. Set `DEALER_CORS_ORIGINS` to `https://organize.bertogden123.com`.
4. After the services are live, attach `organize.bertogden123.com` to the frontend static site in Render.
5. In IONOS DNS, create the `CNAME` record Render gives you for `organize`.

The backend data file is configured to persist at:

```text
/var/data/store.json
```
