from __future__ import annotations

import json
import os
from copy import deepcopy
from datetime import date
from pathlib import Path
from typing import Literal

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field


DEFAULT_DATA_FILE = Path(__file__).resolve().parent / "data" / "store.json"
DATA_FILE = Path(os.getenv("DEALER_DATA_FILE", str(DEFAULT_DATA_FILE))).expanduser()
DATA_DIR = DATA_FILE.parent

StatusValue = Literal["Not started", "Working on it", "Review", "Stuck", "Done"]
PriorityValue = Literal["Critical", "High", "Medium", "Low"]
AudienceValue = Literal["All", "Sales", "BDC", "Service", "Leadership"]
FieldTypeValue = Literal["text", "number", "date", "tag"]


def iso_today(offset_days: int = 0) -> str:
    return date.fromordinal(date.today().toordinal() + offset_days).isoformat()


def parse_allowed_origins() -> list[str]:
    raw = os.getenv("DEALER_CORS_ORIGINS", "").strip()
    if not raw:
        return ["*"]
    return [origin.strip() for origin in raw.split(",") if origin.strip()]


SEED_DATA = {
    "stores": [
        {
            "id": 1,
            "name": "Bert Ogden Kia",
            "code": "KIA",
            "city": "Edinburg",
            "manager": "Kai Rivers",
            "department_focus": "Sales",
            "sales_target": 160,
            "service_target": 1150,
            "active": True,
        },
        {
            "id": 2,
            "name": "Bert Ogden Mazda",
            "code": "MAZ",
            "city": "Edinburg",
            "manager": "Maya Chen",
            "department_focus": "Service",
            "sales_target": 95,
            "service_target": 820,
            "active": True,
        },
        {
            "id": 3,
            "name": "Bert Ogden Outlet",
            "code": "OUT",
            "city": "Mission",
            "manager": "Jordan Reed",
            "department_focus": "Used Cars",
            "sales_target": 120,
            "service_target": 0,
            "active": True,
        },
    ],
    "users": [
        {
            "id": 1,
            "name": "Kai Rivers",
            "title": "General Sales Manager",
            "role": "Admin",
            "department": "Sales",
            "store_id": 1,
            "phone": "(956) 555-0101",
            "active": True,
            "avatar": "KR",
            "password": "bertogden",
        },
        {
            "id": 2,
            "name": "Maya Chen",
            "title": "Fixed Ops Director",
            "role": "Manager",
            "department": "Service",
            "store_id": 2,
            "phone": "(956) 555-0102",
            "active": True,
            "avatar": "MC",
            "password": "maya2026",
        },
        {
            "id": 3,
            "name": "Jordan Reed",
            "title": "BDC Manager",
            "role": "Manager",
            "department": "BDC",
            "store_id": 1,
            "phone": "(956) 555-0103",
            "active": True,
            "avatar": "JR",
            "password": "jordan2026",
        },
        {
            "id": 4,
            "name": "Ava Martinez",
            "title": "Marketing Lead",
            "role": "Coordinator",
            "department": "Marketing",
            "store_id": 3,
            "phone": "(956) 555-0104",
            "active": True,
            "avatar": "AM",
            "password": "ava2026",
        },
        {
            "id": 5,
            "name": "Luis Gomez",
            "title": "Service Advisor",
            "role": "Staff",
            "department": "Service",
            "store_id": 2,
            "phone": "(956) 555-0105",
            "active": True,
            "avatar": "LG",
            "password": "luis2026",
        },
    ],
    "announcements": [
        {
            "id": 1,
            "title": "Weekend push",
            "message": "Close out all open priority tasks before the Saturday desk meeting.",
            "audience": "Sales",
            "priority": "High",
            "pinned": True,
        },
        {
            "id": 2,
            "title": "Mazda service lane",
            "message": "Loaner inventory is tight. Route approvals through Maya before promising next-day delivery.",
            "audience": "Service",
            "priority": "Medium",
            "pinned": False,
        },
    ],
    "settings": {
        "permissions": [
            {
                "role": "Admin",
                "can_manage_staff": True,
                "can_manage_stores": True,
                "can_edit_boards": True,
                "can_publish_announcements": True,
                "can_view_reports": True,
            },
            {
                "role": "Manager",
                "can_manage_staff": True,
                "can_manage_stores": False,
                "can_edit_boards": True,
                "can_publish_announcements": True,
                "can_view_reports": True,
            },
            {
                "role": "Coordinator",
                "can_manage_staff": False,
                "can_manage_stores": False,
                "can_edit_boards": True,
                "can_publish_announcements": False,
                "can_view_reports": True,
            },
            {
                "role": "Staff",
                "can_manage_staff": False,
                "can_manage_stores": False,
                "can_edit_boards": False,
                "can_publish_announcements": False,
                "can_view_reports": False,
            },
        ],
        "pipeline_templates": [
            {"department": "BDC", "stages": ["Fresh Lead", "Contacted", "Appt Set", "Showed", "Sold"]},
            {"department": "Sales", "stages": ["Up", "Demo", "Pencil", "Funding", "Delivered"]},
            {"department": "Service", "stages": ["Appointment", "Write Up", "In Shop", "Waiting Parts", "Delivered"]},
        ],
    },
    "boards": [
        {
            "id": 1,
            "name": "Showroom Appointments",
            "description": "Simple sales task board for appointments, follow-up, and completed deliveries.",
            "color": "#4f6bed",
            "department": "Sales",
            "store_id": 1,
            "fields": [],
            "groups": [
                {"id": 11, "name": "Open"},
                {"id": 12, "name": "This Week"},
                {"id": 13, "name": "Done"},
            ],
            "tasks": [
                {
                    "id": 101,
                    "group_id": 11,
                    "name": "Confirm Telluride showroom visit",
                    "status": "Working on it",
                    "priority": "High",
                    "owner_id": 1,
                    "store_id": 1,
                    "department": "Sales",
                    "category": "Appointment",
                    "customer_name": "Rosa Salinas",
                    "vehicle": "2024 Kia Telluride SX",
                    "due_date": iso_today(0),
                    "effort": 1,
                    "notes": "Call after 5:30 PM.",
                    "custom_fields": {},
                },
                {
                    "id": 102,
                    "group_id": 12,
                    "name": "Confirm Saturday showroom visit",
                    "status": "Review",
                    "priority": "Medium",
                    "owner_id": 1,
                    "store_id": 1,
                    "department": "Sales",
                    "category": "Appointment",
                    "customer_name": "Hector Garza",
                    "vehicle": "2022 Silverado LT",
                    "due_date": iso_today(1),
                    "effort": 1,
                    "notes": "Needs trade appraisal.",
                    "custom_fields": {},
                },
                {
                    "id": 103,
                    "group_id": 13,
                    "name": "Delivered Sportage appointment",
                    "status": "Done",
                    "priority": "Low",
                    "owner_id": 1,
                    "store_id": 1,
                    "department": "Sales",
                    "category": "Delivery",
                    "customer_name": "Jose Cantu",
                    "vehicle": "2024 Kia Sportage EX",
                    "due_date": iso_today(-1),
                    "effort": 1,
                    "notes": "Closed yesterday.",
                    "custom_fields": {},
                },
            ],
        },
        {
            "id": 2,
            "name": "Service Lane Follow Up",
            "description": "Simple service tasks, appointment prep, and declined-work saves.",
            "color": "#0f9d7a",
            "department": "Service",
            "store_id": 2,
            "fields": [{"id": 1, "name": "RO #", "type": "text"}],
            "groups": [
                {"id": 21, "name": "Tomorrow Appointments"},
                {"id": 22, "name": "Waiting On Parts"},
                {"id": 23, "name": "Delivered"},
            ],
            "tasks": [
                {
                    "id": 201,
                    "group_id": 21,
                    "name": "Prep CX-5 estimate",
                    "status": "Not started",
                    "priority": "Medium",
                    "owner_id": 5,
                    "store_id": 2,
                    "department": "Service",
                    "category": "Appointment",
                    "customer_name": "Elena Torres",
                    "vehicle": "2019 Mazda CX-5",
                    "due_date": iso_today(1),
                    "effort": 1,
                    "notes": "Likely brakes and tires.",
                    "custom_fields": {"1": "48291"},
                },
                {
                    "id": 202,
                    "group_id": 22,
                    "name": "Update Sorento backorder customer",
                    "status": "Working on it",
                    "priority": "High",
                    "owner_id": 2,
                    "store_id": 1,
                    "department": "Service",
                    "category": "Parts Delay",
                    "customer_name": "Marcos Pena",
                    "vehicle": "2021 Kia Sorento",
                    "due_date": iso_today(2),
                    "effort": 1,
                    "notes": "Need ETA before noon.",
                    "custom_fields": {"1": "48410"},
                },
                {
                    "id": 203,
                    "group_id": 23,
                    "name": "Delivered brake upsell save",
                    "status": "Done",
                    "priority": "Low",
                    "owner_id": 5,
                    "store_id": 2,
                    "department": "Service",
                    "category": "Save",
                    "customer_name": "Rita Velasquez",
                    "vehicle": "2018 Mazda3",
                    "due_date": iso_today(-1),
                    "effort": 1,
                    "notes": "Customer approved after callback.",
                    "custom_fields": {"1": "47982"},
                },
            ],
        },
        {
            "id": 3,
            "name": "Used Car Specials",
            "description": "Simple marketing board for used inventory pushes and offer launches.",
            "color": "#ff8b3d",
            "department": "Marketing",
            "store_id": 3,
            "fields": [
                {"id": 1, "name": "Channel", "type": "tag"},
                {"id": 2, "name": "Launch Date", "type": "date"},
            ],
            "groups": [
                {"id": 31, "name": "Creative Queue"},
                {"id": 32, "name": "Pending Approval"},
                {"id": 33, "name": "Scheduled"},
            ],
            "tasks": [
                {
                    "id": 301,
                    "group_id": 31,
                    "name": "Build weekend truck ad",
                    "status": "Working on it",
                    "priority": "High",
                    "owner_id": 4,
                    "store_id": 3,
                    "department": "Marketing",
                    "category": "Campaign",
                    "customer_name": "",
                    "vehicle": "F-150 / Silverado inventory",
                    "due_date": iso_today(2),
                    "effort": 1,
                    "notes": "Need payment line from desk.",
                    "custom_fields": {"1": "Facebook", "2": iso_today(2)},
                },
                {
                    "id": 302,
                    "group_id": 32,
                    "name": "Approve Tahoe special tile",
                    "status": "Review",
                    "priority": "Medium",
                    "owner_id": 1,
                    "store_id": 3,
                    "department": "Marketing",
                    "category": "Graphic",
                    "customer_name": "",
                    "vehicle": "2021 Chevrolet Tahoe",
                    "due_date": iso_today(1),
                    "effort": 1,
                    "notes": "Waiting on final price approval.",
                    "custom_fields": {"1": "Instagram", "2": iso_today(3)},
                }
            ],
        },
    ],
}


