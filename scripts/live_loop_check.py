from __future__ import annotations

import json
import re
import subprocess
import sys
import urllib.request
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
FRONTEND_URL = "https://orgtool-web.onrender.com"
BACKEND_BOOTSTRAP_URL = "https://dealership-tool-api.onrender.com/orgtool/api/bootstrap"
SHARED_BACKEND_REPO = (ROOT.parent / "dealership-tool").resolve()


def run_git(repo: Path, *args: str) -> str:
    return subprocess.check_output(["git", "-C", str(repo), *args], text=True).strip()


def fetch_text(url: str) -> str:
    with urllib.request.urlopen(url, timeout=20) as response:
        return response.read().decode("utf-8", "ignore")


def fetch_json(url: str) -> dict:
    return json.loads(fetch_text(url))


def frontend_assets() -> dict[str, str | None]:
    html = fetch_text(FRONTEND_URL)
    js_matches = re.findall(r"/assets/[^\"']+\.js", html)
    css_matches = re.findall(r"/assets/[^\"']+\.css", html)
    return {
        "js": js_matches[-1] if js_matches else None,
        "css": css_matches[-1] if css_matches else None,
    }


def backend_summary() -> dict[str, object]:
    snapshot = fetch_json(BACKEND_BOOTSTRAP_URL)
    has_screenshots = False
    board_count = len(snapshot.get("boards", []))
    user_count = len(snapshot.get("users", []))

    for board in snapshot.get("boards", []):
        for group in board.get("groups", []):
            group_id = int(group.get("id", 0))
            group_tasks = [task for task in board.get("tasks", []) if int(task.get("group_id", 0)) == group_id]
            for task in group_tasks:
                if "screenshots" in task:
                    has_screenshots = True
                    break
            if has_screenshots:
                break
        if has_screenshots:
            break

    return {
        "boards": board_count,
        "users": user_count,
        "has_screenshots": has_screenshots,
    }


def main() -> int:
    try:
        frontend_head = run_git(ROOT, "rev-parse", "--short", "HEAD")
        frontend_origin = run_git(ROOT, "rev-parse", "--short", "origin/main")
        backend_head = run_git(SHARED_BACKEND_REPO, "rev-parse", "--short", "HEAD")
        backend_origin = run_git(SHARED_BACKEND_REPO, "rev-parse", "--short", "origin/main")
        assets = frontend_assets()
        backend = backend_summary()
    except Exception as exc:  # pragma: no cover - operational script
        print(f"live_loop_check failed: {exc}", file=sys.stderr)
        return 1

    print("Frontend repo")
    print(f"  local HEAD:   {frontend_head}")
    print(f"  origin/main:  {frontend_origin}")
    print("")
    print("Shared backend repo")
    print(f"  local HEAD:   {backend_head}")
    print(f"  origin/main:  {backend_origin}")
    print("")
    print("Live frontend")
    print(f"  js asset:     {assets['js']}")
    print(f"  css asset:    {assets['css']}")
    print("")
    print("Live backend")
    print(f"  boards:       {backend['boards']}")
    print(f"  users:        {backend['users']}")
    print(f"  screenshots:  {backend['has_screenshots']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
