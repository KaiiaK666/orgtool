import React, { useEffect, useMemo, useState } from "react";
import {
  createBoard,
  createBoardField,
  createGroup,
  createStore,
  createTask,
  createUser,
  getBootstrap,
  login,
  updateTask,
} from "./api.js";

const SESSION_KEY = "dealer-work-os-session";
const STATUS_OPTIONS = ["Not started", "Working on it", "Review", "Stuck", "Done"];
const PRIORITY_OPTIONS = ["Critical", "High", "Medium", "Low"];
const FIELD_TYPE_OPTIONS = [
  { value: "text", label: "Text" },
  { value: "number", label: "Number" },
  { value: "date", label: "Date" },
  { value: "tag", label: "Tag" },
];
const DEPARTMENT_OPTIONS = ["Sales", "BDC", "Service", "Marketing", "Finance", "Leadership", "General"];

function cls(...parts) {
  return parts.filter(Boolean).join(" ");
}

function tone(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-");
}

function priorityScore(priority) {
  return { Critical: 4, High: 3, Medium: 2, Low: 1 }[priority] || 0;
}

function sortTasks(tasks) {
  return [...tasks].sort((left, right) => {
    const priorityGap = priorityScore(right.priority) - priorityScore(left.priority);
    if (priorityGap !== 0) return priorityGap;
    const leftDue = left.due_date || "9999-12-31";
    const rightDue = right.due_date || "9999-12-31";
    if (leftDue !== rightDue) return leftDue.localeCompare(rightDue);
    return String(left.name || "").localeCompare(String(right.name || ""));
  });
}

function formatDate(value) {
  if (!value) return "No date";
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(parsed);
}

function loadSession() {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
  } catch {
    return null;
  }
}

function saveSession(session) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

function blankProject(user) {
  return {
    name: "",
    description: "",
    color: "#4f6bed",
    department: user?.department || "Sales",
    store_id: user?.store_id || "",
  };
}

function blankUser(storeId = "") {
  return {
    name: "",
    title: "",
    role: "Staff",
    department: "Sales",
    store_id: storeId,
    phone: "",
    password: "",
    active: true,
  };
}

function blankStore() {
  return {
    name: "",
    code: "",
    city: "",
    manager: "",
    department_focus: "Sales",
    sales_target: 0,
    service_target: 0,
    active: true,
  };
}

function boardProgress(board) {
  const total = board.tasks?.length || 0;
  const done = (board.tasks || []).filter((task) => task.status === "Done").length;
  return { total, done, percent: total ? Math.round((done / total) * 100) : 0 };
}

function relevantBoards(boards, user) {
  if (!user) return boards;
  if (user.role === "Admin") return boards;
  const filtered = boards.filter((board) => {
    if (board.store_id && user.store_id && Number(board.store_id) === Number(user.store_id)) return true;
    if (board.department && user.department && board.department === user.department) return true;
    if ((board.tasks || []).some((task) => Number(task.owner_id) === Number(user.id))) return true;
    return false;
  });
  return filtered.length ? filtered : boards;
}

function LoginScreen({
  users,
  selectedUserId,
  onSelectUser,
  password,
  onPasswordChange,
  onSubmit,
  error,
  busy,
}) {
  const activeUsers = users.filter((user) => user.active !== false);

  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="login-card__copy">
          <span className="eyebrow">Bert Ogden Workspace</span>
          <h1>Simple projects any dealership team can use fast.</h1>
          <p>Select your profile, enter your own password, and go straight into your dashboard.</p>
          <p>
            Default admin login for setup: <strong>Kai Rivers</strong> with password <strong>bertogden</strong>.
          </p>
        </div>

        <div className="login-user-grid">
          {activeUsers.map((user) => (
            <button
              key={user.id}
              type="button"
              className={cls("login-user", Number(selectedUserId) === Number(user.id) && "is-active")}
              onClick={() => onSelectUser(user.id)}
            >
              <span className="avatar">{user.avatar || user.name.slice(0, 2).toUpperCase()}</span>
              <div>
                <strong>{user.name}</strong>
                <small>{user.title}</small>
              </div>
            </button>
          ))}
        </div>

        <form className="login-form" onSubmit={onSubmit}>
          <label>
            <span>Password</span>
            <input type="password" value={password} onChange={(event) => onPasswordChange(event.target.value)} />
          </label>
          {error ? <div className="error-banner">{error}</div> : null}
          <button type="submit" disabled={busy || !selectedUserId || !password.trim()}>
            {busy ? "Entering..." : "Enter Workspace"}
          </button>
        </form>
      </div>
    </div>
  );
}

