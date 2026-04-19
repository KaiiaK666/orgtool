import React, { useEffect, useMemo, useState } from "react";
import {
  createBoard,
  createBoardField,
  createGroup,
  createTask,
  createUser,
  deleteUser,
  getBootstrap,
  login,
  updateTask,
} from "./api.js";

const SESSION_KEY = "orgtool-session";
const LOGO_SRC = "/organization-tool-mark.png";
const STATUS_OPTIONS = ["Not started", "Working on it", "Review", "Stuck", "Done"];
const PRIORITY_OPTIONS = ["Critical", "High", "Medium", "Low"];
const ROLE_OPTIONS = ["Admin", "Manager", "Coordinator", "Staff"];
const FIELD_TYPE_OPTIONS = [
  { value: "text", label: "Text" },
  { value: "number", label: "Number" },
  { value: "date", label: "Date" },
  { value: "tag", label: "Tag" },
];
const DEPARTMENT_OPTIONS = ["Leadership", "BDC", "Sales", "Service", "Marketing", "Finance", "General"];

function cls(...parts) {
  return parts.filter(Boolean).join(" ");
}

function tone(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-");
}

function initials(name = "") {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
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

function boardProgress(board) {
  const total = board.tasks?.length || 0;
  const done = (board.tasks || []).filter((task) => task.status === "Done").length;
  return { total, done, percent: total ? Math.round((done / total) * 100) : 0 };
}

function relevantBoards(boards, user) {
  if (!user) return boards;
  if (user.role === "Admin") return boards;
  const filtered = boards.filter((board) => {
    if (board.department && user.department && board.department === user.department) return true;
    if ((board.tasks || []).some((task) => Number(task.owner_id) === Number(user.id))) return true;
    return false;
  });
  return filtered.length ? filtered : boards;
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
    color: "#3156f5",
    department: user?.department || "General",
    store_id: null,
  };
}

