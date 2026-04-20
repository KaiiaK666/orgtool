import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  createBoard,
  createBoardField,
  createGroup,
  createTask,
  createUser,
  deleteUser,
  getBootstrap,
  login,
  updateBoard,
  updateGroup,
  updateTask,
  updateUser,
} from "./api.js";

const SESSION_KEY = "orgtool-session";
const THEME_KEY = "orgtool-theme";
const COLUMN_WIDTHS_KEY_PREFIX = "orgtool-column-widths";
const LOGO_SRC = "/organization-tool-mark.png";
const MOBILE_LAYOUT_QUERY = "(max-width: 900px)";
const STATUS_OPTIONS = ["Overdue", "Pending", "Done"];
const PRIORITY_OPTIONS = ["Critical", "High", "Medium", "Low"];
const ROLE_OPTIONS = ["Admin", "Manager", "Coordinator", "Staff"];
const MAX_NOTE_SCREENSHOTS = 8;
const COLUMN_TYPE_OPTIONS = [
  { value: "text", label: "Open", hint: "Flexible text for names, references, links, or freeform details." },
  { value: "date", label: "Date", hint: "Calendar dates for deadlines, appointments, and follow-up targets." },
  { value: "number", label: "Number", hint: "Counts, amounts, goals, and any numeric value you want to sort fast." },
  { value: "tag", label: "Tag", hint: "Short labels like rooftop, campaign, lane, or source." },
];
const DEPARTMENT_OPTIONS = ["Leadership", "BDC", "Sales", "Service", "Marketing", "Finance", "General"];
const DISPLAY_MODE_QUERY = "(display-mode: standalone)";

function cls(...parts) {
  return parts.filter(Boolean).join(" ");
}

function isIOSDevice() {
  if (typeof navigator === "undefined") return false;
  const agent = `${navigator.userAgent || ""} ${navigator.platform || ""}`.toLowerCase();
  return /iphone|ipad|ipod/.test(agent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function isStandaloneApp() {
  if (typeof window === "undefined") return false;
  const displayModeStandalone = window.matchMedia?.(DISPLAY_MODE_QUERY).matches;
  const safariStandalone = "standalone" in window.navigator && window.navigator.standalone === true;
  return Boolean(displayModeStandalone || safariStandalone);
}

function useMediaQuery(query) {
  const getMatches = () => {
    if (typeof window === "undefined" || !window.matchMedia) return false;
    return window.matchMedia(query).matches;
  };

  const [matches, setMatches] = useState(getMatches);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return undefined;
    const media = window.matchMedia(query);
    const handleChange = () => setMatches(media.matches);
    handleChange();

    if (media.addEventListener) {
      media.addEventListener("change", handleChange);
      return () => media.removeEventListener("change", handleChange);
    }

    media.addListener(handleChange);
    return () => media.removeListener(handleChange);
  }, [query]);

  return matches;
}

function useInstallState() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [installState, setInstallState] = useState(() => ({
    isIOS: isIOSDevice(),
    isStandalone: isStandaloneApp(),
  }));

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const updateState = () =>
      setInstallState({
        isIOS: isIOSDevice(),
        isStandalone: isStandaloneApp(),
      });

    const handleBeforeInstallPrompt = (event) => {
      event.preventDefault();
      setDeferredPrompt(event);
      updateState();
    };

    const handleAppInstalled = () => {
      setDeferredPrompt(null);
      updateState();
    };

    const media = window.matchMedia ? window.matchMedia(DISPLAY_MODE_QUERY) : null;
    updateState();

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);
    document.addEventListener("visibilitychange", updateState);

    if (media?.addEventListener) {
      media.addEventListener("change", updateState);
    } else if (media?.addListener) {
      media.addListener(updateState);
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
      document.removeEventListener("visibilitychange", updateState);
      if (media?.removeEventListener) {
        media.removeEventListener("change", updateState);
      } else if (media?.removeListener) {
        media.removeListener(updateState);
      }
    };
  }, []);

  async function promptInstall() {
    if (!deferredPrompt) return false;
    deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice.catch(() => null);
    if (choice?.outcome === "accepted") {
      setDeferredPrompt(null);
      setInstallState((current) => ({ ...current, isStandalone: true }));
      return true;
    }
    return false;
  }

  return {
    isIOS: installState.isIOS,
    isStandalone: installState.isStandalone,
    canPromptInstall: Boolean(deferredPrompt),
    canInstall: !installState.isStandalone && (Boolean(deferredPrompt) || installState.isIOS),
    promptInstall,
  };
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

function visualStatus(task) {
  if (task.status === "Done") return "Done";
  const today = new Date().toISOString().slice(0, 10);
  if (task.status === "Overdue") return "Overdue";
  if (task.due_date && task.due_date < today) return "Overdue";
  return "Pending";
}

function sortTasks(tasks) {
  const statusRank = { Overdue: 0, Pending: 1, Done: 2 };
  return [...tasks].sort((left, right) => {
    const statusGap = statusRank[visualStatus(left)] - statusRank[visualStatus(right)];
    if (statusGap !== 0) return statusGap;
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

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Unable to read file"));
    reader.readAsDataURL(file);
  });
}

function loadImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Unable to load image"));
    image.src = dataUrl;
  });
}

async function imageToStoredDataUrl(file) {
  const dataUrl = await readFileAsDataUrl(file);
  try {
    const image = await loadImage(dataUrl);
    const maxDimension = 1400;
    const largestSide = Math.max(image.width || 0, image.height || 0);
    if (!largestSide || largestSide <= maxDimension) return dataUrl;

    const scale = maxDimension / largestSide;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(image.width * scale);
    canvas.height = Math.round(image.height * scale);
    const context = canvas.getContext("2d");
    if (!context) return dataUrl;
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.82);
  } catch {
    return dataUrl;
  }
}

function boardProgress(board) {
  const total = board.tasks?.length || 0;
  const done = (board.tasks || []).filter((task) => task.status === "Done").length;
  return { total, done, percent: total ? Math.round((done / total) * 100) : 0 };
}

function boardTone(board) {
  const tasks = board.tasks || [];
  if (tasks.some((task) => visualStatus(task) === "Overdue")) return "Overdue";
  if (tasks.some((task) => visualStatus(task) === "Pending")) return "Pending";
  if (tasks.length && tasks.every((task) => visualStatus(task) === "Done")) return "Done";
  return "Pending";
}

function boardGroupSummary(board) {
  const tasks = board.tasks || [];
  return (board.groups || []).map((group) => {
    const groupTasks = tasks.filter((task) => Number(task.group_id) === Number(group.id));
    const doneCount = groupTasks.filter((task) => task.status === "Done").length;
    let status = "Pending";
    if (groupTasks.some((task) => visualStatus(task) === "Overdue")) {
      status = "Overdue";
    } else if (groupTasks.length && doneCount === groupTasks.length) {
      status = "Done";
    }

    return {
      id: group.id,
      name: group.name,
      color: group.color || board.color || "#3156f5",
      taskCount: groupTasks.length,
      doneCount,
      status,
    };
  });
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

function loadTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  return saved === "dark" ? "dark" : "light";
}

function saveTheme(theme) {
  localStorage.setItem(THEME_KEY, theme);
}

function defaultColumnWidths(board) {
  const widths = {
    task: 560,
    priority: 180,
    status: 180,
    due_date: 170,
    owner: 230,
    notes: 340,
  };

  for (const field of board?.fields || []) {
    widths[`field:${field.id}`] =
      field.type === "date" ? 170 : field.type === "number" ? 130 : field.type === "tag" ? 170 : 220;
  }

  return widths;
}