function DashboardView({ currentUser, boards, announcements, onOpenBoard, storesById }) {
  const myTasks = sortTasks(
    boards.flatMap((board) =>
      board.tasks
        .filter((task) => Number(task.owner_id) === Number(currentUser.id) && task.status !== "Done")
        .map((task) => ({ ...task, board_id: board.id, board_name: board.name }))
    )
  );
  const today = new Date().toISOString().slice(0, 10);
  const overdue = myTasks.filter((task) => task.due_date && task.due_date < today);
  const dueSoon = myTasks.filter((task) => task.due_date && task.due_date >= today).slice(0, 5);
  const urgent = myTasks.filter((task) => ["Critical", "High"].includes(task.priority));
  const pinned = announcements.filter((item) => item.pinned);

  return (
    <div className="dashboard-view">
      <section className="stats">
        <article className="stat-card">
          <span>Assigned to you</span>
          <strong>{myTasks.length}</strong>
        </article>
        <article className="stat-card">
          <span>Urgent</span>
          <strong>{urgent.length}</strong>
        </article>
        <article className="stat-card">
          <span>Overdue</span>
          <strong>{overdue.length}</strong>
        </article>
        <article className="stat-card">
          <span>Projects</span>
          <strong>{boards.length}</strong>
        </article>
      </section>

      <div className="dashboard-grid">
        <section className="panel">
          <div className="panel__head">
            <div>
              <span className="eyebrow">My work</span>
              <h3>Due soon</h3>
            </div>
          </div>
          <div className="activity-list">
            {dueSoon.length ? (
              dueSoon.map((task) => (
                <button key={task.id} type="button" className="activity-row" onClick={() => onOpenBoard(task.board_id)}>
                  <div>
                    <strong>{task.name}</strong>
                    <small>
                      {task.board_name} - {formatDate(task.due_date)}
                    </small>
                  </div>
                  <span className={cls("pill", `pill--${tone(task.priority)}`)}>{task.priority}</span>
                </button>
              ))
            ) : (
              <div className="empty-state">No due-soon items assigned to you.</div>
            )}
          </div>
        </section>

        <section className="panel">
          <div className="panel__head">
            <div>
              <span className="eyebrow">Pinned updates</span>
              <h3>Workspace notes</h3>
            </div>
          </div>
          <div className="notice-stack">
            {pinned.length ? (
              pinned.map((item) => (
                <div key={item.id} className="notice-card">
                  <div className="notice-card__top">
                    <strong>{item.title}</strong>
                    <span className={cls("pill", `pill--${tone(item.priority)}`)}>{item.priority}</span>
                  </div>
                  <p>{item.message}</p>
                  <small>{item.audience}</small>
                </div>
              ))
            ) : (
              <div className="empty-state">No pinned updates.</div>
            )}
          </div>
        </section>
      </div>

      <section className="panel">
        <div className="panel__head">
          <div>
            <span className="eyebrow">Projects</span>
            <h3>Your boards</h3>
          </div>
        </div>
        <div className="project-grid">
          {boards.map((board) => {
            const progress = boardProgress(board);
            return (
              <button key={board.id} type="button" className="project-card" onClick={() => onOpenBoard(board.id)}>
                <div className="project-card__top">
                  <span className="project-swatch" style={{ background: board.color }} />
                  <span>{storesById.get(board.store_id)?.name || board.department}</span>
                </div>
                <strong>{board.name}</strong>
                <p>{board.description || "No description yet."}</p>
                <div className="progress-row">
                  <small>
                    {progress.done}/{progress.total} done
                  </small>
                  <small>{progress.percent}%</small>
                </div>
                <div className="progress-bar">
                  <span style={{ width: `${progress.percent}%`, background: board.color }} />
                </div>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function TaskRow({ task, board, users, onUpdateTask }) {
  function saveField(field, nextValue) {
    const currentValue = task[field] ?? "";
    if (String(currentValue) === String(nextValue ?? "")) return;
    onUpdateTask(task.id, { [field]: nextValue || (field === "due_date" ? null : nextValue) });
  }

  function saveCustomField(field, rawValue) {
    const current = task.custom_fields?.[String(field.id)] ?? "";
    let nextValue = rawValue;
    if (field.type === "number") nextValue = rawValue === "" ? null : Number(rawValue);
    if (field.type === "date") nextValue = rawValue || null;
    if (String(current ?? "") === String(nextValue ?? "")) return;
    onUpdateTask(task.id, {
      custom_fields: {
        ...(task.custom_fields || {}),
        [String(field.id)]: nextValue,
      },
    });
  }

  return (
    <tr>
      <td>
        <input className="cell-input cell-input--task" defaultValue={task.name} onBlur={(event) => saveField("name", event.target.value.trim())} />
      </td>
      <td>
        <select className={cls("cell-select", `cell-select--${tone(task.priority)}`)} value={task.priority} onChange={(event) => saveField("priority", event.target.value)}>
          {PRIORITY_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </td>
      <td>
        <select className={cls("cell-select", `cell-select--${tone(task.status)}`)} value={task.status} onChange={(event) => saveField("status", event.target.value)}>
          {STATUS_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </td>
      <td>
        <input className="cell-input" type="date" defaultValue={task.due_date || ""} onBlur={(event) => saveField("due_date", event.target.value)} />
      </td>
      <td>
        <select className="cell-select" value={task.owner_id || ""} onChange={(event) => saveField("owner_id", Number(event.target.value) || null)}>
          <option value="">Unassigned</option>
          {users.map((user) => (
            <option key={user.id} value={user.id}>
              {user.name}
            </option>
          ))}
        </select>
      </td>
      <td>
        <input className="cell-input" defaultValue={task.notes || ""} onBlur={(event) => saveField("notes", event.target.value)} />
      </td>
      {board.fields.map((field) => {
        const rawValue = task.custom_fields?.[String(field.id)] ?? "";
        const inputType = field.type === "number" ? "number" : field.type === "date" ? "date" : "text";
        return (
          <td key={`${task.id}-field-${field.id}`}>
            <input
              className={cls("cell-input", field.type === "tag" && rawValue ? "cell-input--tagged" : "")}
              type={inputType}
              defaultValue={rawValue ?? ""}
              onBlur={(event) => saveCustomField(field, event.target.value)}
            />
          </td>
        );
      })}
    </tr>
  );
}

function ProjectBoard({ board, currentUser, users, onUpdateTask, onCreateTask, onCreateGroup, onCreateField }) {
  const [search, setSearch] = useState("");
  const [mineOnly, setMineOnly] = useState(false);
  const [quickTasks, setQuickTasks] = useState({});
  const [groupName, setGroupName] = useState("");
  const [showFieldForm, setShowFieldForm] = useState(false);
  const [fieldDraft, setFieldDraft] = useState({ name: "", type: "text" });

  useEffect(() => {
    setQuickTasks({});
    setGroupName("");
    setShowFieldForm(false);
    setFieldDraft({ name: "", type: "text" });
    setSearch("");
    setMineOnly(false);
  }, [board.id]);

  function visibleTasksForGroup(groupId) {
    return sortTasks(
      board.tasks.filter((task) => {
        if (task.group_id !== groupId) return false;
        if (mineOnly && Number(task.owner_id) !== Number(currentUser.id)) return false;
        const haystack = [task.name, task.notes, task.priority, task.status]
          .concat(board.fields.map((field) => String(task.custom_fields?.[String(field.id)] || "")))
          .join(" ")
          .toLowerCase();
        return haystack.includes(search.trim().toLowerCase());
      })
    );
  }

  function submitQuickTask(event, groupId) {
    event.preventDefault();
    const name = (quickTasks[groupId] || "").trim();
    if (!name) return;
    onCreateTask(groupId, name);
    setQuickTasks((current) => ({ ...current, [groupId]: "" }));
  }

  function submitField(event) {
    event.preventDefault();
    const name = fieldDraft.name.trim();
    if (!name) return;
    onCreateField(fieldDraft);
    setFieldDraft({ name: "", type: "text" });
    setShowFieldForm(false);
  }

  function submitGroup(event) {
    event.preventDefault();
    const name = groupName.trim();
    if (!name) return;
    onCreateGroup(name);
    setGroupName("");
  }

  return (
    <div className="project-board">
      <section className="board-hero">
        <div>
          <span className="eyebrow">Project</span>
          <h2>{board.name}</h2>
          <p>{board.description || "Simple project board for groups, tasks, priorities, and notes."}</p>
        </div>
        <div className="board-hero__controls">
          <input className="search" placeholder="Search tasks or notes" value={search} onChange={(event) => setSearch(event.target.value)} />
          <button type="button" className={cls("toggle-chip", mineOnly && "is-active")} onClick={() => setMineOnly((current) => !current)}>
            {mineOnly ? "Only Mine" : "All Tasks"}
          </button>
          <button type="button" className="plus-button" onClick={() => setShowFieldForm((current) => !current)}>
            + Add Field
          </button>
        </div>
      </section>

      {showFieldForm ? (
        <form className="panel inline-form" onSubmit={submitField}>
          <label>
            <span>Field name</span>
            <input value={fieldDraft.name} onChange={(event) => setFieldDraft((current) => ({ ...current, name: event.target.value }))} />
          </label>
          <label>
            <span>Type</span>
            <select value={fieldDraft.type} onChange={(event) => setFieldDraft((current) => ({ ...current, type: event.target.value }))}>
              {FIELD_TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <button type="submit">Add Field</button>
        </form>
      ) : null}

      <div className="group-stack">
        {board.groups.map((group) => {
          const tasks = visibleTasksForGroup(group.id);
          return (
            <section key={group.id} className="group-card">
              <div className="group-card__head">
                <div>
                  <h3>{group.name}</h3>
                  <small>{tasks.length} tasks</small>
                </div>
              </div>
              <div className="board-table-wrap">
                <table className="board-table">
                  <thead>
                    <tr>
                      <th>Task</th>
                      <th>Priority</th>
                      <th>Status</th>
                      <th>Due Date</th>
                      <th>Owner</th>
                      <th>Notes</th>
                      {board.fields.map((field) => (
                        <th key={`field-head-${field.id}`}>{field.name}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {tasks.map((task) => (
                      <TaskRow key={task.id} task={task} board={board} users={users} onUpdateTask={onUpdateTask} />
                    ))}
                    <tr className="add-row">
                      <td colSpan={6 + board.fields.length}>
                        <form className="add-task-inline" onSubmit={(event) => submitQuickTask(event, group.id)}>
                          <button type="submit" className="plus-button plus-button--small">
                            +
                          </button>
                          <input
                            placeholder={`Add task to ${group.name}`}
                            value={quickTasks[group.id] || ""}
                            onChange={(event) =>
                              setQuickTasks((current) => ({
                                ...current,
                                [group.id]: event.target.value,
                              }))
                            }
                          />
                        </form>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>
          );
        })}
      </div>

      <form className="panel inline-form" onSubmit={submitGroup}>
        <label>
          <span>New group</span>
          <input placeholder="This Week" value={groupName} onChange={(event) => setGroupName(event.target.value)} />
        </label>
        <button type="submit">+ Add Group</button>
      </form>
    </div>
  );
}

function GuideView() {
  return (
    <div className="settings-view">
      <section className="panel help-panel">
        <div className="panel__head">
          <div>
            <span className="eyebrow">Manifest</span>
            <h3>How this workspace works</h3>
          </div>
        </div>
        <div className="manifest-copy">
          <p>This workspace stays intentionally simple. The main structure is users, projects, groups inside projects, and tasks inside those groups.</p>
          <p>The default task surface is task name, priority, status, due date, owner, and notes. Anything extra should be added only when needed with the `+ Add Field` button inside a project.</p>
          <p>Admin access is a separate page that only appears for admin users. That is where new users and new rooftops are created.</p>
          <p>Recommended production subdomain: <strong>ops.bertogden123.com</strong>.</p>
          <p>The full written manifest lives in <strong>MANIFEST.md</strong> in this project folder.</p>
        </div>
      </section>
    </div>
  );
}

function AdminView({ data, storesById, newUserForm, setNewUserForm, newStoreForm, setNewStoreForm, onCreateUser, onCreateStore }) {
  return (
    <div className="settings-view">
      <section className="panel help-panel">
        <div className="panel__head">
          <div>
            <span className="eyebrow">Admin</span>
            <h3>User and rooftop setup</h3>
          </div>
        </div>
        <div className="manifest-copy">
          <p>Each user has their own unique password. New users are created here by an admin account.</p>
          <p>Only admin users can see this page. The default setup admin is <strong>Kai Rivers</strong> with password <strong>bertogden</strong>.</p>
        </div>
      </section>

      <div className="dashboard-grid">
        <form className="panel" onSubmit={onCreateUser}>
          <div className="panel__head">
            <div>
              <span className="eyebrow">Users</span>
              <h3>Add user</h3>
            </div>
          </div>
          <div className="form-grid">
            <label>
              <span>Name</span>
              <input value={newUserForm.name} onChange={(event) => setNewUserForm((current) => ({ ...current, name: event.target.value }))} />
            </label>
            <label>
              <span>Title</span>
              <input value={newUserForm.title} onChange={(event) => setNewUserForm((current) => ({ ...current, title: event.target.value }))} />
            </label>
            <label>
              <span>Role</span>
              <select value={newUserForm.role} onChange={(event) => setNewUserForm((current) => ({ ...current, role: event.target.value }))}>
                <option value="Admin">Admin</option>
                <option value="Manager">Manager</option>
                <option value="Coordinator">Coordinator</option>
                <option value="Staff">Staff</option>
              </select>
            </label>
            <label>
              <span>Department</span>
              <select value={newUserForm.department} onChange={(event) => setNewUserForm((current) => ({ ...current, department: event.target.value }))}>
                {DEPARTMENT_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Store</span>
              <select value={newUserForm.store_id} onChange={(event) => setNewUserForm((current) => ({ ...current, store_id: event.target.value }))}>
                <option value="">No store</option>
                {data.stores.map((store) => (
                  <option key={store.id} value={store.id}>
                    {store.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Phone</span>
              <input value={newUserForm.phone} onChange={(event) => setNewUserForm((current) => ({ ...current, phone: event.target.value }))} />
            </label>
            <label className="full-span">
              <span>Password</span>
              <input type="password" value={newUserForm.password} onChange={(event) => setNewUserForm((current) => ({ ...current, password: event.target.value }))} />
            </label>
          </div>
          <button type="submit">Add User</button>
        </form>

        <form className="panel" onSubmit={onCreateStore}>
          <div className="panel__head">
            <div>
              <span className="eyebrow">Rooftops</span>
              <h3>Add store</h3>
            </div>
          </div>
          <div className="form-grid">
            <label>
              <span>Name</span>
              <input value={newStoreForm.name} onChange={(event) => setNewStoreForm((current) => ({ ...current, name: event.target.value }))} />
            </label>
            <label>
              <span>Code</span>
              <input value={newStoreForm.code} onChange={(event) => setNewStoreForm((current) => ({ ...current, code: event.target.value.toUpperCase() }))} />
            </label>
            <label>
              <span>City</span>
              <input value={newStoreForm.city} onChange={(event) => setNewStoreForm((current) => ({ ...current, city: event.target.value }))} />
            </label>
            <label>
              <span>Manager</span>
              <input value={newStoreForm.manager} onChange={(event) => setNewStoreForm((current) => ({ ...current, manager: event.target.value }))} />
            </label>
          </div>
          <button type="submit">Add Store</button>
        </form>
      </div>

      <div className="dashboard-grid">
        <section className="panel">
          <div className="panel__head">
            <div>
              <span className="eyebrow">Current users</span>
              <h3>Workspace roster</h3>
            </div>
          </div>
          <div className="activity-list">
            {data.users.map((user) => (
              <div key={user.id} className="activity-row activity-row--static">
                <div>
                  <strong>{user.name}</strong>
                  <small>
                    {user.title} - {storesById.get(user.store_id)?.name || "No store"}
                  </small>
                </div>
                <span className="pill pill--medium">{user.role}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="panel">
          <div className="panel__head">
            <div>
              <span className="eyebrow">Current stores</span>
              <h3>Dealership rooftops</h3>
            </div>
          </div>
          <div className="activity-list">
            {data.stores.map((store) => (
              <div key={store.id} className="activity-row activity-row--static">
                <div>
                  <strong>{store.name}</strong>
                  <small>
                    {store.code} - {store.city}
                  </small>
                </div>
                <span className="pill pill--low">{store.manager || "No manager"}</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

export default function App() {
  const [data, setData] = useState({
    stores: [],
    users: [],
    announcements: [],
    settings: { permissions: [], pipeline_templates: [] },
    boards: [],
  });
  const [session, setSession] = useState(() => loadSession());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [selectedBoardId, setSelectedBoardId] = useState(null);
  const [page, setPage] = useState("dashboard");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginUserId, setLoginUserId] = useState("");
  const [showProjectForm, setShowProjectForm] = useState(false);
  const [projectForm, setProjectForm] = useState(blankProject(null));
  const [newUserForm, setNewUserForm] = useState(blankUser(""));
  const [newStoreForm, setNewStoreForm] = useState(blankStore());

  async function load() {
    setLoading(true);
    try {
      setError("");
      const next = await getBootstrap();
      setData(next);
      setLoginUserId((current) => current || next.users.find((user) => user.active !== false)?.id || "");
    } catch (loadError) {
      setError(loadError.message || "Unable to load workspace");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const currentUser = useMemo(
    () => data.users.find((user) => Number(user.id) === Number(session?.user_id)) || null,
    [data.users, session?.user_id]
  );
  const storesById = useMemo(() => new Map(data.stores.map((store) => [store.id, store])), [data.stores]);
  const visibleBoards = useMemo(() => relevantBoards(data.boards, currentUser), [data.boards, currentUser]);
  const activeBoard = useMemo(
    () => visibleBoards.find((board) => Number(board.id) === Number(selectedBoardId)) || visibleBoards[0] || null,
    [visibleBoards, selectedBoardId]
  );

  useEffect(() => {
    if (!currentUser && session) {
      clearSession();
      setSession(null);
    }
  }, [currentUser?.id]);

  useEffect(() => {
    if (!activeBoard && visibleBoards.length) setSelectedBoardId(visibleBoards[0].id);
  }, [visibleBoards.length, activeBoard?.id]);

  useEffect(() => {
    if (currentUser) {
      setProjectForm(blankProject(currentUser));
      setNewUserForm(blankUser(currentUser.store_id || ""));
    }
  }, [currentUser?.id]);

  async function handleLogin(event) {
    event.preventDefault();
    setBusy("login");
    setError("");
    try {
      const response = await login({ user_id: Number(loginUserId), password: loginPassword });
      const nextSession = { user_id: response.user.id };
      saveSession(nextSession);
      setSession(nextSession);
      setPage("dashboard");
      setLoginPassword("");
    } catch (submitError) {
      setError(submitError.message || "Unable to log in");
    } finally {
      setBusy("");
    }
  }

  function handleLogout() {
    clearSession();
    setSession(null);
    setLoginPassword("");
    setPage("dashboard");
  }

  function mutateBoard(boardId, updater) {
    setData((current) => ({
      ...current,
      boards: current.boards.map((board) => (Number(board.id) === Number(boardId) ? updater(board) : board)),
    }));
  }

  async function handleCreateProject(event) {
    event.preventDefault();
    const name = projectForm.name.trim();
    if (!name) return;
    setBusy("create-project");
    setError("");
    try {
      const board = await createBoard({
        ...projectForm,
        name,
        store_id: Number(projectForm.store_id) || null,
      });
      setData((current) => ({ ...current, boards: [...current.boards, board] }));
      setSelectedBoardId(board.id);
      setShowProjectForm(false);
      setProjectForm(blankProject(currentUser));
      setPage("project");
    } catch (submitError) {
      setError(submitError.message || "Unable to create project");
    } finally {
      setBusy("");
    }
  }

  async function handleCreateGroup(name) {
    if (!activeBoard) return;
    setBusy("create-group");
    setError("");
    try {
      const group = await createGroup({ board_id: activeBoard.id, name });
      mutateBoard(activeBoard.id, (board) => ({ ...board, groups: [...board.groups, group] }));
    } catch (submitError) {
      setError(submitError.message || "Unable to create group");
    } finally {
      setBusy("");
    }
  }

  async function handleCreateField(draft) {
    if (!activeBoard) return;
    setBusy("create-field");
    setError("");
    try {
      const field = await createBoardField(activeBoard.id, draft);
      mutateBoard(activeBoard.id, (board) => ({ ...board, fields: [...board.fields, field] }));
    } catch (submitError) {
      setError(submitError.message || "Unable to create field");
    } finally {
      setBusy("");
    }
  }

  async function handleCreateTask(groupId, name) {
    if (!activeBoard || !currentUser) return;
    setBusy(`create-task-${groupId}`);
    setError("");
    try {
      const task = await createTask({
        board_id: activeBoard.id,
        group_id: groupId,
        name,
        status: "Not started",
        priority: "Medium",
        owner_id: currentUser.id,
        store_id: activeBoard.store_id || currentUser.store_id || null,
        department: activeBoard.department || currentUser.department || "General",
        category: "Task",
        customer_name: "",
        vehicle: "",
        due_date: null,
        effort: 1,
        notes: "",
        custom_fields: {},
      });
      mutateBoard(activeBoard.id, (board) => ({ ...board, tasks: [...board.tasks, task] }));
    } catch (submitError) {
      setError(submitError.message || "Unable to create task");
    } finally {
      setBusy("");
    }
  }

  async function handleUpdateTask(taskId, changes) {
    if (!activeBoard) return;
    setError("");
    try {
      const updated = await updateTask(activeBoard.id, taskId, changes);
      mutateBoard(activeBoard.id, (board) => ({
        ...board,
        tasks: board.tasks.map((task) => (Number(task.id) === Number(taskId) ? { ...task, ...updated } : task)),
      }));
    } catch (submitError) {
      setError(submitError.message || "Unable to update task");
    }
  }

  async function handleCreateUser(event) {
    event.preventDefault();
    const name = newUserForm.name.trim();
    const password = newUserForm.password.trim();
    if (!name || !password) return;
    setBusy("create-user");
    setError("");
    try {
      const user = await createUser({
        ...newUserForm,
        name,
        password,
        store_id: Number(newUserForm.store_id) || null,
      });
      setData((current) => ({ ...current, users: [...current.users, user] }));
      setNewUserForm(blankUser(currentUser?.store_id || ""));
    } catch (submitError) {
      setError(submitError.message || "Unable to create user");
    } finally {
      setBusy("");
    }
  }

  async function handleCreateStore(event) {
    event.preventDefault();
    const name = newStoreForm.name.trim();
    const code = newStoreForm.code.trim();
    if (!name || !code) return;
    setBusy("create-store");
    setError("");
    try {
      const store = await createStore({
        ...newStoreForm,
        name,
        code,
        sales_target: Number(newStoreForm.sales_target) || 0,
        service_target: Number(newStoreForm.service_target) || 0,
      });
      setData((current) => ({ ...current, stores: [...current.stores, store] }));
      setNewStoreForm(blankStore());
    } catch (submitError) {
      setError(submitError.message || "Unable to create store");
    } finally {
      setBusy("");
    }
  }

  if (loading) {
    return <div className="loading-screen">Loading workspace...</div>;
  }

  if (!session || !currentUser) {
    return (
      <LoginScreen
        users={data.users}
        selectedUserId={loginUserId}
        onSelectUser={setLoginUserId}
        password={loginPassword}
        onPasswordChange={setLoginPassword}
        onSubmit={handleLogin}
        error={error}
        busy={busy === "login"}
      />
    );
  }

  const isAdmin = currentUser.role === "Admin";

  return (
    <div className="workspace-shell">
      <aside className="sidebar">
        <div className="sidebar__brand">
          <span className="brand-dot" />
          <div>
            <span className="eyebrow">Bert Ogden</span>
            <h1>Dealer Work OS</h1>
          </div>
        </div>

        <div className="current-user">
          <span className="avatar">{currentUser.avatar || currentUser.name.slice(0, 2).toUpperCase()}</span>
          <div>
            <strong>{currentUser.name}</strong>
            <small>{currentUser.title}</small>
          </div>
        </div>

        <nav className="main-nav">
          <button type="button" className={page === "dashboard" ? "is-active" : ""} onClick={() => setPage("dashboard")}>
            Dashboard
          </button>
          <button type="button" className={page === "project" ? "is-active" : ""} onClick={() => setPage("project")}>
            Projects
          </button>
          <button type="button" className={page === "guide" ? "is-active" : ""} onClick={() => setPage("guide")}>
            Guide
          </button>
          {isAdmin ? (
            <button type="button" className={page === "admin" ? "is-active" : ""} onClick={() => setPage("admin")}>
              Admin
            </button>
          ) : null}
        </nav>

        <section className="sidebar-section">
          <div className="section-title">
            <span>Projects</span>
            <button type="button" className="plus-button plus-button--small" onClick={() => setShowProjectForm((current) => !current)}>
              +
            </button>
          </div>
          <div className="project-list">
            {visibleBoards.map((board) => (
              <button
                key={board.id}
                type="button"
                className={cls("project-nav-item", Number(activeBoard?.id) === Number(board.id) && "is-active")}
                onClick={() => {
                  setSelectedBoardId(board.id);
                  setPage("project");
                }}
              >
                <span className="project-swatch" style={{ background: board.color }} />
                <div>
                  <strong>{board.name}</strong>
                  <small>{board.department}</small>
                </div>
              </button>
            ))}
          </div>
        </section>

        {showProjectForm ? (
          <form className="sidebar-form" onSubmit={handleCreateProject}>
            <label>
              <span>Name</span>
              <input value={projectForm.name} onChange={(event) => setProjectForm((current) => ({ ...current, name: event.target.value }))} />
            </label>
            <label>
              <span>Description</span>
              <input
                value={projectForm.description}
                onChange={(event) => setProjectForm((current) => ({ ...current, description: event.target.value }))}
              />
            </label>
            <label>
              <span>Department</span>
              <select value={projectForm.department} onChange={(event) => setProjectForm((current) => ({ ...current, department: event.target.value }))}>
                {DEPARTMENT_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Store</span>
              <select value={projectForm.store_id} onChange={(event) => setProjectForm((current) => ({ ...current, store_id: event.target.value }))}>
                <option value="">No store</option>
                {data.stores.map((store) => (
                  <option key={store.id} value={store.id}>
                    {store.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Color</span>
              <input type="color" value={projectForm.color} onChange={(event) => setProjectForm((current) => ({ ...current, color: event.target.value }))} />
            </label>
            <button type="submit" disabled={busy === "create-project"}>
              {busy === "create-project" ? "Creating..." : "Create Project"}
            </button>
          </form>
        ) : null}

        <button type="button" className="logout-button" onClick={handleLogout}>
          Log Out
        </button>
      </aside>

      <main className="main-panel">
        <header className="topbar">
          <div>
            <span className="eyebrow">Workspace</span>
            <h2>
              {page === "dashboard"
                ? "My Dashboard"
                : page === "project"
                  ? activeBoard?.name || "Projects"
                  : page === "guide"
                    ? "Guide"
                    : "Admin"}
            </h2>
          </div>
          <div className="topbar__meta">
            <span>{storesById.get(currentUser.store_id)?.name || currentUser.department}</span>
          </div>
        </header>

        {error ? <div className="error-banner">{error}</div> : null}

        {page === "dashboard" ? (
          <DashboardView
            currentUser={currentUser}
            boards={visibleBoards}
            announcements={data.announcements}
            onOpenBoard={(boardId) => {
              setSelectedBoardId(boardId);
              setPage("project");
            }}
            storesById={storesById}
          />
        ) : null}

        {page === "project" && activeBoard ? (
          <ProjectBoard
            board={activeBoard}
            currentUser={currentUser}
            users={data.users.filter((user) => user.active !== false)}
            onUpdateTask={handleUpdateTask}
            onCreateTask={handleCreateTask}
            onCreateGroup={handleCreateGroup}
            onCreateField={handleCreateField}
          />
        ) : null}

        {page === "guide" ? <GuideView /> : null}

        {page === "admin" && isAdmin ? (
          <AdminView
            data={data}
            storesById={storesById}
            newUserForm={newUserForm}
            setNewUserForm={setNewUserForm}
            newStoreForm={newStoreForm}
            setNewStoreForm={setNewStoreForm}
            onCreateUser={handleCreateUser}
            onCreateStore={handleCreateStore}
          />
        ) : null}
      </main>
    </div>
  );
}