function blankUser() {
  return {
    name: "",
    title: "",
    role: "Staff",
    department: "General",
    store_id: null,
    phone: "",
    password: "",
    active: true,
  };
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
        <div className="login-card__hero">
          <div className="brand-lockup">
            <img className="brand-mark brand-mark--large" src={LOGO_SRC} alt="Organization Tool logo" />
            <div className="brand-copy">
              <span className="eyebrow">Organization Tool</span>
              <h1>Simple projects that stay easy to read.</h1>
              <p>Pick your profile, enter your password, and land directly in your own dashboard.</p>
              <p>
                Setup login: <strong>Miguel Castillo</strong> with password <strong>bertogden</strong>.
              </p>
            </div>
          </div>
        </div>

        <div className="login-user-grid">
          {activeUsers.map((user) => (
            <button
              key={user.id}
              type="button"
              className={cls("login-user", Number(selectedUserId) === Number(user.id) && "is-active")}
              onClick={() => onSelectUser(user.id)}
            >
              <span className="avatar">{user.avatar || initials(user.name)}</span>
              <div>
                <strong>{user.name}</strong>
                <small>{user.title || user.department}</small>
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

function DashboardView({ currentUser, boards, announcements, onOpenBoard }) {
  const myTasks = sortTasks(
    boards.flatMap((board) =>
      board.tasks
        .filter((task) => Number(task.owner_id) === Number(currentUser.id) && task.status !== "Done")
        .map((task) => ({ ...task, board_id: board.id, board_name: board.name }))
    )
  );
  const today = new Date().toISOString().slice(0, 10);
  const overdue = myTasks.filter((task) => task.due_date && task.due_date < today);
  const dueThisWeek = myTasks.filter((task) => task.due_date && task.due_date >= today).slice(0, 5);
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
            {dueThisWeek.length ? (
              dueThisWeek.map((task) => (
                <button key={task.id} type="button" className="activity-row" onClick={() => onOpenBoard(task.board_id)}>
                  <div>
                    <strong>{task.name}</strong>
                    <small>
                      {task.board_name} • {formatDate(task.due_date)}
                    </small>
                  </div>
                  <span className={cls("pill", `pill--${tone(task.priority)}`)}>{task.priority}</span>
                </button>
              ))
            ) : (
              <div className="empty-state">No due-soon tasks are assigned to you.</div>
            )}
          </div>
        </section>

        <section className="panel">
          <div className="panel__head">
            <div>
              <span className="eyebrow">Pinned notes</span>
              <h3>Keep this simple</h3>
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
              <div className="empty-state">No pinned notes right now.</div>
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
                  <span className={cls("project-chip", `project-chip--${tone(board.department)}`)}>{board.department}</span>
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
    const currentValue = task.custom_fields?.[String(field.id)] ?? "";
    let nextValue = rawValue;
    if (field.type === "number") nextValue = rawValue === "" ? null : Number(rawValue);
    if (field.type === "date") nextValue = rawValue || null;
    if (String(currentValue ?? "") === String(nextValue ?? "")) return;
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
        const value = task.custom_fields?.[String(field.id)] ?? "";
        const inputType = field.type === "number" ? "number" : field.type === "date" ? "date" : "text";
        return (
          <td key={`${task.id}-field-${field.id}`}>
            <input
              className={cls("cell-input", field.type === "tag" && value ? "cell-input--tagged" : "")}
              type={inputType}
              defaultValue={value ?? ""}
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
    setSearch("");
    setMineOnly(false);
    setQuickTasks({});
    setGroupName("");
    setShowFieldForm(false);
    setFieldDraft({ name: "", type: "text" });
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
    onCreateField({ ...fieldDraft, name });
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
          <span className="eyebrow">{board.department}</span>
          <h2>{board.name}</h2>
          <p>{board.description || "Simple board for groups, tasks, priorities, due dates, and notes."}</p>
        </div>
        <div className="board-hero__controls">
          <input className="search" placeholder="Search tasks or notes" value={search} onChange={(event) => setSearch(event.target.value)} />
          <button type="button" className={cls("toggle-chip", mineOnly && "is-active")} onClick={() => setMineOnly((current) => !current)}>
            {mineOnly ? "Only mine" : "All tasks"}
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
          <button type="submit">Add field</button>
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
                      <th>Due</th>
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

      <form className="panel inline-form inline-form--group" onSubmit={submitGroup}>
        <label>
          <span>New group</span>
          <input placeholder="This Week" value={groupName} onChange={(event) => setGroupName(event.target.value)} />
        </label>
        <button type="submit">+ Add Group</button>
      </form>
    </div>
  );
}

function AdminView({ data, currentUser, newUserForm, setNewUserForm, onCreateUser, onDeleteUser, busy }) {
  return (
    <div className="settings-view">
      <section className="panel help-panel">
        <div className="panel__head">
          <div>
            <span className="eyebrow">Admin</span>
            <h3>People management</h3>
          </div>
        </div>
        <div className="manifest-copy">
          <p>This area is for adding and removing people from the workspace without making the rest of the UI feel heavy.</p>
          <p>
            Current setup admin: <strong>Miguel Castillo</strong> with password <strong>bertogden</strong>.
          </p>
        </div>
      </section>

      <div className="dashboard-grid dashboard-grid--admin">
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
                {ROLE_OPTIONS.map((role) => (
                  <option key={role} value={role}>
                    {role}
                  </option>
                ))}
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
            <label className="full-span">
              <span>Password</span>
              <input type="password" value={newUserForm.password} onChange={(event) => setNewUserForm((current) => ({ ...current, password: event.target.value }))} />
            </label>
          </div>
          <button type="submit" disabled={busy === "create-user"}>
            {busy === "create-user" ? "Adding..." : "Add User"}
          </button>
        </form>

        <section className="panel">
          <div className="panel__head">
            <div>
              <span className="eyebrow">Current users</span>
              <h3>Workspace roster</h3>
            </div>
          </div>
          <div className="roster-list">
            {data.users.map((user) => (
              <div key={user.id} className="roster-card">
                <div className="roster-card__left">
                  <span className="avatar">{user.avatar || initials(user.name)}</span>
                  <div>
                    <strong>{user.name}</strong>
                    <small>
                      {user.title || "No title"} • {user.department}
                    </small>
                  </div>
                </div>
                <div className="roster-card__right">
                  <span className={cls("pill", `pill--${tone(user.role)}`)}>{user.role}</span>
                  <button type="button" className="ghost-button ghost-button--danger" onClick={() => onDeleteUser(user.id)} disabled={Number(user.id) === Number(currentUser.id)}>
                    Remove
                  </button>
                </div>
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
  const [newUserForm, setNewUserForm] = useState(blankUser());

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
  const activeUsers = useMemo(() => data.users.filter((user) => user.active !== false), [data.users]);
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
  }, [currentUser?.id, session]);

  useEffect(() => {
    if (!activeBoard && visibleBoards.length) setSelectedBoardId(visibleBoards[0].id);
  }, [visibleBoards.length, activeBoard?.id]);

  useEffect(() => {
    if (currentUser) {
      setProjectForm(blankProject(currentUser));
      setNewUserForm(blankUser());
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
    setPage("dashboard");
    setLoginPassword("");
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
        store_id: null,
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
        store_id: null,
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
        store_id: null,
      });
      setData((current) => ({ ...current, users: [...current.users, user] }));
      setNewUserForm(blankUser());
    } catch (submitError) {
      setError(submitError.message || "Unable to create user");
    } finally {
      setBusy("");
    }
  }

  async function handleDeleteUser(userId) {
    setBusy(`delete-user-${userId}`);
    setError("");
    try {
      await deleteUser(userId);
      setData((current) => ({
        ...current,
        users: current.users.filter((user) => Number(user.id) !== Number(userId)),
        boards: current.boards.map((board) => ({
          ...board,
          tasks: board.tasks.map((task) => (Number(task.owner_id) === Number(userId) ? { ...task, owner_id: null } : task)),
        })),
      }));
      if (Number(currentUser?.id) === Number(userId)) handleLogout();
    } catch (submitError) {
      setError(submitError.message || "Unable to remove user");
    } finally {
      setBusy("");
    }
  }

  if (loading) {
    return <div className="loading-screen">Loading Organization Tool...</div>;
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
  const pageTitle =
    page === "dashboard" ? "My Dashboard" : page === "project" ? activeBoard?.name || "Projects" : "Admin";
  const pageCopy =
    page === "dashboard"
      ? "Your projects, due dates, and priorities in one place."
      : page === "project"
        ? "Keep groups simple and update the board directly."
        : "Add and remove people without touching the rest of the workspace.";

  return (
    <div className="workspace-shell">
      <aside className="sidebar">
        <div className="sidebar__brand">
          <img className="brand-mark" src={LOGO_SRC} alt="Organization Tool logo" />
          <div>
            <span className="eyebrow">Organization Tool</span>
            <h1>Simple workboards</h1>
          </div>
        </div>

        <div className="current-user">
          <span className="avatar">{currentUser.avatar || initials(currentUser.name)}</span>
          <div>
            <strong>{currentUser.name}</strong>
            <small>{currentUser.title || currentUser.department}</small>
          </div>
        </div>

        <nav className="main-nav">
          <button type="button" className={page === "dashboard" ? "is-active" : ""} onClick={() => setPage("dashboard")}>
            Dashboard
          </button>
          <button type="button" className={page === "project" ? "is-active" : ""} onClick={() => setPage("project")}>
            Projects
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
            <h2>{pageTitle}</h2>
            <p>{pageCopy}</p>
          </div>
          <div className="topbar__meta">
            <span className={cls("pill", `pill--${tone(currentUser.department)}`)}>{currentUser.department}</span>
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
          />
        ) : null}

        {page === "project" && activeBoard ? (
          <ProjectBoard
            board={activeBoard}
            currentUser={currentUser}
            users={activeUsers}
            onUpdateTask={handleUpdateTask}
            onCreateTask={handleCreateTask}
            onCreateGroup={handleCreateGroup}
            onCreateField={handleCreateField}
          />
        ) : null}

        {page === "admin" && isAdmin ? (
          <AdminView
            data={data}
            currentUser={currentUser}
            newUserForm={newUserForm}
            setNewUserForm={setNewUserForm}
            onCreateUser={handleCreateUser}
            onDeleteUser={handleDeleteUser}
            busy={busy}
          />
        ) : null}
      </main>
    </div>
  );
}