function loadColumnWidths(board) {
  if (!board?.id) return defaultColumnWidths(board || { fields: [] });
  try {
    const saved = JSON.parse(localStorage.getItem(`${COLUMN_WIDTHS_KEY_PREFIX}-${board.id}`) || "{}");
    return { ...defaultColumnWidths(board), ...saved };
  } catch {
    return defaultColumnWidths(board);
  }
}

function persistColumnWidths(boardId, widths) {
  localStorage.setItem(`${COLUMN_WIDTHS_KEY_PREFIX}-${boardId}`, JSON.stringify(widths));
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
    username: "",
    title: "",
    role: "Staff",
    department: "General",
    store_id: null,
    phone: "",
    password: "",
    active: true,
    quick_login: false,
  };
}

function ThemeToggle({ theme, onToggle, compact = false }) {
  return (
    <button type="button" className={cls("theme-toggle", compact && "theme-toggle--compact")} onClick={onToggle}>
      {theme === "dark" ? "Light mode" : "Dark mode"}
    </button>
  );
}

function TutorialOverlay({ onClose }) {
  return (
    <div className="tutorial-overlay" role="dialog" aria-modal="true" aria-labelledby="tutorial-title">
      <div className="tutorial-backdrop" onClick={onClose} />
      <section className="tutorial-sheet">
        <div className="tutorial-sheet__head">
          <div>
            <span className="eyebrow">Tutorial</span>
            <h2 id="tutorial-title">How Organization Tool works</h2>
          </div>
          <button type="button" className="ghost-button" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="tutorial-grid">
          <article className="tutorial-card">
            <span className="tutorial-step">1</span>
            <h3>Log in</h3>
            <p>Use the username and password created in Admin. Each person lands in their own workspace view.</p>
          </article>

          <article className="tutorial-card">
            <span className="tutorial-step">2</span>
            <h3>Open a project</h3>
            <p>From Dashboard or the left sidebar, open a board to work inside its task groups.</p>
          </article>

          <article className="tutorial-card">
            <span className="tutorial-step">3</span>
            <h3>Read status quickly</h3>
            <p>Rows use fixed status colors: red for overdue, gray for pending, and green for done. You should be able to scan the board without reading every word.</p>
          </article>

          <article className="tutorial-card">
            <span className="tutorial-step">4</span>
            <h3>Resize columns</h3>
            <p>Drag the small handle on any column header to make it wider or narrower. Your sizes stay saved on that board.</p>
          </article>

          <article className="tutorial-card">
            <span className="tutorial-step">5</span>
            <h3>Customize structure</h3>
            <p>Use board color for the project accent, task-group color for each section rail, and add extra columns only when they help.</p>
          </article>

          <article className="tutorial-card">
            <span className="tutorial-step">6</span>
            <h3>Manage users</h3>
            <p>Admin can create users, change usernames and passwords, turn access on or off, and preview exactly what any user sees.</p>
          </article>
        </div>
      </section>
    </div>
  );
}

function InstallOverlay({ onClose, isIOS, canPromptInstall, onPromptInstall, installBusy }) {
  return (
    <div className="tutorial-overlay" role="dialog" aria-modal="true" aria-labelledby="install-title">
      <div className="tutorial-backdrop" onClick={onClose} />
      <section className="tutorial-sheet">
        <div className="tutorial-sheet__head">
          <div>
            <span className="eyebrow">Install app</span>
            <h2 id="install-title">Put Organization Tool on your Home Screen</h2>
          </div>
          <button type="button" className="ghost-button" onClick={onClose}>
            Close
          </button>
        </div>

        <p className="install-copy">
          {isIOS
            ? "On iPhone and iPad, install works through Safari. Once saved to the Home Screen, the app opens in its own standalone window."
            : "This browser can install Organization Tool as a standalone app. Once installed, it opens outside the browser tab bar like a normal app."}
        </p>

        <div className="tutorial-grid">
          {isIOS ? (
            <>
              <article className="tutorial-card">
                <span className="tutorial-step">1</span>
                <h3>Open in Safari</h3>
                <p>If you are inside another browser or an in-app browser, open the site in Safari first. iPhone Home Screen install only works from Safari.</p>
              </article>

              <article className="tutorial-card">
                <span className="tutorial-step">2</span>
                <h3>Tap Share</h3>
                <p>Use the Share button at the bottom of Safari. It looks like a square with an arrow pointing up.</p>
              </article>

              <article className="tutorial-card">
                <span className="tutorial-step">3</span>
                <h3>Add to Home Screen</h3>
                <p>Scroll the Share sheet until you see <strong>Add to Home Screen</strong>, then tap it.</p>
              </article>

              <article className="tutorial-card">
                <span className="tutorial-step">4</span>
                <h3>Tap Add</h3>
                <p>iPhone saves the app to your Home Screen. After that, Organization Tool opens like a standalone app instead of a browser page.</p>
              </article>
            </>
          ) : (
            <>
              <article className="tutorial-card">
                <span className="tutorial-step">1</span>
                <h3>Use browser install</h3>
                <p>Pick the install option below to let the browser add Organization Tool as a standalone app.</p>
              </article>

              <article className="tutorial-card">
                <span className="tutorial-step">2</span>
                <h3>Fallback menu install</h3>
                <p>If your browser does not show a native prompt, open the browser menu and look for <strong>Install app</strong>, <strong>Apps</strong>, or <strong>Add to desktop</strong>.</p>
              </article>
            </>
          )}
        </div>

        <div className="install-actions">
          {canPromptInstall ? (
            <button type="button" onClick={onPromptInstall} disabled={installBusy}>
              {installBusy ? "Opening install..." : "Install app"}
            </button>
          ) : null}
          <button type="button" className="ghost-button" onClick={onClose}>
            Back
          </button>
        </div>
      </section>
    </div>
  );
}