def ensure_store() -> None:
    if DATA_FILE.exists():
        return
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    DATA_FILE.write_text(json.dumps(SEED_DATA, indent=2), encoding="utf-8")


def next_id(items: list[dict]) -> int:
    return max((int(item["id"]) for item in items), default=0) + 1


def public_user(user: dict) -> dict:
    return {key: value for key, value in user.items() if key != "password"}


def public_store_snapshot(store: dict) -> dict:
    snapshot = deepcopy(store)
    snapshot["users"] = [public_user(user) for user in snapshot["users"]]
    return snapshot


def default_permissions() -> list[dict]:
    return deepcopy(SEED_DATA["settings"]["permissions"])


def default_templates() -> list[dict]:
    return deepcopy(SEED_DATA["settings"]["pipeline_templates"])


def normalize_store(store: dict) -> dict:
    normalized = deepcopy(store or {})
    normalized.setdefault("stores", deepcopy(SEED_DATA["stores"]))
    normalized.setdefault("users", deepcopy(SEED_DATA["users"]))
    normalized.setdefault("announcements", deepcopy(SEED_DATA["announcements"]))
    normalized.setdefault("settings", {})
    normalized["settings"].setdefault("permissions", default_permissions())
    normalized["settings"].setdefault("pipeline_templates", default_templates())
    normalized.setdefault("boards", deepcopy(SEED_DATA["boards"]))

    for board in normalized["boards"]:
        board.setdefault("department", "General")
        board.setdefault("store_id", None)
        board.setdefault("groups", [])
        board.setdefault("fields", [])
        board.setdefault("tasks", [])
        for field in board["fields"]:
            field.setdefault("type", "text")
        for task in board["tasks"]:
            task.setdefault("store_id", board.get("store_id"))
            task.setdefault("department", board.get("department", "General"))
            task.setdefault("category", "Task")
            task.setdefault("customer_name", "")
            task.setdefault("vehicle", "")
            task.setdefault("status", "Not started")
            task.setdefault("priority", "Medium")
            task.setdefault("notes", "")
            task.setdefault("effort", 1)
            task.setdefault("owner_id", None)
            task.setdefault("due_date", None)
            task.setdefault("custom_fields", {})

    for user in normalized["users"]:
        user.setdefault("role", "Staff")
        user.setdefault("department", "General")
        user.setdefault("store_id", None)
        user.setdefault("phone", "")
        user.setdefault("active", True)
        user.setdefault("avatar", "".join(part[:1] for part in user.get("name", "").split()[:2]).upper())
        user.setdefault("password", f"bertogden-{user.get('id', 0)}")

    for store_item in normalized["stores"]:
        store_item.setdefault("manager", "")
        store_item.setdefault("department_focus", "Sales")
        store_item.setdefault("sales_target", 0)
        store_item.setdefault("service_target", 0)
        store_item.setdefault("active", True)

    for item in normalized["announcements"]:
        item.setdefault("audience", "All")
        item.setdefault("priority", "Medium")
        item.setdefault("pinned", False)

    roles = {item["role"] for item in normalized["settings"]["permissions"]}
    for role in ["Admin", "Manager", "Coordinator", "Staff"]:
        if role not in roles:
            normalized["settings"]["permissions"].append(
                {
                    "role": role,
                    "can_manage_staff": role in {"Admin", "Manager"},
                    "can_manage_stores": role == "Admin",
                    "can_edit_boards": role in {"Admin", "Manager", "Coordinator"},
                    "can_publish_announcements": role in {"Admin", "Manager"},
                    "can_view_reports": role in {"Admin", "Manager", "Coordinator"},
                }
            )

    return normalized


def read_store() -> dict:
    ensure_store()
    normalized = normalize_store(json.loads(DATA_FILE.read_text(encoding="utf-8")))
    write_store(normalized)
    return normalized


def write_store(store: dict) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    DATA_FILE.write_text(json.dumps(normalize_store(store), indent=2), encoding="utf-8")


def get_board_or_404(store: dict, board_id: int) -> dict:
    board = next((entry for entry in store["boards"] if entry["id"] == board_id), None)
    if not board:
        raise HTTPException(status_code=404, detail="Board not found")
    return board


class StoreCreate(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    code: str = Field(min_length=2, max_length=10)
    city: str = Field(default="", max_length=40)
    manager: str = Field(default="", max_length=80)
    department_focus: str = Field(default="Sales", max_length=40)
    sales_target: int = Field(default=0, ge=0)
    service_target: int = Field(default=0, ge=0)
    active: bool = True


class StorePatch(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=80)
    code: str | None = Field(default=None, min_length=2, max_length=10)
    city: str | None = Field(default=None, max_length=40)
    manager: str | None = Field(default=None, max_length=80)
    department_focus: str | None = Field(default=None, max_length=40)
    sales_target: int | None = Field(default=None, ge=0)
    service_target: int | None = Field(default=None, ge=0)
    active: bool | None = None


class UserCreate(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    title: str = Field(default="", max_length=80)
    role: str = Field(default="Staff", max_length=40)
    department: str = Field(default="General", max_length=40)
    store_id: int | None = None
    phone: str = Field(default="", max_length=40)
    password: str = Field(min_length=4, max_length=120)
    active: bool = True


class UserPatch(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=80)
    title: str | None = Field(default=None, max_length=80)
    role: str | None = Field(default=None, max_length=40)
    department: str | None = Field(default=None, max_length=40)
    store_id: int | None = None
    phone: str | None = Field(default=None, max_length=40)
    password: str | None = Field(default=None, min_length=4, max_length=120)
    active: bool | None = None


class AnnouncementCreate(BaseModel):
    title: str = Field(min_length=2, max_length=100)
    message: str = Field(min_length=4, max_length=600)
    audience: AudienceValue = "All"
    priority: PriorityValue = "Medium"
    pinned: bool = False


class AnnouncementPatch(BaseModel):
    title: str | None = Field(default=None, min_length=2, max_length=100)
    message: str | None = Field(default=None, min_length=4, max_length=600)
    audience: AudienceValue | None = None
    priority: PriorityValue | None = None
    pinned: bool | None = None


class PermissionPatch(BaseModel):
    can_manage_staff: bool | None = None
    can_manage_stores: bool | None = None
    can_edit_boards: bool | None = None
    can_publish_announcements: bool | None = None
    can_view_reports: bool | None = None


class LoginPayload(BaseModel):
    user_id: int
    password: str = Field(min_length=1, max_length=120)


class BoardCreate(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    description: str = Field(default="", max_length=200)
    color: str = Field(default="#1d4ed8", max_length=20)
    department: str = Field(default="General", max_length=40)
    store_id: int | None = None


class BoardPatch(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=80)
    description: str | None = Field(default=None, max_length=200)
    color: str | None = Field(default=None, max_length=20)
    department: str | None = Field(default=None, max_length=40)
    store_id: int | None = None


class BoardFieldCreate(BaseModel):
    name: str = Field(min_length=1, max_length=60)
    type: FieldTypeValue = "text"


class GroupCreate(BaseModel):
    board_id: int
    name: str = Field(min_length=2, max_length=80)


class TaskCreate(BaseModel):
    board_id: int
    group_id: int
    name: str = Field(min_length=2, max_length=120)
    status: StatusValue = "Not started"
    priority: PriorityValue = "Medium"
    owner_id: int | None = None
    store_id: int | None = None
    department: str = Field(default="General", max_length=40)
    category: str = Field(default="Task", max_length=60)
    customer_name: str = Field(default="", max_length=80)
    vehicle: str = Field(default="", max_length=120)
    due_date: str | None = None
    effort: int = Field(default=1, ge=1, le=13)
    notes: str = Field(default="", max_length=1500)
    custom_fields: dict[str, str | int | float | bool | None] = Field(default_factory=dict)


class TaskPatch(BaseModel):
    group_id: int | None = None
    name: str | None = Field(default=None, min_length=2, max_length=120)
    status: StatusValue | None = None
    priority: PriorityValue | None = None
    owner_id: int | None = None
    store_id: int | None = None
    department: str | None = Field(default=None, max_length=40)
    category: str | None = Field(default=None, max_length=60)
    customer_name: str | None = Field(default=None, max_length=80)
    vehicle: str | None = Field(default=None, max_length=120)
    due_date: str | None = None
    effort: int | None = Field(default=None, ge=1, le=13)
    notes: str | None = Field(default=None, max_length=1500)
    custom_fields: dict[str, str | int | float | bool | None] | None = None


app = FastAPI(title="Company Work OS API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=parse_allowed_origins(),
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict:
    return {"ok": True}


@app.post("/api/login")
def login(payload: LoginPayload) -> dict:
    store = read_store()
    user = next((entry for entry in store["users"] if entry["id"] == payload.user_id and entry.get("active", True)), None)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if payload.password != user.get("password"):
        raise HTTPException(status_code=401, detail="Incorrect password")
    return {"ok": True, "user": public_user(user)}


@app.get("/api/bootstrap")
def bootstrap() -> dict:
    return public_store_snapshot(read_store())


@app.post("/api/stores")
def create_store(payload: StoreCreate) -> dict:
    store = read_store()
    item = {"id": next_id(store["stores"]), **payload.model_dump()}
    store["stores"].append(item)
    write_store(store)
    return item


@app.patch("/api/stores/{store_id}")
def update_store(store_id: int, payload: StorePatch) -> dict:
    store = read_store()
    item = next((entry for entry in store["stores"] if entry["id"] == store_id), None)
    if not item:
        raise HTTPException(status_code=404, detail="Store not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        item[field] = value
    write_store(store)
    return item


@app.post("/api/users")
def create_user(payload: UserCreate) -> dict:
    store = read_store()
    item = {
        "id": next_id(store["users"]),
        "avatar": "".join(part[:1] for part in payload.name.split()[:2]).upper(),
        **payload.model_dump(),
    }
    store["users"].append(item)
    write_store(store)
    return public_user(item)


@app.patch("/api/users/{user_id}")
def update_user(user_id: int, payload: UserPatch) -> dict:
    store = read_store()
    item = next((entry for entry in store["users"] if entry["id"] == user_id), None)
    if not item:
        raise HTTPException(status_code=404, detail="User not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        item[field] = value
    if "name" in payload.model_dump(exclude_unset=True):
        item["avatar"] = "".join(part[:1] for part in item["name"].split()[:2]).upper()
    write_store(store)
    return public_user(item)


@app.post("/api/announcements")
def create_announcement(payload: AnnouncementCreate) -> dict:
    store = read_store()
    item = {"id": next_id(store["announcements"]), **payload.model_dump()}
    store["announcements"].append(item)
    write_store(store)
    return item


@app.patch("/api/announcements/{announcement_id}")
def update_announcement(announcement_id: int, payload: AnnouncementPatch) -> dict:
    store = read_store()
    item = next((entry for entry in store["announcements"] if entry["id"] == announcement_id), None)
    if not item:
        raise HTTPException(status_code=404, detail="Announcement not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        item[field] = value
    write_store(store)
    return item


@app.patch("/api/settings/permissions/{role}")
def update_permission(role: str, payload: PermissionPatch) -> dict:
    store = read_store()
    item = next((entry for entry in store["settings"]["permissions"] if entry["role"] == role), None)
    if not item:
        raise HTTPException(status_code=404, detail="Role not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        item[field] = value
    write_store(store)
    return item


@app.post("/api/boards")
def create_board(payload: BoardCreate) -> dict:
    store = read_store()
    board = {
        "id": next_id(store["boards"]),
        "name": payload.name,
        "description": payload.description,
        "color": payload.color,
        "department": payload.department,
        "store_id": payload.store_id,
        "groups": [{"id": 1, "name": "New Group"}],
        "fields": [],
        "tasks": [],
    }
    store["boards"].append(board)
    write_store(store)
    return board


@app.patch("/api/boards/{board_id}")
def update_board(board_id: int, payload: BoardPatch) -> dict:
    store = read_store()
    board = get_board_or_404(store, board_id)
    for field, value in payload.model_dump(exclude_unset=True).items():
        board[field] = value
    write_store(store)
    return board


@app.post("/api/boards/{board_id}/fields")
def create_board_field(board_id: int, payload: BoardFieldCreate) -> dict:
    store = read_store()
    board = get_board_or_404(store, board_id)
    field = {"id": next_id(board["fields"]), "name": payload.name.strip(), "type": payload.type}
    board["fields"].append(field)
    write_store(store)
    return field


@app.post("/api/groups")
def create_group(payload: GroupCreate) -> dict:
    store = read_store()
    board = get_board_or_404(store, payload.board_id)
    group = {"id": next_id(board["groups"]), "name": payload.name}
    board["groups"].append(group)
    write_store(store)
    return group


@app.post("/api/tasks")
def create_task(payload: TaskCreate) -> dict:
    store = read_store()
    board = get_board_or_404(store, payload.board_id)
    group_exists = any(group["id"] == payload.group_id for group in board["groups"])
    if not group_exists:
        raise HTTPException(status_code=400, detail="Group does not belong to board")
    task = {
        "id": next_id(board["tasks"]),
        **payload.model_dump(),
    }
    board["tasks"].append(task)
    write_store(store)
    return task


@app.patch("/api/boards/{board_id}/tasks/{task_id}")
def update_task(board_id: int, task_id: int, payload: TaskPatch) -> dict:
    store = read_store()
    board = get_board_or_404(store, board_id)
    task = next((entry for entry in board["tasks"] if entry["id"] == task_id), None)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    changes = payload.model_dump(exclude_unset=True)
    if "group_id" in changes:
        group_exists = any(group["id"] == changes["group_id"] for group in board["groups"])
        if not group_exists:
            raise HTTPException(status_code=400, detail="Group does not belong to board")
    for field, value in changes.items():
        task[field] = value
    write_store(store)
    return task


@app.get("/api/boards/{board_id}")
def get_board(board_id: int) -> dict:
    store = read_store()
    return deepcopy(get_board_or_404(store, board_id))