function LoginScreen({
  username,
  onUsernameChange,
  password,
  onPasswordChange,
  onSubmit,
  error,
  busy,
  theme,
  onToggleTheme,
  onOpenTutorial,
  onOpenInstall,
  installAvailable,
  quickLoginUsers,
  onQuickLoginSelect,
}) {
  return (
    <div className="login-screen">
      <div className="login-shell">
        <div className="login-shell__topbar">
          <div className="login-shell__brand">
            <img className="brand-mark" src={LOGO_SRC} alt="Organization Tool logo" />
            <div>
              <span className="eyebrow">Organization Tool</span>
              <strong>Workspace sign in</strong>
            </div>
          </div>
          <ThemeToggle theme={theme} onToggle={onToggleTheme} compact />
        </div>

        <section className="login-shell__card">
          <div className="login-shell__intro">
            <div>
              <span className="eyebrow">Sign in</span>
              <h1>Dealership organizational tool</h1>
            </div>
            <p>Use your username and password to open your workspace.</p>
          </div>

          <form className="login-form" onSubmit={onSubmit}>
            <label>
              <span>Username</span>
              <input type="text" autoComplete="username" placeholder="admin" value={username} onChange={(event) => onUsernameChange(event.target.value)} />
            </label>
            <label>
              <span>Password</span>
              <input type="password" autoComplete="current-password" placeholder="Password" value={password} onChange={(event) => onPasswordChange(event.target.value)} />
            </label>
            {error ? <div className="error-banner">{error}</div> : null}
            <button type="submit" disabled={busy || !username.trim() || !password.trim()}>
              {busy ? "Entering..." : "Enter Workspace"}
            </button>
          </form>

          {quickLoginUsers.length ? (
            <div className="quick-login-strip">
              <div className="quick-login-strip__head">
                <span className="eyebrow">Quick login users</span>
                <small>Tap a name to fill the username</small>
              </div>
              <div className="quick-login-strip__list">
                {quickLoginUsers.map((user) => (
                  <button
                    key={user.id}
                    type="button"
                    className={cls("quick-login-user", username === user.username && "is-active")}
                    onClick={() => onQuickLoginSelect(user.username)}
                  >
                    <span className="quick-login-user__name">{user.name}</span>
                    <small>@{user.username}</small>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <div className="login-shell__footer">
            {installAvailable ? (
              <button type="button" className="ghost-button" onClick={onOpenInstall}>
                Install app
              </button>
            ) : null}
            <button type="button" className="ghost-button" onClick={onOpenTutorial}>
              Tutorial
            </button>
          </div>
        </section>
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
  const overdue = myTasks.filter((task) => visualStatus(task) === "Overdue");
  const dueSoon = myTasks.filter((task) => task.due_date && task.due_date >= today).slice(0, 5);
  const urgent = myTasks.filter((task) => ["Critical", "High"].includes(task.priority));
  const pinned = announcements.filter((item) => item.pinned);

  return (
    <div className="dashboard-view">
      <section className="stats">
        <article className="stat-card stat-card--pending">
          <span>Assigned</span>
          <strong>{myTasks.length}</strong>
        </article>
        <article className="stat-card stat-card--urgent">
          <span>Urgent</span>
          <strong>{urgent.length}</strong>
        </article>
        <article className="stat-card stat-card--overdue">
          <span>Overdue</span>
          <strong>{overdue.length}</strong>
        </article>
        <article className="stat-card stat-card--done">
          <span>Projects</span>
          <strong>{boards.length}</strong>
        </article>
      </section>

      <div className="dashboard-grid">
        <section className="panel panel--dashboard">
          <div className="panel__head">
            <div>
              <span className="eyebrow">My work</span>
              <h3>What needs attention</h3>
            </div>
          </div>
          <div className="activity-list">
            {dueSoon.length ? (
              dueSoon.map((task) => (
                <button key={task.id} type="button" className={cls("activity-row", `activity-row--${tone(visualStatus(task))}`)} onClick={() => onOpenBoard(task.board_id)}>
                  <div>
                    <strong>{task.name}</strong>
                    <small>
                      {task.board_name} - {formatDate(task.due_date)}
                    </small>
                  </div>
                  <div className="activity-row__meta">
                    <span className={cls("pill", `pill--${tone(task.priority)}`)}>{task.priority}</span>
                    <span className={cls("pill", `pill--${tone(visualStatus(task))}`)}>{visualStatus(task)}</span>
                  </div>
                </button>
              ))
            ) : (
              <div className="empty-state">Nothing is due soon for you right now.</div>
            )}
          </div>
        </section>

        <section className="panel panel--dashboard">
          <div className="panel__head">
            <div>
              <span className="eyebrow">Pinned</span>
              <h3>Keep the board clean</h3>
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

      <section className="panel panel--dashboard panel--projects">
        <div className="panel__head">
          <div>
            <span className="eyebrow">Projects</span>
            <h3>Your boards</h3>
          </div>
        </div>
        <div className="project-grid project-grid--dashboard">
          {boards.map((board) => {
            const progress = boardProgress(board);
            const toneName = tone(boardTone(board));
            const groups = boardGroupSummary(board);
            const visibleGroups = groups.slice(0, 3);
            const hiddenGroupCount = Math.max(groups.length - visibleGroups.length, 0);
            const totalTasks = board.tasks?.length || 0;
            return (
              <button
                key={board.id}
                type="button"
                className={cls("project-card", "project-card--dashboard", `project-card--${toneName}`)}
                style={{ "--project-accent": board.color || "#3156f5" }}
                onClick={() => onOpenBoard(board.id)}
              >
                <div className="project-card__top">
                  <span className={cls("project-chip", `project-chip--${tone(board.department)}`)}>{board.department}</span>
                  <span className={cls("pill", `pill--${toneName}`)}>{boardTone(board)}</span>
                </div>
                <strong>{board.name}</strong>
                <p>{board.description || "No description yet."}</p>
                <div className="project-hierarchy">
                  <div className="project-hierarchy__head">
                    <small>{groups.length} task groups</small>
                    <small>{totalTasks} tasks</small>
                  </div>
                  <div className="project-hierarchy__list">
                    {visibleGroups.length ? (
                      visibleGroups.map((group) => (
                        <div key={group.id} className={cls("project-group-row", `project-group-row--${tone(group.status)}`)}>
                          <span className="project-group-row__name">
                            <i style={{ "--group-dot": group.color }} />
                            {group.name}
                          </span>
                          <span className="project-group-row__meta">{group.taskCount} tasks</span>
                        </div>
                      ))
                    ) : (
                      <div className="project-group-row project-group-row--empty">
                        <span className="project-group-row__name">No task groups yet</span>
                      </div>
                    )}
                    {hiddenGroupCount ? (
                      <div className="project-group-row project-group-row--more">
                        <span className="project-group-row__name">+{hiddenGroupCount} more groups</span>
                      </div>
                    ) : null}
                  </div>
                </div>
                <div className="project-card__footer">
                  <div className="progress-row">
                    <small>
                      {progress.done}/{progress.total} done
                    </small>
                    <small>{progress.percent}%</small>
                  </div>
                  <div className="progress-bar">
                    <span style={{ width: `${progress.percent}%`, background: board.color }} />
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function TaskNotesField({ task, onUpdateTask, compact = false }) {
  const fileInputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [isDragActive, setIsDragActive] = useState(false);
  const screenshots = Array.isArray(task.screenshots) ? task.screenshots : [];
  const remainingSlots = Math.max(0, MAX_NOTE_SCREENSHOTS - screenshots.length);

  function saveNotes(nextValue) {
    if (String(task.notes || "") === String(nextValue || "")) return;
    onUpdateTask(task.id, { notes: nextValue });
  }

  async function addScreenshots(fileList) {
    const imageFiles = Array.from(fileList || []).filter((file) => file.type.startsWith("image/"));
    if (!imageFiles.length || !remainingSlots) return;
    setUploading(true);
    try {
      const nextImages = await Promise.all(imageFiles.slice(0, remainingSlots).map((file) => imageToStoredDataUrl(file)));
      onUpdateTask(task.id, {
        screenshots: [...screenshots, ...nextImages].slice(0, MAX_NOTE_SCREENSHOTS),
      });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function removeScreenshot(indexToRemove) {
    onUpdateTask(task.id, {
      screenshots: screenshots.filter((_, index) => index !== indexToRemove),
    });
  }

  function handlePaste(event) {
    const imageFiles = Array.from(event.clipboardData?.files || []).filter((file) => file.type.startsWith("image/"));
    if (!imageFiles.length) return;
    event.preventDefault();
    addScreenshots(imageFiles);
  }

  function handleDragOver(event) {
    if (!Array.from(event.dataTransfer?.items || []).some((item) => item.type?.startsWith("image/"))) return;
    event.preventDefault();
    setIsDragActive(true);
  }

  function handleDragLeave(event) {
    if (event.currentTarget.contains(event.relatedTarget)) return;
    setIsDragActive(false);
  }

  function handleDrop(event) {
    const imageFiles = Array.from(event.dataTransfer?.files || []).filter((file) => file.type.startsWith("image/"));
    if (!imageFiles.length) return;
    event.preventDefault();
    setIsDragActive(false);
    addScreenshots(imageFiles);
  }

  return (
    <div
      className={cls("notes-field", compact && "notes-field--compact", isDragActive && "notes-field--drag")}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <textarea
        className={cls("cell-input", "cell-textarea", compact && "cell-textarea--compact")}
        rows={compact ? 2 : 3}
        defaultValue={task.notes || ""}
        placeholder="Notes"
        onBlur={(event) => saveNotes(event.target.value)}
        onPaste={handlePaste}
      />

      <div className="notes-field__toolbar">
        <button type="button" className="notes-media-button" onClick={() => fileInputRef.current?.click()} disabled={uploading || !remainingSlots}>
          {uploading ? "Adding..." : "+ Screenshot"}
        </button>
        <small>{remainingSlots ? `Paste, drag, or upload · ${screenshots.length}/${MAX_NOTE_SCREENSHOTS}` : `Screenshot limit reached · ${MAX_NOTE_SCREENSHOTS}/${MAX_NOTE_SCREENSHOTS}`}</small>
        <input ref={fileInputRef} type="file" accept="image/*" multiple hidden onChange={(event) => addScreenshots(event.target.files)} />
      </div>

      {screenshots.length ? (
        <div className="notes-shot-list">
          {screenshots.map((src, index) => (
            <div key={`${task.id}-shot-${index}`} className="notes-shot">
              <img src={src} alt={`Task screenshot ${index + 1}`} />
              <button type="button" className="notes-shot__remove" onClick={() => removeScreenshot(index)}>
                Remove
              </button>
            </div>
          ))}
        </div>
      ) : null}
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

  const rowStatus = visualStatus(task);

  return (
    <tr className={cls("task-row", `task-row--${tone(rowStatus)}`)}>
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
        <select className={cls("cell-select", `cell-select--${tone(rowStatus)}`)} value={task.status} onChange={(event) => saveField("status", event.target.value)}>
          {STATUS_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </td>
      <td>
        <input className="cell-input cell-input--date" type="date" defaultValue={task.due_date || ""} onBlur={(event) => saveField("due_date", event.target.value)} />
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
        <TaskNotesField task={task} onUpdateTask={onUpdateTask} compact />
      </td>
      {board.fields.map((field) => {
        const value = task.custom_fields?.[String(field.id)] ?? "";
        const inputType = field.type === "number" ? "number" : field.type === "date" ? "date" : "text";
        return (
          <td key={`${task.id}-column-${field.id}`}>
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

function MobileTaskCard({ task, board, users, onUpdateTask }) {
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

  const rowStatus = visualStatus(task);

  return (
    <article className={cls("mobile-task-card", `mobile-task-card--${tone(rowStatus)}`)}>
      <div className="mobile-task-card__head">
        <input className="cell-input cell-input--task" defaultValue={task.name} onBlur={(event) => saveField("name", event.target.value.trim())} />
        <span className={cls("pill", `pill--${tone(rowStatus)}`)}>{rowStatus}</span>
      </div>

      <div className="mobile-task-card__grid">
        <label>
          <span>Priority</span>
          <select className={cls("cell-select", `cell-select--${tone(task.priority)}`)} value={task.priority} onChange={(event) => saveField("priority", event.target.value)}>
            {PRIORITY_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span>Status</span>
          <select className={cls("cell-select", `cell-select--${tone(rowStatus)}`)} value={task.status} onChange={(event) => saveField("status", event.target.value)}>
            {STATUS_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span>Due</span>
          <input className="cell-input cell-input--date" type="date" value={task.due_date || ""} onChange={(event) => saveField("due_date", event.target.value)} />
        </label>

        <label>
          <span>Owner</span>
          <select className="cell-select" value={task.owner_id ?? ""} onChange={(event) => saveField("owner_id", event.target.value ? Number(event.target.value) : null)}>
            <option value="">Unassigned</option>
            {users.map((user) => (
              <option key={user.id} value={user.id}>
                {user.name}
              </option>
            ))}
          </select>
        </label>

        <div className="mobile-task-card__full mobile-task-card__section">
          <span>Notes</span>
          <TaskNotesField task={task} onUpdateTask={onUpdateTask} />
        </div>

        {board.fields.map((field) => {
          const value = task.custom_fields?.[String(field.id)] ?? "";
          const inputType = field.type === "number" ? "number" : field.type === "date" ? "date" : "text";
          return (
            <label key={`${task.id}-mobile-column-${field.id}`} className={field.type === "text" ? "mobile-task-card__full" : ""}>
              <span>{field.name}</span>
              <input
                className={cls("cell-input", field.type === "tag" && value ? "cell-input--tagged" : "")}
                type={inputType}
                defaultValue={value ?? ""}
                onBlur={(event) => saveCustomField(field, event.target.value)}
              />
            </label>
          );
        })}
      </div>
    </article>
  );
}

function ProjectBoard({
  board,
  currentUser,
  users,
  onUpdateTask,
  onCreateTask,
  onCreateGroup,
  onUpdateGroup,
  onCreateField,
  onUpdateBoard,
  isMobile,
}) {
  const [search, setSearch] = useState("");
  const [mineOnly, setMineOnly] = useState(false);
  const [quickTasks, setQuickTasks] = useState({});
  const [groupDraft, setGroupDraft] = useState({ name: "", color: "#3156f5" });
  const [showColumnForm, setShowColumnForm] = useState(false);
  const [columnDraft, setColumnDraft] = useState({ name: "", type: "text" });
  const [columnWidths, setColumnWidths] = useState(() => loadColumnWidths(board));
  const [showBoardEditor, setShowBoardEditor] = useState(false);
  const [boardDraft, setBoardDraft] = useState(() => ({
    name: board?.name || "",
    description: board?.description || "",
    department: board?.department || "General",
    color: board?.color || "#3156f5",
  }));
  const [editingGroupId, setEditingGroupId] = useState(null);
  const [groupEditDrafts, setGroupEditDrafts] = useState({});

  useEffect(() => {
    setSearch("");
    setMineOnly(false);
    setQuickTasks({});
    setGroupDraft({ name: "", color: board?.color || "#3156f5" });
    setShowColumnForm(false);
    setColumnDraft({ name: "", type: "text" });
    setColumnWidths(loadColumnWidths(board));
    setShowBoardEditor(false);
    setBoardDraft({
      name: board?.name || "",
      description: board?.description || "",
      department: board?.department || "General",
      color: board?.color || "#3156f5",
    });
    setEditingGroupId(null);
    setGroupEditDrafts({});
  }, [board?.id, board?.color, board?.fields?.length]);

  useEffect(() => {
    if (!board?.id) return;
    persistColumnWidths(board.id, columnWidths);
  }, [board?.id, columnWidths]);

  const selectedColumnType = COLUMN_TYPE_OPTIONS.find((option) => option.value === columnDraft.type) || COLUMN_TYPE_OPTIONS[0];

  if (!board) {
    return (
      <section className="panel">
        <div className="empty-state">Create a project to start building task groups.</div>
      </section>
    );
  }

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

  function submitColumn(event) {
    event.preventDefault();
    const name = columnDraft.name.trim();
    if (!name) return;
    onCreateField({ ...columnDraft, name });
    setColumnDraft({ name: "", type: "text" });
    setShowColumnForm(false);
  }

  function submitGroup(event) {
    event.preventDefault();
    const name = groupDraft.name.trim();
    if (!name) return;
    onCreateGroup(name, groupDraft.color);
    setGroupDraft((current) => ({ ...current, name: "" }));
  }

  function submitBoardDetails(event) {
    event.preventDefault();
    const name = boardDraft.name.trim();
    if (!name) return;
    onUpdateBoard({
      name,
      description: boardDraft.description.trim(),
      department: boardDraft.department,
      color: boardDraft.color,
    });
    setShowBoardEditor(false);
  }

  function openGroupEditor(group) {
    setEditingGroupId(group.id);
    setGroupEditDrafts((current) => ({
      ...current,
      [group.id]: {
        name: group.name || "",
        color: group.color || board.color || "#3156f5",
      },
    }));
  }

  function submitGroupDetails(event, group) {
    event.preventDefault();
    const draft = groupEditDrafts[group.id];
    if (!draft) return;
    const name = draft.name.trim();
    if (!name) return;
    onUpdateGroup(group.id, {
      name,
      color: draft.color,
    });
    setEditingGroupId(null);
  }

  function startColumnResize(columnKey, minimumWidth, event) {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = columnWidths[columnKey] || minimumWidth;

    function handleMove(moveEvent) {
      const delta = moveEvent.clientX - startX;
      setColumnWidths((current) => ({
        ...current,
        [columnKey]: Math.max(minimumWidth, startWidth + delta),
      }));
    }

    function handleUp() {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    }

    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
  }

  function columnKeyForField(field) {
    return `field:${field.id}`;
  }

  return (
    <div className="project-board">
      <section className={cls("board-hero", `board-hero--${tone(boardTone(board))}`)}>
        <div className="board-hero__summary">
          <span className="eyebrow">{board.department}</span>
          <h2>{board.name}</h2>
          <p>{board.description || "Simple board for task groups, due dates, notes, and priority."}</p>
        </div>

        <div className="board-hero__controls">
          <input className="search" placeholder="Search tasks or notes" value={search} onChange={(event) => setSearch(event.target.value)} />

          <button type="button" className={cls("toggle-chip", mineOnly && "is-active")} onClick={() => setMineOnly((current) => !current)}>
            {mineOnly ? "Only mine" : "All tasks"}
          </button>

          <button type="button" className={cls("ghost-button", showBoardEditor && "ghost-button--active")} onClick={() => setShowBoardEditor((current) => !current)}>
            {showBoardEditor ? "Close project" : "Edit project"}
          </button>

          <button type="button" className="plus-button" onClick={() => setShowColumnForm((current) => !current)}>
            {showColumnForm ? "Close columns" : "+ Add Column"}
          </button>
        </div>
      </section>

      {showBoardEditor ? (
        <form className="panel board-editor" onSubmit={submitBoardDetails}>
          <label>
            <span>Project name</span>
            <input value={boardDraft.name} onChange={(event) => setBoardDraft((current) => ({ ...current, name: event.target.value }))} />
          </label>
          <label>
            <span>Description</span>
            <input
              value={boardDraft.description}
              placeholder="What this project is for"
              onChange={(event) => setBoardDraft((current) => ({ ...current, description: event.target.value }))}
            />
          </label>
          <label>
            <span>Department</span>
            <select value={boardDraft.department} onChange={(event) => setBoardDraft((current) => ({ ...current, department: event.target.value }))}>
              {DEPARTMENT_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          <label className="color-control color-control--create">
            <span>Project color</span>
            <input type="color" value={boardDraft.color} onChange={(event) => setBoardDraft((current) => ({ ...current, color: event.target.value }))} />
          </label>
          <div className="board-editor__actions">
            <button type="button" className="ghost-button" onClick={() => setShowBoardEditor(false)}>
              Cancel
            </button>
            <button type="submit">Save project</button>
          </div>
        </form>
      ) : null}

      {showColumnForm ? (
        <form className="panel inline-form inline-form--column" onSubmit={submitColumn}>
          <label className="full-span">
            <span>Column name</span>
            <input
              placeholder={selectedColumnType.value === "text" ? "Example: VIN, Store note, Call result" : `Example: ${selectedColumnType.label}`}
              value={columnDraft.name}
              onChange={(event) => setColumnDraft((current) => ({ ...current, name: event.target.value }))}
            />
          </label>
          <div className="column-type-picker full-span">
            <span>Field format</span>
            <div className="column-type-picker__grid">
              {COLUMN_TYPE_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={cls("column-type-card", columnDraft.type === option.value && "is-active")}
                  onClick={() => setColumnDraft((current) => ({ ...current, type: option.value }))}
                >
                  <strong>{option.label}</strong>
                  <small>{option.hint}</small>
                </button>
              ))}
            </div>
          </div>
          <div className="column-type-picker__summary full-span">
            <span className="eyebrow">Selected format</span>
            <strong>{selectedColumnType.label}</strong>
            <p>{selectedColumnType.hint}</p>
          </div>
          <div className="board-editor__actions full-span">
            <button type="button" className="ghost-button" onClick={() => setShowColumnForm(false)}>
              Cancel
            </button>
            <button type="submit">Add column</button>
          </div>
        </form>
      ) : null}

      <div className="group-stack">
        {board.groups.map((group) => {
          const tasks = visibleTasksForGroup(group.id);
          const groupDraftValue = groupEditDrafts[group.id] || {
            name: group.name || "",
            color: group.color || board.color || "#3156f5",
          };
          return (
            <section key={group.id} className="group-card" style={{ "--group-accent": group.color || board.color || "#3156f5" }}>
              <div className="group-card__head">
                <div className="group-card__meta">
                  <h3>{group.name}</h3>
                  <small>{tasks.length} tasks</small>
                </div>

                <div className="group-card__actions">
                  <div className="group-card__swatch" style={{ "--group-swatch": group.color || board.color || "#3156f5" }} />
                  <button type="button" className={cls("ghost-button", editingGroupId === group.id && "ghost-button--active")} onClick={() => openGroupEditor(group)}>
                    {editingGroupId === group.id ? "Editing group" : "Edit group"}
                  </button>
                </div>
              </div>

              {editingGroupId === group.id ? (
                <form className="panel group-editor" onSubmit={(event) => submitGroupDetails(event, group)}>
                  <label>
                    <span>Task group name</span>
                    <input
                      value={groupDraftValue.name}
                      onChange={(event) =>
                        setGroupEditDrafts((current) => ({
                          ...current,
                          [group.id]: { ...groupDraftValue, name: event.target.value },
                        }))
                      }
                    />
                  </label>
                  <label className="color-control color-control--create">
                    <span>Task group color</span>
                    <input
                      type="color"
                      value={groupDraftValue.color}
                      onChange={(event) =>
                        setGroupEditDrafts((current) => ({
                          ...current,
                          [group.id]: { ...groupDraftValue, color: event.target.value },
                        }))
                      }
                    />
                  </label>
                  <div className="group-editor__actions">
                    <button type="button" className="ghost-button" onClick={() => setEditingGroupId(null)}>
                      Cancel
                    </button>
                    <button type="submit">Save group</button>
                  </div>
                </form>
              ) : null}

              {isMobile ? (
                <div className="mobile-task-list">
                  {tasks.map((task) => (
                    <MobileTaskCard key={task.id} task={task} board={board} users={users} onUpdateTask={onUpdateTask} />
                  ))}
                  <form className="add-task-inline add-task-inline--mobile" onSubmit={(event) => submitQuickTask(event, group.id)}>
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
                </div>
              ) : (
                <div className="board-table-wrap">
                  <table className="board-table">
                    <colgroup>
                      <col className="col-task" style={{ width: `${columnWidths.task}px` }} />
                      <col className="col-priority" style={{ width: `${columnWidths.priority}px` }} />
                      <col className="col-status" style={{ width: `${columnWidths.status}px` }} />
                      <col className="col-date" style={{ width: `${columnWidths.due_date}px` }} />
                      <col className="col-owner" style={{ width: `${columnWidths.owner}px` }} />
                      <col className="col-notes" style={{ width: `${columnWidths.notes}px` }} />
                      {board.fields.map((field) => (
                        <col
                          key={`column-width-${field.id}`}
                          className={cls("col-custom", `col-custom--${field.type}`)}
                          style={{ width: `${columnWidths[columnKeyForField(field)]}px` }}
                        />
                      ))}
                    </colgroup>
                    <thead>
                      <tr>
                        <th>
                          <div className="th-inner">
                            <span>Task</span>
                            <button type="button" className="col-resizer" aria-label="Resize task column" onMouseDown={(event) => startColumnResize("task", 320, event)} />
                          </div>
                        </th>
                        <th>
                          <div className="th-inner">
                            <span>Priority</span>
                            <button type="button" className="col-resizer" aria-label="Resize priority column" onMouseDown={(event) => startColumnResize("priority", 140, event)} />
                          </div>
                        </th>
                        <th>
                          <div className="th-inner">
                            <span>Status</span>
                            <button type="button" className="col-resizer" aria-label="Resize status column" onMouseDown={(event) => startColumnResize("status", 140, event)} />
                          </div>
                        </th>
                        <th>
                          <div className="th-inner">
                            <span>Due</span>
                            <button type="button" className="col-resizer" aria-label="Resize due date column" onMouseDown={(event) => startColumnResize("due_date", 150, event)} />
                          </div>
                        </th>
                        <th>
                          <div className="th-inner">
                            <span>Owner</span>
                            <button type="button" className="col-resizer" aria-label="Resize owner column" onMouseDown={(event) => startColumnResize("owner", 170, event)} />
                          </div>
                        </th>
                        <th>
                          <div className="th-inner">
                            <span>Notes</span>
                            <button type="button" className="col-resizer" aria-label="Resize notes column" onMouseDown={(event) => startColumnResize("notes", 220, event)} />
                          </div>
                        </th>
                        {board.fields.map((field) => (
                          <th key={`column-head-${field.id}`}>
                            <div className="th-inner">
                              <span>{field.name}</span>
                              <button
                                type="button"
                                className="col-resizer"
                                aria-label={`Resize ${field.name} column`}
                                onMouseDown={(event) =>
                                  startColumnResize(columnKeyForField(field), field.type === "number" ? 120 : field.type === "date" ? 150 : 160, event)
                                }
                              />
                            </div>
                          </th>
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
              )}
            </section>
          );
        })}
      </div>

      <form className="panel inline-form inline-form--group" onSubmit={submitGroup}>
        <label>
          <span>New task group</span>
          <input placeholder="This week" value={groupDraft.name} onChange={(event) => setGroupDraft((current) => ({ ...current, name: event.target.value }))} />
        </label>
        <label className="color-control color-control--create">
          <span>Color</span>
          <input type="color" value={groupDraft.color} onChange={(event) => setGroupDraft((current) => ({ ...current, color: event.target.value }))} />
        </label>
        <button type="submit">+ Add Task Group</button>
      </form>
    </div>
  );
}

function AdminView({ data, currentUser, onCreateUser, onUpdateUser, onDeleteUser, onImpersonateUser, busy }) {
  const [drafts, setDrafts] = useState({});
  const [newUserForm, setNewUserForm] = useState(blankUser());

  useEffect(() => {
    setDrafts(
      Object.fromEntries(
        data.users.map((user) => [
          user.id,
          {
            name: user.name || "",
            username: user.username || "",
            title: user.title || "",
            role: user.role || "Staff",
            department: user.department || "General",
            password: "",
            active: user.active !== false,
            quick_login: user.quick_login === true,
          },
        ])
      )
    );
  }, [data.users]);

  function setDraft(userId, patch) {
    setDrafts((current) => ({
      ...current,
      [userId]: {
        ...(current[userId] || {}),
        ...patch,
      },
    }));
  }

  async function submitNewUser(event) {
    event.preventDefault();
    const name = newUserForm.name.trim();
    const username = newUserForm.username.trim();
    const password = newUserForm.password.trim();
    if (!name || !username || !password) return;
    const created = await onCreateUser({
      ...newUserForm,
      name,
      username,
      password,
      store_id: null,
    });
    if (created) setNewUserForm(blankUser());
  }

  async function saveUser(user) {
    const draft = drafts[user.id];
    if (!draft) return;
    const changes = {};

    ["name", "username", "title", "role", "department"].forEach((field) => {
      if (String(draft[field] || "") !== String(user[field] || "")) changes[field] = draft[field];
    });

    if (draft.active !== (user.active !== false)) changes.active = draft.active;
    if (draft.quick_login !== (user.quick_login === true)) changes.quick_login = draft.quick_login;
    if (draft.password.trim()) changes.password = draft.password.trim();

    if (!Object.keys(changes).length) return;

    const updated = await onUpdateUser(user.id, changes);
    if (updated) setDraft(user.id, { password: "" });
  }

  return (
    <div className="settings-view">
      <section className="panel help-panel">
        <div className="panel__head">
          <div>
            <span className="eyebrow">Admin</span>
            <h3>User management</h3>
          </div>
        </div>
        <div className="manifest-copy">
          <p>Add people, update usernames and passwords, disable logins, and preview exactly what a user sees without leaving the workspace.</p>
          <p>Preview mode changes only your session. The user account itself is not altered when you switch into it.</p>
        </div>
      </section>

      <div className="dashboard-grid dashboard-grid--admin">
        <form className="panel" onSubmit={submitNewUser}>
          <div className="panel__head">
            <div>
              <span className="eyebrow">Add user</span>
              <h3>New login</h3>
            </div>
          </div>

          <div className="form-grid">
            <label>
              <span>Name</span>
              <input value={newUserForm.name} onChange={(event) => setNewUserForm((current) => ({ ...current, name: event.target.value }))} />
            </label>
            <label>
              <span>Username</span>
              <input value={newUserForm.username} onChange={(event) => setNewUserForm((current) => ({ ...current, username: event.target.value }))} />
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
            <label>
              <span>Password</span>
              <input type="text" placeholder="Set a unique password" value={newUserForm.password} onChange={(event) => setNewUserForm((current) => ({ ...current, password: event.target.value }))} />
            </label>
            <label className="checkbox-row full-span">
              <input
                type="checkbox"
                checked={newUserForm.quick_login}
                onChange={(event) => setNewUserForm((current) => ({ ...current, quick_login: event.target.checked }))}
              />
              <div>
                <strong>Show on quick login bar</strong>
                <small>Lets this user appear on the login page so they can tap their username.</small>
              </div>
            </label>
          </div>

          <button type="submit" disabled={busy === "create-user"}>
            {busy === "create-user" ? "Adding..." : "Add User"}
          </button>
        </form>

        <section className="panel">
          <div className="panel__head">
            <div>
              <span className="eyebrow">Workspace roster</span>
              <h3>Edit users</h3>
            </div>
          </div>

          <div className="roster-list roster-list--editor">
            {data.users.map((user) => {
              const draft = drafts[user.id] || {};
              return (
                <div key={user.id} className="roster-editor">
                  <div className="roster-editor__head">
                    <div className="roster-card__left">
                      <span className="avatar">{user.avatar || initials(user.name)}</span>
                      <div>
                        <strong>{user.name}</strong>
                        <small>
                          @{user.username || "user"} - {user.title || "No title"} - {user.department}
                        </small>
                      </div>
                    </div>

                    <div className="roster-card__right">
                      <span className={cls("pill", `pill--${tone(user.role)}`)}>{user.role}</span>
                      {user.quick_login ? <span className="pill pill--all">Quick login</span> : null}
                      {Number(user.id) === Number(currentUser.id) ? <span className="pill pill--current">Current</span> : null}
                    </div>
                  </div>

                  <div className="form-grid">
                    <label>
                      <span>Name</span>
                      <input value={draft.name || ""} onChange={(event) => setDraft(user.id, { name: event.target.value })} />
                    </label>
                    <label>
                      <span>Username</span>
                      <input value={draft.username || ""} onChange={(event) => setDraft(user.id, { username: event.target.value })} />
                    </label>
                    <label>
                      <span>Title</span>
                      <input value={draft.title || ""} onChange={(event) => setDraft(user.id, { title: event.target.value })} />
                    </label>
                    <label>
                      <span>Role</span>
                      <select value={draft.role || "Staff"} onChange={(event) => setDraft(user.id, { role: event.target.value })}>
                        {ROLE_OPTIONS.map((role) => (
                          <option key={role} value={role}>
                            {role}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span>Department</span>
                      <select value={draft.department || "General"} onChange={(event) => setDraft(user.id, { department: event.target.value })}>
                        {DEPARTMENT_OPTIONS.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span>Login access</span>
                      <select value={draft.active ? "active" : "inactive"} onChange={(event) => setDraft(user.id, { active: event.target.value === "active" })}>
                        <option value="active">Active</option>
                        <option value="inactive">Inactive</option>
                      </select>
                    </label>
                    <label className="checkbox-row full-span">
                      <input type="checkbox" checked={draft.quick_login === true} onChange={(event) => setDraft(user.id, { quick_login: event.target.checked })} />
                      <div>
                        <strong>Show on quick login bar</strong>
                        <small>Displays this user on the login page so they can tap their username.</small>
                      </div>
                    </label>
                    <label className="full-span">
                      <span>New password</span>
                      <input
                        type="text"
                        placeholder="Leave blank to keep current password"
                        value={draft.password || ""}
                        onChange={(event) => setDraft(user.id, { password: event.target.value })}
                      />
                    </label>
                  </div>

                  <div className="roster-actions">
                    <button type="button" className="ghost-button" onClick={() => onImpersonateUser(user.id)} disabled={Number(user.id) === Number(currentUser.id)}>
                      View as user
                    </button>
                    <button type="button" className="ghost-button" onClick={() => saveUser(user)} disabled={busy === `save-user-${user.id}`}>
                      {busy === `save-user-${user.id}` ? "Saving..." : "Save changes"}
                    </button>
                    <button
                      type="button"
                      className="ghost-button ghost-button--danger"
                      onClick={() => onDeleteUser(user.id)}
                      disabled={Number(user.id) === Number(currentUser.id) || busy === `delete-user-${user.id}`}
                    >
                      {busy === `delete-user-${user.id}` ? "Removing..." : "Remove"}
                    </button>
                  </div>
                </div>
              );
            })}
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
  const [theme, setTheme] = useState(() => loadTheme());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [selectedBoardId, setSelectedBoardId] = useState(null);
  const [page, setPage] = useState("dashboard");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginUsername, setLoginUsername] = useState("");
  const [showProjectForm, setShowProjectForm] = useState(false);
  const [projectForm, setProjectForm] = useState(blankProject(null));
  const [showTutorial, setShowTutorial] = useState(false);
  const [showInstall, setShowInstall] = useState(false);
  const isMobile = useMediaQuery(MOBILE_LAYOUT_QUERY);
  const install = useInstallState();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  async function load() {
    setLoading(true);
    setError("");
    let lastError = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const next = await getBootstrap();
        setData(next);
        setLoading(false);
        return;
      } catch (loadError) {
        lastError = loadError;
        if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 1200));
      }
    }
    try {
      throw lastError || new Error("Unable to load workspace");
    } catch (loadError) {
      setError(loadError.message || "Unable to load workspace");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    saveTheme(theme);
    const themeMeta = document.querySelector('meta[name="theme-color"]');
    if (themeMeta) themeMeta.setAttribute("content", theme === "dark" ? "#0d1422" : "#3156f5");
  }, [theme]);

  useEffect(() => {
    if (install.isStandalone) setShowInstall(false);
  }, [install.isStandalone]);

  const currentUser = useMemo(
    () => data.users.find((user) => Number(user.id) === Number(session?.user_id)) || null,
    [data.users, session?.user_id]
  );

  const adminSourceUser = useMemo(
    () => data.users.find((user) => Number(user.id) === Number(session?.admin_user_id)) || null,
    [data.users, session?.admin_user_id]
  );

  const visibleBoards = useMemo(() => relevantBoards(data.boards, currentUser), [data.boards, currentUser]);
  const activeBoard = useMemo(
    () => visibleBoards.find((board) => Number(board.id) === Number(selectedBoardId)) || visibleBoards[0] || null,
    [visibleBoards, selectedBoardId]
  );
  const quickLoginUsers = useMemo(
    () => data.users.filter((user) => user.active !== false && user.quick_login === true && user.username),
    [data.users]
  );

  const isPreviewing = Boolean(adminSourceUser && Number(adminSourceUser.id) !== Number(currentUser?.id));
  const isAdmin = currentUser?.role === "Admin";

  useEffect(() => {
    if (!currentUser && session) {
      clearSession();
      setSession(null);
    }
  }, [currentUser?.id, session]);

  useEffect(() => {
    if (session?.admin_user_id && !adminSourceUser) {
      const nextSession = { user_id: session.user_id };
      saveSession(nextSession);
      setSession(nextSession);
    }
  }, [adminSourceUser?.id, session]);

  useEffect(() => {
    if (!activeBoard && visibleBoards.length) setSelectedBoardId(visibleBoards[0].id);
  }, [visibleBoards.length, activeBoard?.id]);

  useEffect(() => {
    if (currentUser) setProjectForm(blankProject(currentUser));
  }, [currentUser?.id]);

  useEffect(() => {
    if (!isAdmin && page === "admin") setPage("dashboard");
  }, [isAdmin, page]);

  useEffect(() => {
    setSidebarOpen(!isMobile);
  }, [isMobile]);

  async function handleLogin(event) {
    event.preventDefault();
    setBusy("login");
    setError("");
    try {
      const response = await login({ username: loginUsername.trim(), password: loginPassword });
      const nextSession = { user_id: response.user.id };
      saveSession(nextSession);
      setSession(nextSession);
      setPage("dashboard");
      setLoginPassword("");
      setLoginUsername("");
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
    setLoginUsername("");
    setSidebarOpen(false);
  }

  function toggleTheme() {
    setTheme((current) => (current === "dark" ? "light" : "dark"));
  }

  function handleLoginUsernameChange(value) {
    setLoginUsername(value);
    if (error) setError("");
  }

  function handleLoginPasswordChange(value) {
    setLoginPassword(value);
    if (error) setError("");
  }

  function handleQuickLoginSelect(nextUsername) {
    setLoginUsername(nextUsername);
    if (error) setError("");
  }

  async function handlePromptInstall() {
    setBusy("install");
    try {
      const accepted = await install.promptInstall();
      if (accepted) setShowInstall(false);
    } finally {
      setBusy("");
    }
  }

  function beginPreview(userId) {
    if (!currentUser || currentUser.role !== "Admin") return;
    const nextSession = { user_id: Number(userId), admin_user_id: Number(currentUser.id) };
    saveSession(nextSession);
    setSession(nextSession);
    setPage("dashboard");
  }

  function endPreview() {
    if (!adminSourceUser) return;
    const nextSession = { user_id: adminSourceUser.id };
    saveSession(nextSession);
    setSession(nextSession);
    setPage("admin");
  }

  function navigateTo(nextPage, boardId = null) {
    if (boardId !== null) setSelectedBoardId(boardId);
    setPage(nextPage);
    if (isMobile) setSidebarOpen(false);
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

  async function handleUpdateBoard(changes) {
    if (!activeBoard) return;
    setBusy("save-board");
    setError("");
    try {
      const updated = await updateBoard(activeBoard.id, changes);
      mutateBoard(activeBoard.id, (board) => ({ ...board, ...updated }));
    } catch (submitError) {
      setError(submitError.message || "Unable to update project");
    } finally {
      setBusy("");
    }
  }

  async function handleCreateGroup(name, color) {
    if (!activeBoard) return;
    setBusy("create-group");
    setError("");
    try {
      const group = await createGroup({ board_id: activeBoard.id, name, color });
      mutateBoard(activeBoard.id, (board) => ({ ...board, groups: [...board.groups, group] }));
    } catch (submitError) {
      setError(submitError.message || "Unable to create task group");
    } finally {
      setBusy("");
    }
  }

  async function handleUpdateGroup(groupId, changes) {
    if (!activeBoard) return;
    setBusy(`save-group-${groupId}`);
    setError("");
    try {
      const updated = await updateGroup(activeBoard.id, groupId, changes);
      mutateBoard(activeBoard.id, (board) => ({
        ...board,
        groups: board.groups.map((group) => (Number(group.id) === Number(groupId) ? { ...group, ...updated } : group)),
      }));
    } catch (submitError) {
      setError(submitError.message || "Unable to update task group");
    } finally {
      setBusy("");
    }
  }

  async function handleCreateField(draft) {
    if (!activeBoard) return;
    setBusy("create-column");
    setError("");
    try {
      const field = await createBoardField(activeBoard.id, draft);
      mutateBoard(activeBoard.id, (board) => ({ ...board, fields: [...board.fields, field] }));
    } catch (submitError) {
      setError(submitError.message || "Unable to create column");
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
        status: "Pending",
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
        screenshots: [],
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

  async function handleCreateUser(payload) {
    setBusy("create-user");
    setError("");
    try {
      const user = await createUser(payload);
      setData((current) => ({ ...current, users: [...current.users, user] }));
      return true;
    } catch (submitError) {
      setError(submitError.message || "Unable to create user");
      return false;
    } finally {
      setBusy("");
    }
  }

  async function handleSaveUser(userId, changes) {
    setBusy(`save-user-${userId}`);
    setError("");
    try {
      const user = await updateUser(userId, changes);
      setData((current) => ({
        ...current,
        users: current.users.map((entry) => (Number(entry.id) === Number(userId) ? { ...entry, ...user } : entry)),
      }));
      return true;
    } catch (submitError) {
      setError(submitError.message || "Unable to update user");
      return false;
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
      if (Number(currentUser?.id) === Number(userId) || Number(adminSourceUser?.id) === Number(userId)) handleLogout();
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
      <>
        <LoginScreen
          username={loginUsername}
          onUsernameChange={handleLoginUsernameChange}
          password={loginPassword}
          onPasswordChange={handleLoginPasswordChange}
          onSubmit={handleLogin}
          error={error}
          busy={busy === "login"}
          theme={theme}
          onToggleTheme={toggleTheme}
          onOpenTutorial={() => setShowTutorial(true)}
          onOpenInstall={() => setShowInstall(true)}
          installAvailable={install.canInstall}
          quickLoginUsers={quickLoginUsers}
          onQuickLoginSelect={handleQuickLoginSelect}
        />
        {showTutorial ? <TutorialOverlay onClose={() => setShowTutorial(false)} /> : null}
        {showInstall ? (
          <InstallOverlay
            onClose={() => setShowInstall(false)}
            isIOS={install.isIOS}
            canPromptInstall={install.canPromptInstall}
            onPromptInstall={handlePromptInstall}
            installBusy={busy === "install"}
          />
        ) : null}
      </>
    );
  }

  const pageTitle = page === "dashboard" ? "Dashboard" : page === "project" ? activeBoard?.name || "Projects" : "Admin";
  const pageCopy =
    page === "dashboard"
      ? "Projects, priorities, due dates, and notes in one place."
      : page === "project"
        ? "Edit the board directly, color the task groups, and let the status bars do the scanning for you."
        : "Manage users, usernames, passwords, access, and preview mode.";

  return (
    <div className={cls("workspace-shell", isMobile && "workspace-shell--mobile")}>
      {isMobile && sidebarOpen ? <button type="button" className="sidebar-backdrop" aria-label="Close menu" onClick={() => setSidebarOpen(false)} /> : null}

      <aside className={cls("sidebar", isMobile && "sidebar--mobile", sidebarOpen && "is-open")}>
        <div className="sidebar__brand">
          <img className="brand-mark" src={LOGO_SRC} alt="Organization Tool logo" />
          <div>
            <span className="eyebrow">Organization Tool</span>
            <h1>Dealer workflow</h1>
          </div>
          {isMobile ? (
            <button type="button" className="ghost-button sidebar-close" onClick={() => setSidebarOpen(false)}>
              Close
            </button>
          ) : null}
        </div>

        <div className="current-user">
          <span className="avatar">{currentUser.avatar || initials(currentUser.name)}</span>
          <div>
            <strong>{currentUser.name}</strong>
            <small>
              @{currentUser.username || "user"} - {currentUser.title || currentUser.department}
            </small>
          </div>
        </div>

        <nav className="main-nav">
          <button type="button" className={page === "dashboard" ? "is-active" : ""} onClick={() => navigateTo("dashboard")}>
            Dashboard
          </button>
          <button type="button" className={page === "project" ? "is-active" : ""} onClick={() => navigateTo("project")}>
            Projects
          </button>
          {isAdmin ? (
            <button type="button" className={page === "admin" ? "is-active" : ""} onClick={() => navigateTo("admin")}>
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
                onClick={() => navigateTo("project", board.id)}
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
              <input value={projectForm.description} onChange={(event) => setProjectForm((current) => ({ ...current, description: event.target.value }))} />
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
            <label className="color-control color-control--create">
              <span>Color</span>
              <input type="color" value={projectForm.color} onChange={(event) => setProjectForm((current) => ({ ...current, color: event.target.value }))} />
            </label>
            <button type="submit" disabled={busy === "create-project"}>
              {busy === "create-project" ? "Creating..." : "Create Project"}
            </button>
          </form>
        ) : null}

        <div className="sidebar-footer">
          <button type="button" className="ghost-button ghost-button--wide" onClick={() => setShowTutorial(true)}>
            Tutorial
          </button>
          <button type="button" className="logout-button" onClick={handleLogout}>
            Log Out
          </button>
        </div>
      </aside>

      <main className="main-panel">
        <header className="topbar">
          <div className="topbar__main">
            {isMobile ? (
              <button type="button" className="menu-button" onClick={() => setSidebarOpen(true)}>
                Menu
              </button>
            ) : null}
            <div>
              <span className="eyebrow">Workspace</span>
              <h2>{pageTitle}</h2>
              <p>{pageCopy}</p>
            </div>
          </div>

          <div className="topbar__meta">
            {isPreviewing ? (
              <button type="button" className="ghost-button" onClick={endPreview}>
                Return to Admin
              </button>
            ) : null}
            <ThemeToggle theme={theme} onToggle={toggleTheme} compact />
            <span className={cls("pill", `pill--${tone(currentUser.department)}`)}>{currentUser.department}</span>
          </div>
        </header>

        {isPreviewing ? (
          <section className="panel preview-banner">
            <div>
              <span className="eyebrow">Preview mode</span>
              <h3>{currentUser.name}&apos;s view</h3>
            </div>
            <p>You are viewing the workspace as this user. Use Return to Admin when you want your admin tools back.</p>
          </section>
        ) : null}

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

        {page === "project" ? (
          <ProjectBoard
            board={activeBoard}
            currentUser={currentUser}
            users={data.users.filter((user) => user.active !== false)}
            onUpdateTask={handleUpdateTask}
            onCreateTask={handleCreateTask}
            onCreateGroup={handleCreateGroup}
            onUpdateGroup={handleUpdateGroup}
            onCreateField={handleCreateField}
            onUpdateBoard={handleUpdateBoard}
            isMobile={isMobile}
          />
        ) : null}

        {page === "admin" && isAdmin ? (
          <AdminView
            data={data}
            currentUser={currentUser}
            onCreateUser={handleCreateUser}
            onUpdateUser={handleSaveUser}
            onDeleteUser={handleDeleteUser}
            onImpersonateUser={beginPreview}
            busy={busy}
          />
        ) : null}

        {showTutorial ? <TutorialOverlay onClose={() => setShowTutorial(false)} /> : null}
        {showInstall ? (
          <InstallOverlay
            onClose={() => setShowInstall(false)}
            isIOS={install.isIOS}
            canPromptInstall={install.canPromptInstall}
            onPromptInstall={handlePromptInstall}
            installBusy={busy === "install"}
          />
        ) : null}
      </main>
    </div>
  );
}
