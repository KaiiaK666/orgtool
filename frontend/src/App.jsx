import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  createBillingCheckout,
  createBillingPortal,
  createBoard,
  createBoardField,
  createGroup,
  createTask,
  createUser,
  deleteBoard,
  deleteGroup,
  deleteTask,
  deleteUser,
  getBootstrap,
  login,
  planCopilot,
  undoActivity,
  updateBoard,
  updateGroup,
  updateTask,
  updateUser,
} from "./api.js";
import {
  buildContextualCopilotPlan,
  buildCopilotConversationContext,
  isApprovalOnlyMessage,
  isCancelOnlyMessage,
  isComplexCopilotTurn,
  rememberExecutedOperations,
} from "./copilotContext.js";
import { buildDictationPlan, shouldPreferDictationPlan } from "./dictationPlan.js";

const SESSION_KEY = "orgtool-session";
const THEME_KEY = "orgtool-theme";
const COLUMN_WIDTHS_KEY_PREFIX = "orgtool-column-widths";
const GROUP_PREFS_KEY_PREFIX = "orgtool-group-prefs";
const LOGO_SRC = "/organization-tool-mark.png";
const MOBILE_LAYOUT_QUERY = "(max-width: 900px)";
const DEFAULT_LOGIN_USERNAME = "kaiammons";
const SHOPPING_LIST_GROUP_NAME = "Shopping List";
const SHOPPING_LIST_COLOR = "#16a34a";
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
const GROUP_MODE_OPTIONS = [
  { value: "auto", label: "Auto", hint: "Keeps the group simple based on its name and tasks." },
  { value: "checklist", label: "Checklist", hint: "Best for shopping lists and quick personal lists." },
  { value: "project", label: "Project", hint: "Shows owner, due date, priority, notes, and custom columns." },
  { value: "notes", label: "Notes", hint: "Keeps notes visible without making every row feel heavy." },
  { value: "follow-up", label: "Follow-up", hint: "Good for calls, meetings, and date-driven reminders." },
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

function PencilIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false">
      <path
        d="M11.6 1.4a1.5 1.5 0 0 1 2.1 0l.9.9a1.5 1.5 0 0 1 0 2.1L5.5 13.5 2 14l.5-3.5 9.1-9.1Zm1.4 1.3a.5.5 0 0 0-.7 0l-.8.8 1.4 1.4.8-.8a.5.5 0 0 0 0-.7l-.7-.7ZM11.2 5 3.4 12.8l-.2 1.1 1.1-.2L12 5.9 11.2 5Z"
        fill="currentColor"
      />
    </svg>
  );
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

function formatActivityTime(value) {
  if (!value) return "Just now";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Recent";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(parsed);
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

function inferredGroupMode(group) {
  const name = normalizePhrase(group?.name || "");
  if (/\b(shopping|grocery|groceries|checklist|list|errands|heb|walmart|costco)\b/.test(name)) return "checklist";
  if (/\b(notes?|ideas?|scratch|parking lot)\b/.test(name)) return "notes";
  if (/\b(follow up|callback|call backs?|appointments?|meeting|today|tomorrow)\b/.test(name)) return "follow-up";
  return "project";
}

function groupDisplayMode(group, prefs = {}) {
  const saved = prefs?.[group?.id]?.mode || group?.mode || group?.type || "auto";
  if (saved && saved !== "auto" && GROUP_MODE_OPTIONS.some((option) => option.value === saved)) return saved;
  return inferredGroupMode(group);
}

function groupModeLabel(mode) {
  return GROUP_MODE_OPTIONS.find((option) => option.value === mode)?.label || "Project";
}

function normalizePhrase(value = "") {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizeCopilotInput(value = "") {
  let text = String(value || "").replace(/\s+/g, " ").trim();
  const replacements = [
    [/\b(?:hey|yo|okay|ok|alright|so|um|uh|please)\s+(?:copilot|assistant|brain)?\b/gi, " "],
    [/\b(?:could you|can you|would you|i want you to|i need you to)\b/gi, " "],
    [/\b(?:gotta|gonna)\b/gi, "need to"],
    [/\b(?:knocked out|knock out|wrapped up|wrap up|took care of|handled|handle|did|done with)\b/gi, "complete"],
    [/\b(?:checked it off|check it off|crossed it off|cross it off)\b/gi, "complete"],
    [/\b(?:scratch|scratch off|take off|take out)\b/gi, "remove"],
    [/\b(?:delte|delet|dlete|remeove|remvoe|rmove)\b/gi, "delete"],
    [/\b(?:complet|compleet|finsh|finshed)\b/gi, "complete"],
    [/\b(?:pendng|pendin)\b/gi, "pending"],
    [/\b(?:over due|pastdue)\b/gi, "overdue"],
    [/\b(?:asap|right away|urgent|important|hot)\b/gi, "high priority"],
    [/\b(?:not urgent|low key|whenever)\b/gi, "low priority"],
    [/\b(?:push|bump|slide|scoot)\b/gi, "move"],
    [/\b(?:shopping items|grocery items|groceries)\b/gi, "shopping list"],
  ];
  replacements.forEach(([pattern, replacement]) => {
    text = text.replace(pattern, replacement);
  });
  return text.replace(/\s+/g, " ").trim();
}

const MATCH_STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "as",
  "all",
  "complete",
  "completed",
  "create",
  "date",
  "done",
  "due",
  "for",
  "group",
  "high",
  "in",
  "it",
  "list",
  "low",
  "make",
  "mark",
  "medium",
  "new",
  "on",
  "open",
  "pending",
  "priority",
  "set",
  "status",
  "task",
  "the",
  "to",
  "tomorrow",
  "with",
]);

function sentenceCase(value = "") {
  const text = String(value || "").trim();
  if (!text) return "";
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function escapeRegExp(value = "") {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function spokenJoin(parts) {
  const items = parts.filter(Boolean);
  if (!items.length) return "";
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

function statusFromWord(word = "") {
  const value = normalizePhrase(word);
  if (["done", "complete", "completed", "finish", "finished", "handled", "did", "wrapped up", "knocked out", "check", "checked", "checked off", "check off", "cross off", "bought", "got", "grabbed", "purchased"].includes(value)) return "Done";
  if (["pending", "open", "todo", "to do", "not done", "not started", "still need", "needs work"].includes(value)) return "Pending";
  if (["overdue", "late", "past due", "behind"].includes(value)) return "Overdue";
  return null;
}

function extractStatusMentions(text = "") {
  return Array.from(String(text || "").matchAll(/\b(done|complete|completed|finish|finished|handled|did|wrapped\s+up|knocked\s+out|check(?:ed)?\s+off|cross\s+off|bought|got|grabbed|purchased|pending|open|to\s+do|todo|not\s+done|not\s+started|still\s+need|needs\s+work|overdue|late|past\s+due|behind)\b/gi))
    .map((match) => statusFromWord(match[1]))
    .filter(Boolean);
}

function toIsoDate(value) {
  const next = new Date(value);
  if (Number.isNaN(next.getTime())) return null;
  next.setHours(0, 0, 0, 0);
  return next.toISOString().slice(0, 10);
}

function addDays(baseDate, amount) {
  const next = new Date(baseDate);
  next.setDate(next.getDate() + amount);
  return next;
}

function parseNaturalDate(value = "") {
  const text = String(value || "").trim().toLowerCase().replace(/[.,]+$/g, "");
  if (!text) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (text === "today") return toIsoDate(today);
  if (text === "tonight") return toIsoDate(today);
  if (text === "tomorrow") return toIsoDate(addDays(today, 1));
  if (text === "this week") return toIsoDate(addDays(today, 3));
  if (text === "next week") return toIsoDate(addDays(today, 7));
  if (["eod", "end of day", "by end of day"].includes(text)) return toIsoDate(today);
  if (["end of week", "by end of week"].includes(text)) return toIsoDate(addDays(today, Math.max(0, 5 - today.getDay())));
  const inDaysMatch = text.match(/^in\s+(\d{1,2})\s+days?$/i);
  if (inDaysMatch) return toIsoDate(addDays(today, Number(inDaysMatch[1])));

  const weekdayMatch = text.match(/^(?:next\s+|this\s+)?(monday|tuesday|wednesday|thursday|friday|saturday|sunday)$/i);
  if (weekdayMatch) {
    const weekdays = {
      sunday: 0,
      monday: 1,
      tuesday: 2,
      wednesday: 3,
      thursday: 4,
      friday: 5,
      saturday: 6,
    };
    const targetDay = weekdays[weekdayMatch[1].toLowerCase()];
    const delta = (7 - today.getDay() + targetDay) % 7 || 7;
    return toIsoDate(addDays(today, delta));
  }

  const slashMatch = text.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);
  if (slashMatch) {
    const [, monthText, dayText, yearText] = slashMatch;
    const month = Number(monthText) - 1;
    const day = Number(dayText);
    const year = yearText ? Number(yearText.length === 2 ? `20${yearText}` : yearText) : today.getFullYear();
    return toIsoDate(new Date(year, month, day));
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;

  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : toIsoDate(parsed);
}

function findNamedMatch(items, text, field = "name") {
  const haystack = normalizePhrase(text);
  if (!haystack) return null;

  let best = null;
  let bestScore = 0;

  for (const item of items || []) {
    const name = normalizePhrase(item?.[field] || "");
    if (!name) continue;

    let score = 0;
    if (haystack === name) {
      score = 1000 + name.length;
    } else if (haystack.includes(name)) {
      score = 600 + name.length;
    } else {
      const haystackTokens = new Set(haystack.split(" ").filter((token) => token && !MATCH_STOPWORDS.has(token)));
      const tokens = name.split(" ").filter((token) => token && !MATCH_STOPWORDS.has(token));
      const matched = tokens.filter((token) => haystackTokens.has(token)).length;
      const required = tokens.length <= 1 ? 1 : Math.max(2, Math.ceil(tokens.length / 2));
      if (matched && matched >= required) score = matched * 20 + name.length;
    }

    if (score > bestScore) {
      best = item;
      bestScore = score;
    }
  }

  return best;
}

function findGroupMention(board, text, fallbackGroup = null) {
  const direct = findNamedMatch(board?.groups || [], text, "name");
  if (direct) return direct;
  const normalized = normalizePhrase(text);
  if (/\b(shopping|grocery|groceries|store|heb|walmart|costco)\b/i.test(normalized)) {
    const shoppingGroup = (board?.groups || []).find((entry) => normalizePhrase(entry.name) === normalizePhrase(SHOPPING_LIST_GROUP_NAME));
    if (shoppingGroup) return shoppingGroup;
  }
  if (/\b(the list|my list|list)\b/i.test(text)) {
    const shoppingGroup = (board?.groups || []).find((entry) => normalizePhrase(entry.name) === normalizePhrase(SHOPPING_LIST_GROUP_NAME));
    if (shoppingGroup) return shoppingGroup;
  }
  if (fallbackGroup && /\b(this group|that group|same group|new one|that one)\b/i.test(text)) return fallbackGroup;
  return fallbackGroup;
}

function cleanReferenceText(value = "") {
  return String(value || "")
    .replace(/\b(?:the|a|an|my|this|that|task|item|thing|one)\b/gi, " ")
    .replace(/\b(?:as|to|into|with|priority|status|done|complete|completed|pending|open|overdue|critical|high|medium|low)\b.*$/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractTaskReference(text = "") {
  const patterns = [
    /\b(?:mark|set|change|make)\s+(.+?)\s+(?:as|to|into)?\s*(?:done|complete|completed|pending|open|overdue|late|critical|high|medium|low|priority)\b/i,
    /\b(?:complete|finish|finished|got|bought|grabbed|purchased|check(?:ed)?\s+off|cross(?:ed)?\s+off)\s+(?:the\s+)?(.+)$/i,
    /\b(?:delete|remove|clear|erase|trash)\s+(?:the\s+)?(.+?)(?:\s+(?:off|out of|from)\s+(?:the\s+)?(?:list|group))?$/i,
    /\b(?:move|reschedule)\s+(?:the\s+)?(.+?)\s+(?:to|for|on|by)\s+.+$/i,
    /\b(?:assign|give)\s+(?:the\s+)?(.+?)\s+(?:to|for)\s+.+$/i,
    /\b(?:add|append|update)\s+(?:a\s+)?note\s+(?:to|for|on)\s+(.+?)\s*(?:that says|saying|:|-)\s+.+$/i,
    /\b(?:rename)\s+(?:the\s+)?(.+?)\s+to\s+.+$/i,
  ];
  for (const pattern of patterns) {
    const match = String(text || "").match(pattern);
    if (!match) continue;
    const candidate = cleanReferenceText(match[1]);
    if (candidate && !/\b(all|every|everything|whole|entire|tasks?|items?|stuff)\b/i.test(candidate)) return candidate;
  }
  return "";
}

function findTaskMention(board, text) {
  const reference = extractTaskReference(text);
  return (reference ? findNamedMatch(board?.tasks || [], reference, "name") : null) || findNamedMatch(board?.tasks || [], text, "name");
}

function findBoardMention(boards, text, fallbackBoard = null) {
  const direct = findNamedMatch(boards || [], text, "name");
  if (direct) return direct;
  if (fallbackBoard && /\b(this project|this board|current project|current board|this workspace|here)\b/i.test(text)) return fallbackBoard;
  return fallbackBoard;
}

function findUserMention(users, text) {
  const byName = findNamedMatch(users || [], text, "name");
  if (byName) return byName;
  return findNamedMatch(users || [], text, "username");
}

function hasDeleteIntent(text = "") {
  const normalized = normalizePhrase(text);
  return (
    /\b(?:delete|remove|clear|trash|erase|wipe|nuke|drop)\b/i.test(text) ||
    /\b(?:delte|delet|dlete|remeove|remvoe|rmove|whipe)\b/.test(normalized)
  );
}

function hasGroupIntent(text = "") {
  return /\b(?:task\s+groups?|groups?|lanes?|sections?)\b/i.test(text);
}

function hasProjectIntent(text = "") {
  return /\b(?:projects?|boards?|workspace)\b/i.test(text);
}

function hasColumnIntent(text = "") {
  return /\b(?:columns?|fields?)\b/i.test(text);
}

function hasCreateIntent(text = "") {
  return /\b(?:create|add|new|make|start|set up|need|should|have to|remember|remind|put)\b/i.test(text);
}

function priorityFromWord(word = "") {
  const value = String(word || "").toLowerCase();
  if (["critical", "emergency", "fire drill", "top priority", "highest priority"].includes(value)) return "Critical";
  if (["urgent", "asap", "right away", "important", "hot"].includes(value)) return "High";
  if (["normal", "regular"].includes(value)) return "Medium";
  if (["not urgent", "low key", "whenever", "back burner"].includes(value)) return "Low";
  if (["critical", "high", "medium", "low"].includes(value)) return sentenceCase(value);
  return null;
}

function extractPriorityMentions(text = "") {
  return Array.from(String(text || "").matchAll(/\b(critical|emergency|fire drill|top priority|highest priority|high|urgent|asap|right away|important|hot|medium|normal|regular|low|not urgent|low key|whenever|back burner)\b/gi))
    .map((match) => priorityFromWord(match[1]))
    .filter(Boolean);
}

function fieldTypeFromWord(word = "") {
  const value = String(word || "").toLowerCase();
  if (["open", "text", "date", "number", "tag"].includes(value)) return value === "open" ? "text" : value;
  return null;
}

function cleanShoppingItem(value = "") {
  return sentenceCase(
    String(value || "")
      .replace(/\b(?:please|could|can|you|create|make|add|put|include|need|needs|buy|get|grab|pick|up|shopping|grocery|list|items?|tasks?|called|named|with|for|to|my|a|an|the)\b/gi, " ")
      .replace(/\s+/g, " ")
      .trim()
  );
}

const COMMON_SINGLE_WORD_ITEMS = new Set([
  "milk",
  "eggs",
  "bread",
  "bananas",
  "apples",
  "water",
  "cheese",
  "butter",
  "rice",
  "beans",
  "coffee",
  "cream",
  "sugar",
  "lettuce",
  "tomatoes",
  "onions",
  "chicken",
  "beef",
  "paper",
  "towels",
  "soap",
]);

function splitShoppingItems(value = "") {
  const text = String(value || "")
    .replace(/[.?!]+$/g, "")
    .replace(/\b(?:with|for|including|include|of|that has|to have|containing)\b\s*/i, "")
    .trim();

  const items = text
    .split(/\s*(?:,|;|\n|\band\b|\bplus\b)\s*/i)
    .map(cleanShoppingItem)
    .filter((item) => item.length > 1 && !["Shopping", "List", "Grocery"].includes(item));
  if (items.length === 1) {
    const tokens = normalizePhrase(items[0]).split(" ");
    if (tokens.length >= 2 && tokens.length <= 8 && tokens.every((token) => COMMON_SINGLE_WORD_ITEMS.has(token))) {
      return tokens.map(sentenceCase);
    }
  }
  return items;
}

function extractShoppingItems(input = "") {
  const text = String(input || "").trim();
  const addToListMatch = text.match(/\b(?:add|put|include|need|buy|get|grab|pick\s+up)\s+(.+?)\s+(?:to|on|in|for)\s+(?:my\s+)?(?:shopping|grocery)\s+list\b/i);
  if (addToListMatch) return splitShoppingItems(addToListMatch[1]);

  const groceryLeadMatch = text.match(/\b(?:groceries|grocery|shopping)\b(?:\s+list|\s+items)?\s*(?:are|is|with|for|:|-)?\s+(.+)$/i);
  if (groceryLeadMatch) return splitShoppingItems(groceryLeadMatch[1]);

  const needGroceriesMatch = text.match(/\b(?:need|buy|get|grab|pick\s+up)\s+(?:some\s+)?(?:groceries|grocery|shopping)\s*(.+)$/i);
  if (needGroceriesMatch) return splitShoppingItems(needGroceriesMatch[1]);

  const storeMatch = text.match(/\b(?:need|buy|get|grab|pick\s+up)\s+(.+?)\s+(?:from|at)\s+(?:heb|walmart|costco|the\s+store|store)\b/i);
  if (storeMatch) return splitShoppingItems(storeMatch[1]);

  const afterListMatch = text.match(/\b(?:shopping|grocery)\s+list\b\s*(.*)$/i);
  if (afterListMatch) return splitShoppingItems(afterListMatch[1]);

  return [];
}

function buildShoppingListPlan(input, board, currentUser) {
  if (!board || !/\b(?:shopping|grocery|groceries|heb|walmart|costco|store)\b/i.test(input)) return null;

  const group =
    (board.groups || []).find((entry) => normalizePhrase(entry.name) === normalizePhrase(SHOPPING_LIST_GROUP_NAME)) || null;
  const items = extractShoppingItems(input);
  const canCreateEmptyList = /\b(?:create|add|make|start|set up|new)\b.*\b(?:shopping|grocery).*list\b/i.test(input);
  if (!items.length && !canCreateEmptyList) return null;
  const operations = [];

  if (!group) {
    operations.push({
      type: "create-group",
      name: SHOPPING_LIST_GROUP_NAME,
      color: SHOPPING_LIST_COLOR,
    });
  }

  const existingTaskNames = new Set(
    (board.tasks || [])
      .filter((task) => group?.id && Number(task.group_id) === Number(group.id))
      .map((task) => normalizePhrase(task.name))
  );
  const plannedTaskNames = new Set();

  items.forEach((item) => {
    const key = normalizePhrase(item);
    if (!key || existingTaskNames.has(key) || plannedTaskNames.has(key)) return;
    plannedTaskNames.add(key);
    operations.push({
      type: "create-task",
      groupId: group?.id || null,
      groupName: SHOPPING_LIST_GROUP_NAME,
      name: item,
      status: "Pending",
      dueDate: null,
      ownerId: currentUser?.id ?? null,
      priority: "Medium",
      notes: "",
    });
  });

  if (!operations.length) {
    return {
      mode: "answer",
      message: 'Your Shopping List already exists. Try "add milk, eggs, and bread to my shopping list" and I will ask before changing it.',
    };
  }

  const summary = spokenJoin(operations.map((operation) => describeAssistantOperation(operation)));
  return {
    mode: "proposal",
    operations,
    message: `Say yes if you want me to ${summary}.`,
  };
}

function extractDateMention(text = "") {
  const match = String(text || "").match(
    /\b(eod|end of day|by end of day|end of week|by end of week|in\s+\d{1,2}\s+days?|today|tonight|tomorrow|this week|next week|next\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)|(?:this\s+)?(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)|\d{1,2}\/\d{1,2}(?:\/\d{2,4})?|\d{4}-\d{2}-\d{2})\b/i
  );
  if (!match) return { dueDate: null, raw: "" };
  return { dueDate: parseNaturalDate(match[1]), raw: match[1] };
}

function stripDateMention(text = "", dateRaw = "") {
  if (!dateRaw) return text;
  return String(text || "")
    .replace(new RegExp(`\\b(?:due|by|on|for)?\\s*${escapeRegExp(dateRaw)}\\b`, "i"), " ")
    .replace(/\s+/g, " ")
    .trim();
}

function firstWorkingGroup(board) {
  return (board?.groups || []).find((group) => !/\bdone|complete|finished\b/i.test(group.name)) || board?.groups?.[0] || null;
}

function targetGroupForNaturalText(board, text, fallbackGroup = null) {
  const mentioned = findGroupMention(board, text, fallbackGroup);
  if (mentioned) return mentioned;
  if (/\b(?:buy|get|grab|pick up|pickup|groceries|grocery|shopping|heb|walmart|costco|store)\b/i.test(text)) {
    const shoppingGroup = (board?.groups || []).find((entry) => normalizePhrase(entry.name) === normalizePhrase(SHOPPING_LIST_GROUP_NAME));
    if (shoppingGroup) return shoppingGroup;
  }
  return firstWorkingGroup(board);
}

function stripGroupMention(text = "", group = null) {
  let next = String(text || "");
  if (group?.name) {
    next = next.replace(new RegExp(`\\b(?:to|in|into|on|under|inside|for)\\s+(?:the\\s+)?${escapeRegExp(group.name)}(?:\\s+(?:group|list|section))?\\b`, "ig"), " ");
  }
  next = next.replace(/\b(?:to|in|into|on|under|inside|for)\s+(?:my\s+)?(?:shopping|grocery|groceries)\s+(?:list|items)?\b/gi, " ");
  return next.replace(/\s+/g, " ").trim();
}

function cleanNaturalTaskName(text = "", group = null) {
  const { raw } = extractDateMention(text);
  return sentenceCase(
    stripGroupMention(stripDateMention(normalizeCopilotInput(text), raw), group)
      .replace(/\b(?:and\s+make\s+it|make\s+it|set\s+it|mark\s+it|hey|okay|ok|please|can you|could you|would you|i should|we should|should|i have to|we have to|have to|i need to|we need to|need to|i need|we need|remember to|remind me to|don't forget to|dont forget to|make sure to|add|create|make|new|put|start|set up|todo|to do|task|item|thing|for me)\b/gi, " ")
      .replace(/\b(?:critical|high|medium|low|priority|pending|open|done|complete|completed|finished|overdue|late|past due)\b/gi, " ")
      .replace(/[.?!]+$/g, "")
      .replace(/\s+/g, " ")
      .trim()
  );
}

function splitNaturalTaskNames(text = "", group = null) {
  const cleaned = cleanNaturalTaskName(text, group);
  if (!cleaned) return [];
  const shouldSplit = /[,;\n]/.test(cleaned) || normalizePhrase(group?.name) === normalizePhrase(SHOPPING_LIST_GROUP_NAME);
  if (!shouldSplit) return [cleaned];
  return cleaned
    .split(/\s*(?:,|;|\n|\band\b|\bplus\b)\s*/i)
    .map((item) => sentenceCase(item.trim()))
    .filter((item) => item.length > 1);
}

function tasksForGroup(board, group) {
  return (board?.tasks || []).filter((task) => !group?.id || Number(task.group_id) === Number(group.id));
}

function buildNaturalStatusPlan(input, board, currentUser) {
  const statusMentions = extractStatusMentions(input);
  const targetStatus =
    statusMentions.slice(-1)[0] ||
    (/\b(?:finish|finished|complete|completed|check(?:ed)?\s+off|cross\s+off|got|bought|grabbed|purchased|done with)\b/i.test(input) ? "Done" : null);
  if (!targetStatus) return null;

  const group = findGroupMention(board, input);
  const task = findTaskMention(board, input);
  if (task?.id) {
    return {
      mode: "proposal",
      operations: [
        {
          type: "update-task",
          taskId: task.id,
          taskName: task.name,
          changes: { status: targetStatus },
        },
      ],
      message: `Say yes if you want me to mark "${task.name}" as ${targetStatus}.`,
    };
  }

  if (group?.id && /\b(?:all|everything|whole|entire|list|group|stuff|items?)\b/i.test(input)) {
    const sourceStatus = statusMentions.length > 1 && statusMentions[0] !== targetStatus ? statusMentions[0] : null;
    const candidates = tasksForGroup(board, group).filter((entry) => {
      if (sourceStatus && entry.status !== sourceStatus && visualStatus(entry) !== sourceStatus) return false;
      return entry.status !== targetStatus;
    });
    if (!candidates.length) {
      return { mode: "answer", message: `${group.name} already looks ${targetStatus.toLowerCase()}.` };
    }
    const operations = [
      {
        type: "bulk-update",
        taskIds: candidates.map((entry) => entry.id),
        taskCount: candidates.length,
        groupName: group.name,
        sourceStatus,
        changes: { status: targetStatus },
      },
    ];
    return {
      mode: "proposal",
      operations,
      message: `Say yes if you want me to ${describeAssistantOperation(operations[0])}.`,
    };
  }

  return null;
}

function buildNaturalDeletePlan(input, board) {
  if (!hasDeleteIntent(input) && !/\b(?:take|remove)\s+.+\s+(?:off|out of|from)\b/i.test(input)) return null;
  const group = findGroupMention(board, input);
  const task = findTaskMention(board, input);
  if (/\b(done|complete|completed|finished|checked off|completed tasks?|done tasks?)\b/i.test(input)) {
    if (!group?.id && /\b(?:in|inside|under|from)\s+(?!me\b|my\b)([a-z][a-z0-9 -]{1,80})/i.test(input)) return null;
    const doneTasks = tasksForGroup(board, group).filter((entry) => entry.status === "Done");
    if (doneTasks.length) {
      const operations = [
        {
          type: "bulk-delete-tasks",
          taskIds: doneTasks.map((entry) => entry.id),
          taskCount: doneTasks.length,
          groupName: group?.name || "",
          sourceStatus: "Done",
        },
      ];
      return {
        mode: "proposal",
        operations,
        message: `Say yes if you want me to ${describeAssistantOperation(operations[0])}.`,
      };
    }
  }
  if (task?.id) {
    const operations = [{ type: "delete-task", taskId: task.id, taskName: task.name }];
    return {
      mode: "proposal",
      operations,
      message: `Say yes if you want me to ${describeAssistantOperation(operations[0])}.`,
    };
  }

  if (group?.id) {
    const itemText = stripGroupMention(
      String(input || "").replace(/\b(?:delete|remove|take|off|out of|from|the|my|list|item|items)\b/gi, " "),
      group
    );
    const itemNames = splitShoppingItems(itemText);
    const operations = itemNames
      .map((item) => findTaskMention({ tasks: tasksForGroup(board, group) }, item))
      .filter(Boolean)
      .map((entry) => ({ type: "delete-task", taskId: entry.id, taskName: entry.name }));
    if (operations.length) {
      return {
        mode: "proposal",
        operations,
        message: `Say yes if you want me to ${spokenJoin(operations.map(describeAssistantOperation))}.`,
      };
    }
  }

  return null;
}

function buildNaturalDatePlan(input, board) {
  const { dueDate, raw } = extractDateMention(input);
  if (!dueDate) return null;
  const task = findTaskMention(board, input);
  if (!task?.id) return null;
  const operations = [
    {
      type: "update-task",
      taskId: task.id,
      taskName: task.name,
      changes: { due_date: dueDate },
    },
  ];
  return {
    mode: "proposal",
    operations,
    message: `Say yes if you want me to change the due date for "${task.name}" to ${formatDate(dueDate)}${raw ? ` from "${raw}"` : ""}.`,
  };
}

function buildNaturalGroupCreatePlan(input, board, currentUser) {
  if (!board || !hasCreateIntent(input)) return null;
  if (!/\b(?:create|make|start|set up|new)\b/i.test(input)) return null;
  if (!/\b(task\s+group|group|section|lane|list)\b/i.test(input)) return null;
  if (/\b(?:what|which|show|how many|summarize|summary)\b/i.test(input)) return null;

  const groupMatch =
    String(input || "").match(/\b(?:create|make|start|set up)\s+(?:a\s+|an\s+|new\s+)?(?:(?:task\s+)?group|section|lane|list)(?:\s+(?:called|named|for))?\s+(.+)$/i) ||
    String(input || "").match(/\b(?:create|make|start|set up|new)\s+(.+?)\s+(?:(?:task\s+)?group|section|lane|list)\b/i);
  if (!groupMatch) return null;

  let name = sentenceCase(
    String(groupMatch[1] || "")
      .replace(/\b(with|that has|including|include|items?|tasks?)\b.*$/i, "")
      .replace(/\b(task\s+group|group|section|lane|list)\b/gi, " ")
      .replace(/[.?!]+$/g, "")
      .replace(/\s+/g, " ")
      .trim()
  );

  if (!name || name.length < 2) return null;
  if (/\bshopping|grocery|groceries|heb|walmart|costco\b/i.test(input)) name = SHOPPING_LIST_GROUP_NAME;
  const existing = (board.groups || []).find((group) => normalizePhrase(group.name) === normalizePhrase(name));
  if (existing) return { mode: "answer", message: `${existing.name} already exists on this board.` };

  const operation = {
    type: "create-group",
    name,
    color: /\bshopping|grocery|groceries|heb|walmart|costco\b/i.test(input) ? SHOPPING_LIST_COLOR : board.color || "#3156f5",
  };
  const extraMatch = String(input || "").match(/\b(?:with|including|that has|and add)\s+(.+)$/i);
  const extraTasks = extraMatch ? splitShoppingItems(extraMatch[1]) : [];
  const operations = [
    operation,
    ...extraTasks.map((taskName) => ({
      type: "create-task",
      groupId: null,
      groupName: name,
      name: taskName,
      status: "Pending",
      dueDate: null,
      ownerId: currentUser?.id ?? null,
      priority: "Medium",
      notes: "",
    })),
  ];

  return {
    mode: "proposal",
    operations,
    message: `Say yes if you want me to ${spokenJoin(operations.map(describeAssistantOperation))}.`,
  };
}

function buildNaturalTaskCreatePlan(input, board, currentUser, workspace = {}) {
  if (!/\b(?:add|create|make|new|put|start|set up|need|remember|remind|todo|to do|don't forget|dont forget|buy|get|grab|pick up)\b/i.test(input)) return null;
  if (/\b(?:what|which|show|how many|summarize|summary)\b/i.test(input)) return null;

  const group = targetGroupForNaturalText(board, input);
  if (!group?.id) return null;

  const { dueDate } = extractDateMention(input);
  const priority = extractPriorityMentions(input).slice(-1)[0] || "Medium";
  const status = extractStatusMentions(input).slice(-1)[0] || "Pending";
  const owner = /\b(?:assign|owner|owned by|for)\b/i.test(input) ? findUserMention(workspace.users || [], input) : null;
  const names = splitNaturalTaskNames(input, group);
  const existing = new Set(tasksForGroup(board, group).map((task) => normalizePhrase(task.name)));
  const planned = new Set();
  const operations = names
    .filter((name) => {
      const key = normalizePhrase(name);
      if (!key || existing.has(key) || planned.has(key)) return false;
      planned.add(key);
      return true;
    })
    .map((name) => ({
      type: "create-task",
      groupId: group.id,
      groupName: group.name,
      name,
      status,
      dueDate,
      ownerId: owner?.id ?? currentUser?.id ?? null,
      priority,
      notes: "",
    }));

  if (!operations.length) return null;
  return {
    mode: "proposal",
    operations,
    message: `Say yes if you want me to ${spokenJoin(operations.map(describeAssistantOperation))}.`,
  };
}

function buildNaturalAssistantPlan(input, board, currentUser, workspace = {}) {
  return (
    buildNaturalDeletePlan(input, board) ||
    buildNaturalStatusPlan(input, board, currentUser) ||
    buildNaturalDatePlan(input, board) ||
    buildNaturalGroupCreatePlan(input, board, currentUser) ||
    buildNaturalTaskCreatePlan(input, board, currentUser, workspace)
  );
}

function splitAssistantClauses(text = "") {
  return String(text || "")
    .split(/\s+(?:and then|then|and)\s+(?=(?:mark|set|change|move|update|add|create|new|complete|finish|delete|remove|rename|assign)\b)/i)
    .map((part) => part.trim())
    .filter(Boolean);
}

function describeTask(task) {
  const status = task.status || visualStatus(task);
  return `${task.name} (${status}${task.due_date ? `, ${formatDate(task.due_date)}` : ""})`;
}

function buildReadOnlyAssistantResponse(input, board, currentUser) {
  const text = normalizePhrase(input);
  const looksLikeQuery = /\b(what|which|show|list|summarize|summary|how many|what's|whats|focus|priorities|handle first|work on first|start with)\b/i.test(input);
  if (!looksLikeQuery && !/\b(my tasks|show my work)\b/i.test(input)) return null;
  const groupMention = findGroupMention(board, text);
  const tasks = sortTasks(board.tasks || []);
  const scopedTasks = /\b(my|mine|assigned to me|my tasks)\b/i.test(input)
    ? tasks.filter((task) => Number(task.owner_id) === Number(currentUser?.id))
    : tasks;
  const groupTasks = groupMention ? scopedTasks.filter((task) => Number(task.group_id) === Number(groupMention.id)) : scopedTasks;

  if (/\b(task groups|groups|lanes|sections)\b/i.test(input)) {
    const summaries = boardGroupSummary(board).map((group) => `${group.name} (${group.taskCount})`);
    return summaries.length
      ? `This board has ${spokenJoin(summaries.slice(0, 5))}${summaries.length > 5 ? ", and more" : ""}.`
      : "This board does not have any task groups yet.";
  }

  if (/\boverdue\b/i.test(input)) {
    const overdue = groupTasks.filter((task) => visualStatus(task) === "Overdue");
    return overdue.length
      ? `I found ${overdue.length} overdue task${overdue.length === 1 ? "" : "s"}: ${spokenJoin(overdue.slice(0, 4).map(describeTask))}${overdue.length > 4 ? ", and more" : ""}.`
      : "Nothing is overdue right now.";
  }

  if (/\bpending\b/i.test(input)) {
    const pending = groupTasks.filter((task) => visualStatus(task) === "Pending");
    return pending.length
      ? `You have ${pending.length} pending task${pending.length === 1 ? "" : "s"}: ${spokenJoin(pending.slice(0, 4).map(describeTask))}${pending.length > 4 ? ", and more" : ""}.`
      : "Nothing is pending right now.";
  }

  if (/\b(my tasks|what do i have|what am i working on|show my work)\b/i.test(input)) {
    return scopedTasks.length
      ? `Here is what I see for you: ${spokenJoin(scopedTasks.slice(0, 5).map(describeTask))}${scopedTasks.length > 5 ? ", and more" : ""}.`
      : "I do not see any tasks assigned to you on this board.";
  }

  if (/\b(focus|priority|priorities|handle first|work on first|start with|what.*today|today.*what)\b/i.test(input)) {
    const focusTasks = groupTasks.filter((task) => visualStatus(task) !== "Done").slice(0, 4);
    return focusTasks.length
      ? `Start here: ${spokenJoin(focusTasks.map(describeTask))}. I sorted that by overdue first, then priority, then due date.`
      : "There is nothing active on this board right now.";
  }

  return null;
}

function parseAssistantClause(clause, board, currentUser, context = {}, workspace = {}) {
  const workingText = String(clause || "").trim();
  const lower = workingText.toLowerCase();
  const fallbackGroup = context.group || null;
  const users = workspace.users || [];
  const boards = workspace.boards || (board ? [board] : []);
  const group = findGroupMention(board, workingText, fallbackGroup);
  const task = findTaskMention(board, workingText);
  const targetBoard = findBoardMention(boards, workingText, board);

  const wantsTaskCleanup = /\b(tasks?|items?|done|complete|completed|pending|overdue|list)\b/i.test(workingText);
  if (hasDeleteIntent(workingText) && (hasGroupIntent(workingText) || (group?.id && !wantsTaskCleanup && !task?.id))) {
    if (/\ball\b/i.test(lower)) {
      const groups = board?.groups || [];
      if (groups.length) {
        return {
          operation: {
            type: "bulk-delete-groups",
            groupIds: groups.map((entry) => entry.id),
            groupCount: groups.length,
            taskCount: (board?.tasks || []).length,
          },
          context: { group: null },
        };
      }
    }

    if (group?.id) {
      const linkedTasks = (board?.tasks || []).filter((task) => Number(task.group_id) === Number(group.id)).length;
      return {
        operation: {
          type: "delete-group",
          groupId: group.id,
          groupName: group.name,
          taskCount: linkedTasks,
        },
        context: { group: null },
      };
    }
  }

  const groupCreateMatch = workingText.match(/\b(?:create|add|new)\s+(?:a\s+)?(?:new\s+)?(?:task\s+)?group(?:\s+(?:called|named))?\s+["“]?(.+?)["”]?$/i);
  if (groupCreateMatch) {
    const name = groupCreateMatch[1].trim().replace(/\s+group$/i, "");
    if (!name) return null;
    return {
      operation: { type: "create-group", name: sentenceCase(name), color: board.color || "#3156f5" },
      context: { group: { id: null, name: sentenceCase(name), color: board.color || "#3156f5" } },
    };
  }

  const noteMatch = workingText.match(/\b(?:add|append|update)\s+(?:a\s+)?note\s+(?:"([^"]+)"|“([^”]+)”|(.+?))\s+(?:to|for|on)\s+(.+)$/i);
  if (noteMatch) {
    const noteText = (noteMatch[1] || noteMatch[2] || noteMatch[3] || "").trim();
    const task = findTaskMention(board, noteMatch[4]);
    if (task && noteText) {
      const nextNotes = [String(task.notes || "").trim(), sentenceCase(noteText)].filter(Boolean).join("\n");
      return {
        operation: {
          type: "update-task",
          taskId: task.id,
          taskName: task.name,
          changes: { notes: nextNotes },
        },
        context: { group: (board.groups || []).find((entry) => Number(entry.id) === Number(task.group_id)) || group },
      };
    }
  }

  const dateMatch =
    workingText.match(/\b(?:change|set|move|update)\s+(?:the\s+)?(?:due date|date|deadline)\s+(?:of|for)?\s+(.+?)\s+(?:to|for|on)\s+(.+)$/i) ||
    workingText.match(/\b(?:move|reschedule|set)\s+(.+?)\s+(?:to|for|on)\s+(.+)$/i);
  if (dateMatch) {
    const task = findTaskMention(board, dateMatch[1]);
    const nextDate = parseNaturalDate(dateMatch[2]);
    if (task && nextDate) {
      return {
        operation: {
          type: "update-task",
          taskId: task.id,
          taskName: task.name,
          changes: { due_date: nextDate },
        },
        context: { group: (board.groups || []).find((entry) => Number(entry.id) === Number(task.group_id)) || group },
      };
    }
  }

  const statusMentions = extractStatusMentions(workingText);
  if (/\b(?:mark|set|change|complete|finish|update)\b/i.test(lower) && statusMentions.length) {
    const targetStatus = statusMentions[statusMentions.length - 1];
    const sourceStatus = statusMentions.length > 1 ? statusMentions[0] : null;
    const task = !/\ball\b/i.test(lower) ? findTaskMention(board, workingText) : null;
    const myOnly = /\b(my tasks|my task|mine|your tasks)\b/i.test(lower);

    if (task) {
      return {
        operation: {
          type: "update-task",
          taskId: task.id,
          taskName: task.name,
          changes: { status: targetStatus },
        },
        context: { group: (board.groups || []).find((entry) => Number(entry.id) === Number(task.group_id)) || group },
      };
    }

    const missingNamedGroup =
      !group?.id &&
      (/\b(?:in|inside|under|for|from)\s+(?!me\b|my\b|today\b|tomorrow\b)([a-z][a-z0-9 -]{1,80})/i.test(workingText) ||
        /\b(?:shopping|grocery|groceries|list)\b/i.test(workingText));
    if (missingNamedGroup) return null;

    const matchingTasks = (board.tasks || []).filter((entry) => {
      if (group?.id && Number(entry.group_id) !== Number(group.id)) return false;
      if (myOnly && Number(entry.owner_id) !== Number(currentUser?.id)) return false;
      if (sourceStatus && visualStatus(entry) !== sourceStatus && entry.status !== sourceStatus) return false;
      return true;
    });

    if (matchingTasks.length) {
      return {
        operation: {
          type: "bulk-update",
          taskIds: matchingTasks.map((entry) => entry.id),
          taskCount: matchingTasks.length,
          groupName: group?.name || null,
          sourceStatus,
          changes: { status: targetStatus },
        },
        context: { group },
      };
    }
  }

  if (/\b(?:create|add|new)\b/i.test(lower) && /\b(?:task|one)\b/i.test(lower)) {
    const targetStatus = extractStatusMentions(workingText).slice(-1)[0] || "Pending";
    const targetPriority = extractPriorityMentions(workingText).slice(-1)[0] || "Medium";
    const explicitDate = parseNaturalDate((workingText.match(/\b(?:due|for|on)\s+([a-z0-9,/\-\s]+)$/i) || [])[1] || "");
    const owner = findUserMention(users, workingText);

    let name = workingText
      .replace(/\b(?:create|add|new)\b/gi, "")
      .replace(/\b(?:a|an)\b/gi, "")
      .replace(/\b(?:new)\b/gi, "")
      .replace(/\b(?:task|one)\b/gi, "")
      .replace(/\b(?:called|named|for)\b/gi, "")
      .replace(/\bas\s+(?:done|complete|completed|pending|open|overdue)\b/gi, "")
      .replace(/\b(?:critical|high|medium|low)\b/gi, "")
      .replace(/\b(?:due|for|on)\s+[a-z0-9,/\-\s]+$/i, "")
      .trim();

    if (group?.name) {
      name = name.replace(new RegExp(`\\b(?:in|to|under|for)\\s+(?:the\\s+)?${escapeRegExp(group.name)}(?:\\s+group)?\\b`, "ig"), "").trim();
    }

    if (name) {
      return {
        operation: {
          type: "create-task",
          groupId: group?.id || null,
          groupName: group?.name || null,
          name: sentenceCase(name),
          status: targetStatus,
          dueDate: explicitDate,
          ownerId: owner?.id ?? currentUser?.id ?? null,
          priority: targetPriority,
          notes: "",
        },
        context: { group },
      };
    }
  }

  const assignMatch = workingText.match(/\b(?:assign|give)\s+(.+?)\s+(?:to|for)\s+(.+)$/i);
  if (assignMatch) {
    const assignTask = findTaskMention(board, assignMatch[1]);
    const assignUser = findUserMention(users, assignMatch[2]);
    if (assignTask?.id && assignUser?.id) {
      return {
        operation: {
          type: "update-task",
          taskId: assignTask.id,
          taskName: assignTask.name,
          changes: { owner_id: assignUser.id },
          ownerName: assignUser.name,
        },
        context: { group: (board.groups || []).find((entry) => Number(entry.id) === Number(assignTask.group_id)) || group },
      };
    }
  }

  if (task?.id && extractPriorityMentions(workingText).length && /\b(?:priority|make|set|change|mark)\b/i.test(lower)) {
    const nextPriority = extractPriorityMentions(workingText).slice(-1)[0];
    if (nextPriority) {
      return {
        operation: {
          type: "update-task",
          taskId: task.id,
          taskName: task.name,
          changes: { priority: nextPriority },
        },
        context: { group: (board.groups || []).find((entry) => Number(entry.id) === Number(task.group_id)) || group },
      };
    }
  }

  const moveTaskMatch = workingText.match(/\b(?:move|send|put)\s+(.+?)\s+(?:to|into|under)\s+(.+)$/i);
  if (moveTaskMatch) {
    const movedTask = findTaskMention(board, moveTaskMatch[1]);
    const targetGroup = findGroupMention(board, moveTaskMatch[2], group);
    if (movedTask?.id && targetGroup?.id && Number(movedTask.group_id) !== Number(targetGroup.id)) {
      return {
        operation: {
          type: "update-task",
          taskId: movedTask.id,
          taskName: movedTask.name,
          changes: { group_id: targetGroup.id },
          targetGroupName: targetGroup.name,
        },
        context: { group: targetGroup },
      };
    }
  }

  if (hasDeleteIntent(workingText) && /\ball\b/i.test(lower) && /\btasks?\b/i.test(lower)) {
    const sourceStatus = extractStatusMentions(workingText)[0] || null;
    const myOnly = /\b(my tasks|my task|mine|your tasks)\b/i.test(lower);
    const matchingTasks = (board.tasks || []).filter((entry) => {
      if (group?.id && Number(entry.group_id) !== Number(group.id)) return false;
      if (myOnly && Number(entry.owner_id) !== Number(currentUser?.id)) return false;
      if (sourceStatus && visualStatus(entry) !== sourceStatus && entry.status !== sourceStatus) return false;
      return true;
    });
    if (matchingTasks.length) {
      return {
        operation: {
          type: "bulk-delete-tasks",
          taskIds: matchingTasks.map((entry) => entry.id),
          taskCount: matchingTasks.length,
          groupName: group?.name || null,
          sourceStatus,
        },
        context: { group },
      };
    }
  }

  if (hasDeleteIntent(workingText) && task?.id) {
    return {
      operation: {
        type: "delete-task",
        taskId: task.id,
        taskName: task.name,
      },
      context: { group: (board.groups || []).find((entry) => Number(entry.id) === Number(task.group_id)) || group },
    };
  }

  const renameMatch = workingText.match(/\brename\s+(.+?)\s+to\s+["“]?(.+?)["”]?$/i);
  if (renameMatch) {
    const sourceText = renameMatch[1].trim();
    const nextName = sentenceCase(renameMatch[2].trim());
    const renameGroup = findGroupMention(board, sourceText, group);
    const renameTask = findTaskMention(board, sourceText);
    const renameBoard = findBoardMention(boards, sourceText, targetBoard);

    if (renameGroup?.id && nextName) {
      return {
        operation: {
          type: "update-group",
          groupId: renameGroup.id,
          groupName: renameGroup.name,
          changes: { name: nextName },
        },
        context: { group: { ...renameGroup, name: nextName } },
      };
    }

    if (renameTask?.id && nextName) {
      return {
        operation: {
          type: "update-task",
          taskId: renameTask.id,
          taskName: renameTask.name,
          changes: { name: nextName },
        },
        context: { group: (board.groups || []).find((entry) => Number(entry.id) === Number(renameTask.group_id)) || group },
      };
    }

    if (renameBoard?.id && nextName) {
      return {
        operation: {
          type: "update-board",
          boardId: renameBoard.id,
          boardName: renameBoard.name,
          changes: { name: nextName },
        },
        context: { group: null },
      };
    }
  }

  const projectCreateMatch = workingText.match(/\b(?:create|add|new)\s+(?:a\s+)?(?:new\s+)?(?:project|board)(?:\s+(?:called|named))?\s+["“]?(.+?)["”]?$/i);
  if (projectCreateMatch) {
    const projectName = sentenceCase(projectCreateMatch[1].trim());
    if (projectName) {
      return {
        operation: {
          type: "create-board",
          name: projectName,
          description: "",
          department: currentUser?.department || board?.department || "General",
          color: board?.color || "#3156f5",
        },
        context: { group: null },
      };
    }
  }

  if (hasDeleteIntent(workingText) && hasProjectIntent(workingText) && !hasGroupIntent(workingText) && targetBoard?.id) {
    return {
      operation: {
        type: "delete-board",
        boardId: targetBoard.id,
        boardName: targetBoard.name,
        groupCount: (targetBoard.groups || []).length,
        taskCount: (targetBoard.tasks || []).length,
      },
      context: { group: null },
    };
  }

  const boardDescriptionMatch = workingText.match(/\b(?:set|change|update)\s+(?:the\s+)?(?:project|board)?\s*description\s+(?:to|as)\s+["“]?(.+?)["”]?$/i);
  if (boardDescriptionMatch && targetBoard?.id) {
    return {
      operation: {
        type: "update-board",
        boardId: targetBoard.id,
        boardName: targetBoard.name,
        changes: { description: sentenceCase(boardDescriptionMatch[1].trim()) },
      },
      context: { group: null },
    };
  }

  const boardColorMatch = workingText.match(/\b(?:set|change|update)\s+(?:the\s+)?(?:project|board)?\s*color\s+(?:to|as)\s+(#[0-9a-f]{6}|#[0-9a-f]{3})\b/i);
  if (boardColorMatch && targetBoard?.id) {
    return {
      operation: {
        type: "update-board",
        boardId: targetBoard.id,
        boardName: targetBoard.name,
        changes: { color: boardColorMatch[1] },
      },
      context: { group: null },
    };
  }

  const groupColorMatch = workingText.match(/\b(?:set|change|update)\s+(?:the\s+)?(?:task\s+)?group\s+(.+?)\s+color\s+(?:to|as)\s+(#[0-9a-f]{6}|#[0-9a-f]{3})\b/i);
  if (groupColorMatch) {
    const targetGroup = findGroupMention(board, groupColorMatch[1], group);
    if (targetGroup?.id) {
      return {
        operation: {
          type: "update-group",
          groupId: targetGroup.id,
          groupName: targetGroup.name,
          changes: { color: groupColorMatch[2] },
        },
        context: { group: { ...targetGroup, color: groupColorMatch[2] } },
      };
    }
  }

  const fieldCreateMatch = workingText.match(/\b(?:create|add|new)\s+(?:a\s+)?(?:(open|text|date|number|tag)\s+)?(?:column|field)(?:\s+(?:called|named))?\s+["“]?(.+?)["”]?$/i);
  if (fieldCreateMatch) {
    const fieldName = sentenceCase(fieldCreateMatch[2].trim());
    const fieldType = fieldTypeFromWord(fieldCreateMatch[1]) || fieldTypeFromWord((workingText.match(/\b(open|text|date|number|tag)\b/i) || [])[1]) || "text";
    if (fieldName) {
      return {
        operation: {
          type: "create-field",
          boardId: board.id,
          boardName: board.name,
          name: fieldName,
          fieldType,
        },
        context: { group },
      };
    }
  }

  return null;
}

function describeAssistantOperation(operation) {
  switch (operation.type) {
    case "create-board":
      return `create a new project called "${operation.name}"`;
    case "update-board":
      if (operation.changes.name) return `rename the project "${operation.boardName}" to "${operation.changes.name}"`;
      if (operation.changes.description !== undefined) return `update the description for "${operation.boardName}"`;
      if (operation.changes.color) return `change the color for "${operation.boardName}"`;
      return `update the project "${operation.boardName}"`;
    case "delete-board":
      return `delete the project "${operation.boardName}"${operation.groupCount ? ` with ${operation.groupCount} task group${operation.groupCount === 1 ? "" : "s"}` : ""}${operation.taskCount ? ` and ${operation.taskCount} task${operation.taskCount === 1 ? "" : "s"}` : ""}`;
    case "delete-group":
      return `delete the task group "${operation.groupName}"${operation.taskCount ? ` and its ${operation.taskCount} task${operation.taskCount === 1 ? "" : "s"}` : ""}`;
    case "bulk-delete-groups":
      return `delete all ${operation.groupCount} task groups${operation.taskCount ? ` and their ${operation.taskCount} task${operation.taskCount === 1 ? "" : "s"}` : ""}`;
    case "create-group":
      return `create a new task group called "${operation.name}"`;
    case "update-group":
      if (operation.changes.name) return `rename the task group "${operation.groupName}" to "${operation.changes.name}"`;
      if (operation.changes.color) return `change the color for "${operation.groupName}"`;
      return `update the task group "${operation.groupName}"`;
    case "create-field":
      return `create a new ${operation.fieldType} column called "${operation.name}"`;
    case "create-task":
      return `create a new ${operation.status} task called "${operation.name}"${operation.groupName ? ` in ${operation.groupName}` : ""}${operation.dueDate ? ` due ${formatDate(operation.dueDate)}` : ""}`;
    case "delete-task":
      return `delete the task "${operation.taskName}"`;
    case "bulk-delete-tasks":
      return `delete ${operation.taskCount} ${operation.sourceStatus ? `${operation.sourceStatus.toLowerCase()} ` : ""}task${operation.taskCount === 1 ? "" : "s"}${operation.groupName ? ` in ${operation.groupName}` : ""}`;
    case "update-task":
      if (operation.changes.status) return `mark "${operation.taskName}" as ${operation.changes.status}`;
      if (operation.changes.group_id) return `move "${operation.taskName}" to ${operation.targetGroupName}`;
      if (operation.changes.due_date) return `change the due date for "${operation.taskName}" to ${formatDate(operation.changes.due_date)}`;
      if (operation.changes.owner_id) return `assign "${operation.taskName}" to ${operation.ownerName || "the selected owner"}`;
      if (operation.changes.priority) return `set the priority for "${operation.taskName}" to ${operation.changes.priority}`;
      if (operation.changes.name) return `rename "${operation.taskName}" to "${operation.changes.name}"`;
      if (operation.changes.notes) return `add a note to "${operation.taskName}"`;
      return `update "${operation.taskName}"`;
    case "bulk-update":
      return `mark ${operation.taskCount} ${operation.sourceStatus ? `${operation.sourceStatus.toLowerCase()} ` : ""}task${operation.taskCount === 1 ? "" : "s"}${operation.groupName ? ` in ${operation.groupName}` : ""} as ${operation.changes.status}`;
    default:
      return "make the requested changes";
  }
}

function buildAssistantPlan(input, board, currentUser, workspace = {}) {
  const normalizedInput = normalizeCopilotInput(input);
  if (/\b(what can you do|what do|help|how do i talk|examples?|commands?)\b/i.test(normalizedInput)) {
    return {
      mode: "answer",
      message:
        'Talk normally. Examples: "I need milk eggs bread", "I handled trainer schedule", "push trainer schedule to Friday", "make flyer urgent", "clear completed tasks in shopping", or "start a Natasha group with call list and flyers". I will ask before changing anything.',
    };
  }
  const readOnlyResponse = buildReadOnlyAssistantResponse(normalizedInput, board, currentUser);
  if (readOnlyResponse) {
    return { mode: "answer", message: readOnlyResponse };
  }

  const shoppingListPlan = buildShoppingListPlan(normalizedInput, board, currentUser);
  if (shoppingListPlan) return shoppingListPlan;

  const dictationPlan = buildDictationPlan(input, board, currentUser);
  if (dictationPlan) return dictationPlan;

  const clauses = splitAssistantClauses(normalizedInput);
  const operations = [];
  let context = { group: null };

  for (const clause of clauses) {
    const parsed = parseAssistantClause(clause, board, currentUser, context, workspace);
    if (!parsed?.operation) continue;
    operations.push(parsed.operation);
    context = { ...context, ...(parsed.context || {}) };
  }

  if (!operations.length) {
    const naturalPlan = buildNaturalAssistantPlan(normalizedInput, board, currentUser, workspace);
    if (naturalPlan) return naturalPlan;

    if (hasDeleteIntent(normalizedInput) && (hasGroupIntent(normalizedInput) || findGroupMention(board, normalizedInput))) {
      return {
        mode: "answer",
        needsClarification: true,
        message: 'I’m not sure which task group you want removed. Try “delete Natasha,” “delete the Natasha group,” or “delete all task groups,” and I will ask before changing the board.',
      };
    }

    return {
      mode: "answer",
      needsClarification: true,
      message:
        'I’m not sure what you want me to change yet, and I don’t want to guess. Try “I need groceries: milk, eggs, bread,” “finish everything in shopping,” or “remember to call Miguel tomorrow.”',
    };
  }

  const summary = spokenJoin(operations.map((operation) => describeAssistantOperation(operation)));
  return {
    mode: "proposal",
    operations,
    message: `Say yes if you want me to ${summary}.`,
  };
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

function loadGroupPrefs(board) {
  if (!board?.id) return {};
  try {
    return JSON.parse(localStorage.getItem(`${GROUP_PREFS_KEY_PREFIX}-${board.id}`) || "{}");
  } catch {
    return {};
  }
}

function persistGroupPrefs(boardId, prefs) {
  if (!boardId) return;
  localStorage.setItem(`${GROUP_PREFS_KEY_PREFIX}-${boardId}`, JSON.stringify(prefs || {}));
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
          <ThemeToggle theme={theme} onToggle={onToggleTheme} compact />
        </div>

        <section className="login-shell__card">
          <div className="login-shell__brand">
            <img className="brand-mark" src={LOGO_SRC} alt="Organization Tool logo" />
            <div>
              <strong>Organization Tool</strong>
              <span>Workspace sign in</span>
            </div>
          </div>

          <div className="login-shell__intro">
            <h1>Sign in</h1>
            <p>Enter your username and password.</p>
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
              {busy ? "Entering..." : "Enter"}
            </button>
          </form>

          {quickLoginUsers.length ? (
            <div className="quick-login-strip">
              <div className="quick-login-strip__head">
                <span className="eyebrow">Quick login</span>
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

function DashboardView({ currentUser, boards, announcements, activity = [], onUndoActivity, busy, onOpenBoard }) {
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
  const recentActivity = [...activity].reverse().slice(0, 5);
  const primaryBoard = boards[0] || null;
  const nextTask = overdue[0] || urgent[0] || dueSoon[0] || myTasks[0] || null;
  const mobileSummary = overdue.length
    ? `${overdue.length} overdue`
    : urgent.length
      ? `${urgent.length} urgent`
      : nextTask
        ? "Next task ready"
        : "Clean day";

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

      <section className="dashboard-mobile-command" aria-label="Mobile work summary">
        <div>
          <span className="eyebrow">Today</span>
          <strong>{mobileSummary}</strong>
          <p>
            {nextTask
              ? `${nextTask.name} - ${nextTask.board_name}`
              : primaryBoard
                ? `${primaryBoard.name} is ready when you are.`
                : "No boards yet. Create one when you are ready."}
          </p>
        </div>
        {(nextTask || primaryBoard) && (
          <button
            type="button"
            className="ghost-button dashboard-mobile-command__button"
            onClick={() => onOpenBoard(nextTask?.board_id || primaryBoard.id)}
          >
            Open
          </button>
        )}
      </section>

      <div className="dashboard-grid">
        <section className="panel panel--dashboard">
          <div className="panel__head">
            <div>
              <span className="eyebrow">My work</span>
              <h3>Due soon</h3>
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
              <h3>Pinned notes</h3>
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

        <section className="panel panel--dashboard panel--activity">
          <div className="panel__head">
            <div>
              <span className="eyebrow">Recent</span>
              <h3>Changes</h3>
            </div>
            {recentActivity.length ? (
              <button type="button" className="ghost-button" onClick={() => onUndoActivity?.()} disabled={busy === "undo-latest"}>
                Undo latest
              </button>
            ) : null}
          </div>
          <div className="activity-list">
            {recentActivity.length ? (
              recentActivity.map((item) => (
                <div key={item.id} className={cls("activity-row", "activity-row--change")}>
                  <div>
                    <strong>{item.label}</strong>
                    <small>{formatActivityTime(item.at)}</small>
                  </div>
                  {item.undone ? (
                    <span className="pill">Undone</span>
                  ) : (
                    <button type="button" className="ghost-button" onClick={() => onUndoActivity?.(item.id)} disabled={busy === `undo-${item.id}`}>
                      Undo
                    </button>
                  )}
                </div>
              ))
            ) : (
              <div className="empty-state">No changes yet.</div>
            )}
          </div>
        </section>
      </div>

      <section className="panel panel--dashboard panel--projects">
        <div className="panel__head">
          <div>
            <span className="eyebrow">Projects</span>
            <h3>Boards</h3>
          </div>
        </div>
        <div className="project-grid project-grid--dashboard">
          {boards.map((board) => {
            const progress = boardProgress(board);
            const toneName = tone(boardTone(board));
            const groups = boardGroupSummary(board);
            const visibleGroups = groups.slice(0, 2);
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
                {board.description ? <p>{board.description}</p> : null}
                <div className="project-card__stats">
                  <span className="project-stat-pill">
                    <b>{groups.length}</b>
                    <span>Groups</span>
                  </span>
                  <span className="project-stat-pill">
                    <b>{totalTasks}</b>
                    <span>Tasks</span>
                  </span>
                  <span className="project-stat-pill">
                    <b>{progress.percent}%</b>
                    <span>Done</span>
                  </span>
                </div>
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
                          <span className="project-group-row__meta">
                            <b>{group.taskCount}</b>
                            <span>{group.taskCount === 1 ? "task" : "tasks"}</span>
                          </span>
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

function BillingView({ billing, boards, busy, onStartCheckout, onManageBilling }) {
  const current = billing || {};
  const isPro = current.plan === "pro";
  const price = `$${((current.pro_price_cents || 1500) / 100).toFixed(0)}`;
  const projectCount = boards.length;
  const groupCount = boards.reduce((total, board) => total + (board.groups?.length || 0), 0);
  const taskCount = boards.reduce((total, board) => total + (board.tasks?.length || 0), 0);
  const limits = current.free_limits || { projects: 1, task_groups: 3, tasks: 25 };

  return (
    <div className="billing-view">
      <section className="panel billing-hero">
        <div>
          <span className="eyebrow">Commercial</span>
          <h3>Organization Tool billing</h3>
          <p>Use the app free, or unlock the full workspace with Pro at {price}/month.</p>
        </div>
        <span className={cls("pill", isPro ? "pill--done" : "pill--pending")}>{isPro ? "Pro active" : "Free plan"}</span>
      </section>

      <section className="billing-grid">
        <article className={cls("pricing-card", !isPro && "is-current")}>
          <div className="pricing-card__head">
            <span className="eyebrow">Free</span>
            <strong>$0</strong>
            <small>For trying the workspace</small>
          </div>
          <ul>
            <li>{limits.projects} project</li>
            <li>{limits.task_groups} task groups</li>
            <li>{limits.tasks} tasks</li>
            <li>Manual project and task editing</li>
          </ul>
          <button type="button" className="ghost-button" disabled>
            {isPro ? "Available if canceled" : "Current plan"}
          </button>
        </article>

        <article className={cls("pricing-card", "pricing-card--pro", isPro && "is-current")}>
          <div className="pricing-card__head">
            <span className="eyebrow">Pro</span>
            <strong>{price}<small>/month</small></strong>
            <small>For real teams and daily use</small>
          </div>
          <ul>
            <li>Unlimited projects, task groups, and tasks</li>
            <li>AI copilot actions for boards and task groups</li>
            <li>Screenshot notes and installable mobile app</li>
            <li>Stripe-hosted billing, invoices, and cancellation portal</li>
          </ul>
          {isPro ? (
            <button type="button" onClick={onManageBilling} disabled={busy === "billing-portal" || !current.has_customer}>
              {busy === "billing-portal" ? "Opening..." : "Manage subscription"}
            </button>
          ) : (
            <button type="button" onClick={onStartCheckout} disabled={busy === "billing-checkout" || !current.stripe_configured}>
              {busy === "billing-checkout" ? "Opening checkout..." : `Upgrade to Pro - ${price}/mo`}
            </button>
          )}
          {!current.stripe_configured ? <p className="billing-warning">Stripe keys are not configured on the API yet.</p> : null}
        </article>
      </section>

      <section className="panel billing-usage">
        <div className="panel__head">
          <div>
            <span className="eyebrow">Usage</span>
            <h3>Current workspace</h3>
          </div>
        </div>
        <div className="billing-usage__grid">
          <span><b>{projectCount}</b> Projects</span>
          <span><b>{groupCount}</b> Task groups</span>
          <span><b>{taskCount}</b> Tasks</span>
          <span><b>{current.status || "free"}</b> Billing status</span>
        </div>
        {current.enforcement_enabled ? (
          <p>Free limits are enforced by the API. Pro removes those limits.</p>
        ) : (
          <p>Free limits are visible but not enforced yet. Turn on enforcement when you are ready to sell publicly.</p>
        )}
      </section>
    </div>
  );
}

function copilotOperationPreview(operation = {}) {
  const changes = operation.changes || {};
  if (operation.type === "create-task") {
    return {
      action: "Add task",
      title: operation.name || "Untitled task",
      meta: [operation.groupName, operation.dueDate ? `Due ${formatDate(operation.dueDate)}` : null, operation.priority].filter(Boolean),
      tone: "add",
    };
  }
  if (operation.type === "create-group") {
    return { action: "Add group", title: operation.name || "New task group", meta: [], tone: "add" };
  }
  if (operation.type === "delete-task") {
    return { action: "Delete task", title: operation.taskName || "Task", meta: [], tone: "danger" };
  }
  if (operation.type === "delete-group") {
    return {
      action: "Delete group",
      title: operation.groupName || "Task group",
      meta: operation.taskCount ? [`Includes ${operation.taskCount} task${operation.taskCount === 1 ? "" : "s"}`] : [],
      tone: "danger",
    };
  }
  if (operation.type === "update-task") {
    const detail = changes.status
      ? `Status → ${changes.status}`
      : changes.priority
        ? `Priority → ${changes.priority}`
        : changes.due_date
          ? `Due → ${formatDate(changes.due_date)}`
          : changes.name
            ? `Rename → ${changes.name}`
            : "Update task details";
    return { action: "Update task", title: operation.taskName || "Task", meta: [detail], tone: "update" };
  }
  if (operation.type === "bulk-update") {
    return {
      action: "Bulk update",
      title: `${operation.taskCount || operation.taskIds?.length || 0} tasks`,
      meta: [operation.groupName, changes.status ? `Status → ${changes.status}` : null].filter(Boolean),
      tone: "update",
    };
  }
  if (operation.type === "bulk-delete-tasks" || operation.type === "bulk-delete-groups") {
    const count = operation.taskCount || operation.groupCount || 0;
    return { action: "Bulk delete", title: `${count} item${count === 1 ? "" : "s"}`, meta: [operation.groupName].filter(Boolean), tone: "danger" };
  }
  if (operation.type === "create-board") {
    return { action: "Add project", title: operation.name || "New project", meta: [], tone: "add" };
  }
  return { action: "Board change", title: describeAssistantOperation(operation), meta: [], tone: "update" };
}

function CopilotPlanPreview({ operations = [] }) {
  const visible = operations.slice(0, 6);
  return (
    <div className="copilot-plan-list" aria-label="Proposed changes">
      {visible.map((operation, index) => {
        const preview = copilotOperationPreview(operation);
        return (
          <div className={cls("copilot-plan-item", `copilot-plan-item--${preview.tone}`)} key={`${operation.type}-${operation.taskId || operation.groupId || operation.name || index}-${index}`}>
            <span className="copilot-plan-item__number">{index + 1}</span>
            <span className="copilot-plan-item__body">
              <small>{preview.action}</small>
              <strong>{preview.title}</strong>
              {preview.meta.length ? <span>{preview.meta.join(" · ")}</span> : null}
            </span>
          </div>
        );
      })}
      {operations.length > visible.length ? <small className="copilot-plan-list__more">+{operations.length - visible.length} more changes</small> : null}
    </div>
  );
}

function copilotConfirmLabel(plan) {
  const operations = plan?.operations || [];
  const allTasks = operations.length && operations.every((operation) => operation.type === "create-task");
  if (allTasks) return `Add ${operations.length} task${operations.length === 1 ? "" : "s"}`;
  if (operations.length === 1 && operations[0].type === "create-group") return "Create task group";
  return `Apply ${operations.length} change${operations.length === 1 ? "" : "s"}`;
}

function TaskCopilotPanel({
  board,
  boards,
  currentUser,
  users,
  onCreateTask,
  onUpdateTask,
  onDeleteTask,
  onCreateBoard,
  onUpdateBoard,
  onDeleteBoard,
  onCreateGroup,
  onUpdateGroup,
  onDeleteGroup,
  onCreateField,
  onPlanCopilot,
  onAfterPlan,
  isMobile,
}) {
  const [draft, setDraft] = useState("");
  const [history, setHistory] = useState([]);
  const [pendingPlan, setPendingPlan] = useState(null);
  const [voiceReplies, setVoiceReplies] = useState(true);
  const [listening, setListening] = useState(false);
  const [running, setRunning] = useState(false);
  const [showExamples, setShowExamples] = useState(false);
  const recognitionRef = useRef(null);
  const recentActionsRef = useRef([]);
  const samplePrompts = isMobile
    ? [
        "I need milk eggs bread",
        "I handled trainer schedule",
        "Move flyer to Friday",
      ]
    : [
        "I need groceries milk eggs bread",
        "Clear completed tasks in shopping",
        "Push trainer schedule to Friday",
        "Make flyer urgent",
        "Create a Natasha group with call list, flyers, and schedule",
        "What should I handle first?",
      ];
  const visibleHistory = isMobile ? history.slice(-4) : history;
  const showThread = history.length > 1;

  useEffect(() => {
    setHistory([
      {
        role: "assistant",
        text: `I'm watching ${board?.name || "this board"}. Talk naturally: quick thoughts, messy voice notes, and shorthand are fine. I remember what I just proposed or changed, so follow-ups like "remove those items" work. I will ask before I change anything.`,
      },
    ]);
    setPendingPlan(null);
    setDraft("");
    setShowExamples(false);
    recentActionsRef.current = [];
  }, [board?.id]);

  useEffect(() => {
    return () => {
      recognitionRef.current?.stop?.();
      if (typeof window !== "undefined" && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  function appendMessage(role, text, kind = "") {
    setHistory((current) => [...current, { role, text, kind }]);
  }

  function speak(text) {
    if (!voiceReplies || typeof window === "undefined" || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(String(text || "").replace(/\s+/g, " ").trim());
    utterance.rate = 1;
    utterance.pitch = 1;
    window.speechSynthesis.speak(utterance);
  }

  function reply(text, { kind = "" } = {}) {
    appendMessage("assistant", text, kind);
    speak(text);
  }

  function handleCancelPlan() {
    setPendingPlan(null);
    reply("Okay, I canceled that request. Tell me the next change you want me to line up.");
  }

  async function executePlan(plan) {
    if (!plan?.operations?.length) return;
    setRunning(true);
    try {
      let activeGroup = null;
      const createdGroups = new Map();
      const results = [];
      const executedOperations = [];

      for (const operation of plan.operations) {
        if (operation.type === "create-board") {
          const nextBoard = await onCreateBoard({
            name: operation.name,
            description: operation.description || "",
            department: operation.department || currentUser?.department || "General",
            color: operation.color || board.color || "#3156f5",
          });
          if (nextBoard) {
            results.push(`Created project "${nextBoard.name}".`);
            executedOperations.push({ ...operation, boardId: nextBoard.id, boardName: nextBoard.name });
          }
          continue;
        }

        if (operation.type === "update-board") {
          await onUpdateBoard(operation.changes, operation.boardId);
          results.push(`Updated project "${operation.boardName}".`);
          executedOperations.push(operation);
          continue;
        }

        if (operation.type === "delete-board") {
          const result = await onDeleteBoard(operation.boardId);
          if (result?.deleted) {
            results.push(`Deleted project "${operation.boardName}".`);
            executedOperations.push(operation);
          }
          continue;
        }

        if (operation.type === "delete-group") {
          const result = await onDeleteGroup(operation.groupId);
          if (result?.deleted) {
            results.push(`Deleted task group "${operation.groupName}".`);
            executedOperations.push(operation);
          }
          activeGroup = null;
          continue;
        }

        if (operation.type === "bulk-delete-groups") {
          let deletedTasks = 0;
          for (const groupId of operation.groupIds || []) {
            const result = await onDeleteGroup(groupId);
            deletedTasks += Number(result?.deleted_tasks || 0);
          }
          results.push(`Deleted ${operation.groupCount} task group${operation.groupCount === 1 ? "" : "s"}${deletedTasks ? ` and ${deletedTasks} task${deletedTasks === 1 ? "" : "s"}` : ""}.`);
          executedOperations.push(operation);
          activeGroup = null;
          continue;
        }

        if (operation.type === "create-group") {
          const group = await onCreateGroup(operation.name, operation.color || board.color || "#3156f5", operation.mode || operation.displayMode || "auto");
          if (group) {
            createdGroups.set(normalizePhrase(operation.name), group);
            activeGroup = group;
            results.push(`Created task group "${group.name}".`);
            executedOperations.push({ ...operation, groupId: group.id, groupName: group.name });
          }
          continue;
        }

        if (operation.type === "update-group") {
          await onUpdateGroup(operation.groupId, operation.changes);
          results.push(`Updated task group "${operation.groupName}".`);
          executedOperations.push(operation);
          continue;
        }

        if (operation.type === "create-field") {
          await onCreateField({
            name: operation.name,
            type: operation.fieldType,
          });
          results.push(`Created ${operation.fieldType} column "${operation.name}".`);
          executedOperations.push(operation);
          continue;
        }

        if (operation.type === "create-task") {
          const targetGroup =
            (operation.groupId && (board.groups || []).find((entry) => Number(entry.id) === Number(operation.groupId))) ||
            (operation.groupName && findGroupMention(board, operation.groupName)) ||
            (operation.groupName && createdGroups.get(normalizePhrase(operation.groupName))) ||
            activeGroup ||
            board.groups?.[0];
          if (!targetGroup) continue;

          const task = await onCreateTask(targetGroup.id, operation.name, {
            status: operation.status || "Pending",
            due_date: operation.dueDate || null,
            notes: operation.notes || "",
            owner_id: operation.ownerId ?? currentUser?.id ?? null,
            priority: operation.priority || "Medium",
          });
          activeGroup = targetGroup;
          results.push(`Created "${task?.name || operation.name}" in ${targetGroup.name}.`);
          if (task) {
            executedOperations.push({
              ...operation,
              taskId: task.id,
              taskName: task.name || operation.name,
              groupId: targetGroup.id,
              groupName: targetGroup.name,
            });
          }
          continue;
        }

        if (operation.type === "delete-task") {
          const result = await onDeleteTask(operation.taskId);
          if (result?.deleted) {
            results.push(`Deleted "${operation.taskName}".`);
            executedOperations.push(operation);
          }
          continue;
        }

        if (operation.type === "bulk-delete-tasks") {
          for (const taskId of operation.taskIds || []) {
            await onDeleteTask(taskId);
          }
          results.push(`Deleted ${operation.taskCount} task${operation.taskCount === 1 ? "" : "s"}${operation.groupName ? ` in ${operation.groupName}` : ""}.`);
          executedOperations.push(operation);
          continue;
        }

        if (operation.type === "update-task") {
          await onUpdateTask(operation.taskId, operation.changes);
          results.push(`${sentenceCase(operation.taskName)} updated.`);
          executedOperations.push(operation);
          continue;
        }

        if (operation.type === "bulk-update") {
          for (const taskId of operation.taskIds || []) {
            await onUpdateTask(taskId, operation.changes);
          }
          results.push(`Updated ${operation.taskCount} task${operation.taskCount === 1 ? "" : "s"}${operation.groupName ? ` in ${operation.groupName}` : ""}.`);
          executedOperations.push(operation);
        }
      }

      recentActionsRef.current = rememberExecutedOperations(recentActionsRef.current, executedOperations);
      setPendingPlan(null);
      reply(results.length ? spokenJoin(results) : "Done. I made the requested changes.");
      onAfterPlan?.();
    } catch (error) {
      reply(error?.message || "I could not finish that change.");
    } finally {
      setRunning(false);
    }
  }

  async function submitMessage(rawMessage) {
    const message = String(rawMessage || "").trim();
    if (!message || running) return;
    appendMessage("user", message);
    setDraft("");

    if (pendingPlan && isApprovalOnlyMessage(message)) {
      reply("Working on it.");
      executePlan(pendingPlan);
      return;
    }

    if (pendingPlan && isCancelOnlyMessage(message)) {
      handleCancelPlan();
      return;
    }

    const conversationContext = buildCopilotConversationContext({
      history: [...history, { role: "user", text: message }],
      pendingPlan,
      recentActions: recentActionsRef.current,
    });
    const complexTurn = isComplexCopilotTurn(message);
    const contextualPlan = buildContextualCopilotPlan(
      message,
      board,
      currentUser,
      recentActionsRef.current,
      pendingPlan
    );

    if (contextualPlan?.contextAction === "replace-pending") {
      setPendingPlan(contextualPlan.mode === "proposal" ? contextualPlan : null);
      reply(contextualPlan.message);
      return;
    }

    let plan = contextualPlan;
    if (!plan) {
      setRunning(true);
      try {
        plan = await onPlanCopilot?.(message, conversationContext);
      } catch {
        plan = null;
      } finally {
        setRunning(false);
      }
    }
    const localPlan = buildAssistantPlan(message, board, currentUser, { users, boards, conversation: conversationContext });
    if (complexTurn && plan?.source !== "ai") {
      plan = {
        mode: "answer",
        needsClarification: true,
        message:
          "I heard several different changes in that sentence, and I don't want to flatten them into the wrong action. My full planner isn't available right now, so try again in a moment or send the changes one at a time.",
        operations: [],
      };
    } else {
      const canReplaceAnswerWithFallback = plan?.source !== "ai" && plan?.mode === "answer" && localPlan?.mode === "proposal";
      if (!plan || canReplaceAnswerWithFallback || shouldPreferDictationPlan(plan, localPlan)) {
        plan = localPlan;
      }
    }
    if (plan.mode === "proposal") {
      setPendingPlan(plan);
      reply(plan.message);
      return;
    }

    reply(plan.message, { kind: plan.needsClarification ? "uncertain" : "" });
  }

  async function handleSubmit(event) {
    event.preventDefault();
    await submitMessage(draft);
  }

  function beginListening() {
    if (typeof window === "undefined") return;
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      reply("Voice input is not available in this browser, but the copilot still works with text.");
      return;
    }

    if (listening) {
      recognitionRef.current?.stop?.();
      setListening(false);
      return;
    }

    recognitionRef.current?.stop?.();
    const recognition = new SpeechRecognition();
    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => setListening(true);
    recognition.onend = () => setListening(false);
    recognition.onerror = () => {
      setListening(false);
      reply("I heard the mic fail. Try the text box or tap the mic again.");
    };
    recognition.onresult = (event) => {
      const transcript = Array.from(event.results || [])
        .map((result) => result[0]?.transcript || "")
        .join(" ")
        .trim();
      if (!transcript) return;
      setDraft("");
      void submitMessage(transcript);
    };

    recognitionRef.current = recognition;
    recognition.start();
  }

  return (
    <section className={cls("panel copilot-panel", isMobile && "copilot-panel--mobile")}>
      <div className="copilot-panel__head">
        <div>
          <span className="eyebrow">AI</span>
          <h3>Copilot</h3>
        </div>

        <div className="copilot-panel__controls">
          <button type="button" className={cls("ghost-button", showExamples && "ghost-button--active")} onClick={() => setShowExamples((current) => !current)}>
            {showExamples ? "Hide examples" : "Examples"}
          </button>
          {!isMobile ? (
            <button type="button" className={cls("ghost-button", voiceReplies && "ghost-button--active")} onClick={() => setVoiceReplies((current) => !current)}>
              {voiceReplies ? "Spoken replies on" : "Spoken replies off"}
            </button>
          ) : null}
          <button type="button" className={cls("ghost-button", listening && "ghost-button--active")} onClick={beginListening} disabled={running}>
            {listening ? (isMobile ? "Listening..." : "Stop voice input") : isMobile ? "Talk" : "Start voice input"}
          </button>
        </div>
      </div>

      <p className="copilot-panel__lead">
        Talk naturally. I can build task groups, turn voice notes into tasks, and remember what we just discussed when you say things like "remove those," "make them urgent," or "add this to that list."
      </p>
      {isMobile ? (
        <p className="copilot-panel__mobile-hint">Follow up naturally. I will keep the context and ask before changing the board.</p>
      ) : null}

      {showExamples ? (
        <div className="copilot-panel__chips">
          {samplePrompts.map((prompt) => (
          <button key={prompt} type="button" className="copilot-chip" onClick={() => setDraft(prompt)}>
            {prompt}
          </button>
          ))}
        </div>
      ) : null}

      {showThread ? (
        <div className="copilot-thread">
        {visibleHistory.map((entry, index) => (
          <article key={`${entry.role}-${index}`} className={cls("copilot-bubble", `copilot-bubble--${entry.role}`, entry.kind && `copilot-bubble--${entry.kind}`)}>
            <strong>{entry.role === "assistant" ? "Copilot" : "You"}</strong>
            <p>{entry.text}</p>
          </article>
        ))}
        </div>
      ) : null}

      {pendingPlan ? (
        <div className="copilot-confirm">
          <div className="copilot-confirm__head">
            <div>
              <span className="copilot-confirm__eyebrow">Ready for review</span>
              <strong>{pendingPlan.operations.length} proposed change{pendingPlan.operations.length === 1 ? "" : "s"}</strong>
            </div>
            <small>Say yes to apply, or keep talking to change this draft</small>
          </div>
          {pendingPlan.warnings?.length ? (
            <p className="copilot-confirm__warning">{pendingPlan.warnings[0]}</p>
          ) : pendingPlan.skippedFragments?.length ? (
            <p className="copilot-confirm__warning">
              I left out “{pendingPlan.skippedFragments[0]}” because it sounded unfinished. Send the rest when you are ready.
            </p>
          ) : null}
          <CopilotPlanPreview operations={pendingPlan.operations} />
          <div className="copilot-confirm__actions">
            <button type="button" onClick={() => executePlan(pendingPlan)} disabled={running}>
              {running ? "Working..." : copilotConfirmLabel(pendingPlan)}
            </button>
            <button type="button" className="ghost-button" onClick={handleCancelPlan} disabled={running}>
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      <form className="copilot-compose" onSubmit={handleSubmit}>
        <textarea
          rows={isMobile ? 2 : 3}
          value={draft}
          placeholder={isMobile ? 'Say: "I handled trainer schedule"' : 'Example: "Push trainer schedule to Friday and make flyer urgent."'}
          onChange={(event) => setDraft(event.target.value)}
        />
        <button type="submit" disabled={!draft.trim() || running}>
          {running ? "Working..." : isMobile ? "Send" : "Send to copilot"}
        </button>
      </form>
    </section>
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
        <small>{remainingSlots ? `Paste, drag, or upload - ${screenshots.length}/${MAX_NOTE_SCREENSHOTS}` : `Screenshot limit reached - ${MAX_NOTE_SCREENSHOTS}/${MAX_NOTE_SCREENSHOTS}`}</small>
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

  const rowStatus = task.status || visualStatus(task);

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
        <select className={cls("cell-select", `cell-select--${tone(task.status || rowStatus)}`)} value={task.status} onChange={(event) => saveField("status", event.target.value)}>
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

function MobileTaskCard({ task, board, users, onUpdateTask, group, groupMode }) {
  const [detailsOpen, setDetailsOpen] = useState(false);

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

  const rowStatus = task.status || visualStatus(task);
  const isDone = rowStatus === "Done";
  const isChecklistGroup = groupMode === "checklist" || normalizePhrase(group?.name) === normalizePhrase(SHOPPING_LIST_GROUP_NAME);
  const isNotesGroup = groupMode === "notes";
  const hasNotes = Boolean(String(task.notes || "").trim()) || Boolean(task.screenshots?.length);
  const owner = users.find((user) => Number(user.id) === Number(task.owner_id));
  const hasCustomFields = Boolean(board.fields?.length);
  const showDetailsButton = !isChecklistGroup || hasNotes || task.due_date || hasCustomFields || detailsOpen;

  function toggleDone() {
    saveField("status", isDone ? "Pending" : "Done");
  }

  return (
    <article className={cls("mobile-task-card", `mobile-task-card--${tone(rowStatus)}`)}>
      <div className="mobile-task-card__summary-row">
        <button
          type="button"
          className={cls("mobile-task-card__check", isDone && "is-done")}
          aria-label={isDone ? "Mark task pending" : "Mark task done"}
          onClick={toggleDone}
        >
          {isDone ? "✓" : ""}
        </button>
        <input className="cell-input cell-input--task" defaultValue={task.name} onBlur={(event) => saveField("name", event.target.value.trim())} />
        {showDetailsButton ? (
          <button type="button" className="mobile-task-card__details-toggle" onClick={() => setDetailsOpen((current) => !current)}>
            {detailsOpen ? "Hide" : isChecklistGroup ? "Note" : "Details"}
          </button>
        ) : null}
      </div>

      {!isChecklistGroup || rowStatus !== "Pending" || task.due_date || hasNotes ? (
        <div className="mobile-task-card__meta-line">
          {!isChecklistGroup || rowStatus !== "Pending" ? <span className={cls("pill", `pill--${tone(rowStatus)}`)}>{rowStatus}</span> : null}
          {task.due_date ? <span>{formatDate(task.due_date)}</span> : null}
          {owner && !isChecklistGroup ? <span>{owner.name}</span> : null}
          {hasNotes ? <span>Notes</span> : null}
        </div>
      ) : null}

      {detailsOpen ? (
      <div className={cls("mobile-task-card__grid", (isChecklistGroup || isNotesGroup) && "mobile-task-card__grid--simple")}>
        {isChecklistGroup || isNotesGroup ? (
          <>
            <label>
              <span>Status</span>
              <select className={cls("cell-select", `cell-select--${tone(task.status || rowStatus)}`)} value={task.status} onChange={(event) => saveField("status", event.target.value)}>
                {STATUS_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>

            {!isChecklistGroup ? (
              <label>
                <span>Due</span>
                <input className="cell-input cell-input--date" type="date" value={task.due_date || ""} onChange={(event) => saveField("due_date", event.target.value)} />
              </label>
            ) : null}

            <div className="mobile-task-card__full mobile-task-card__section">
              <span>Notes</span>
              <TaskNotesField task={task} onUpdateTask={onUpdateTask} compact />
            </div>
          </>
        ) : (
          <>
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
          <select className={cls("cell-select", `cell-select--${tone(task.status || rowStatus)}`)} value={task.status} onChange={(event) => saveField("status", event.target.value)}>
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
          <TaskNotesField task={task} onUpdateTask={onUpdateTask} compact />
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
          </>
        )}
      </div>
      ) : null}
    </article>
  );
}

function ProjectBoard({
  board,
  boards,
  currentUser,
  users,
  onUpdateTask,
  onDeleteTask,
  onCreateTask,
  onCreateBoard,
  onDeleteBoard,
  onCreateGroup,
  onUpdateGroup,
  onDeleteGroup,
  onCreateField,
  onUpdateBoard,
  onPlanCopilot,
  onAfterPlan,
  isMobile,
}) {
  const [search, setSearch] = useState("");
  const [mineOnly, setMineOnly] = useState(false);
  const [quickTasks, setQuickTasks] = useState({});
  const [groupDraft, setGroupDraft] = useState({ name: "", color: "#3156f5", mode: "auto" });
  const [showColumnForm, setShowColumnForm] = useState(false);
  const [columnDraft, setColumnDraft] = useState({ name: "", type: "text" });
  const [columnWidths, setColumnWidths] = useState(() => loadColumnWidths(board));
  const [groupPrefs, setGroupPrefs] = useState(() => loadGroupPrefs(board));
  const [showBoardEditor, setShowBoardEditor] = useState(false);
  const [boardDraft, setBoardDraft] = useState(() => ({
    name: board?.name || "",
    description: board?.description || "",
    department: board?.department || "General",
    color: board?.color || "#3156f5",
  }));
  const [editingGroupId, setEditingGroupId] = useState(null);
  const [groupEditDrafts, setGroupEditDrafts] = useState({});
  const [collapsedGroups, setCollapsedGroups] = useState({});

  useEffect(() => {
    setSearch("");
    setMineOnly(false);
    setQuickTasks({});
    setGroupDraft({ name: "", color: board?.color || "#3156f5", mode: "auto" });
    setShowColumnForm(false);
    setColumnDraft({ name: "", type: "text" });
    setColumnWidths(loadColumnWidths(board));
    setGroupPrefs(loadGroupPrefs(board));
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
    if (!board?.groups?.length) {
      setCollapsedGroups({});
      return;
    }

    setCollapsedGroups((current) => {
      const next = {};
      board.groups.forEach((group) => {
        next[group.id] = typeof current[group.id] === "boolean" ? current[group.id] : isMobile ? true : false;
      });
      return next;
    });
  }, [board?.id, board?.groups?.length, isMobile]);

  useEffect(() => {
    if (!board?.id) return;
    persistColumnWidths(board.id, columnWidths);
  }, [board?.id, columnWidths]);

  useEffect(() => {
    if (!board?.id) return;
    persistGroupPrefs(board.id, groupPrefs);
  }, [board?.id, groupPrefs]);

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
    onCreateGroup(name, groupDraft.color, groupDraft.mode).then((group) => {
      if (group?.id && groupDraft.mode !== "auto") {
        setGroupPrefs((current) => ({
          ...current,
          [group.id]: { ...(current[group.id] || {}), mode: groupDraft.mode },
        }));
      }
    });
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
    setCollapsedGroups((current) => ({ ...current, [group.id]: false }));
    setGroupEditDrafts((current) => ({
      ...current,
      [group.id]: {
        name: group.name || "",
        color: group.color || board.color || "#3156f5",
        mode: groupPrefs[group.id]?.mode || group.mode || group.type || "auto",
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
      mode: draft.mode || "auto",
    });
    setGroupPrefs((current) => ({
      ...current,
      [group.id]: {
        ...(current[group.id] || {}),
        mode: draft.mode || "auto",
      },
    }));
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

  function toggleGroupCollapsed(groupId) {
    setCollapsedGroups((current) => ({
      ...current,
      [groupId]: !current[groupId],
    }));
  }

  return (
    <div className="project-board">
      <TaskCopilotPanel
        board={board}
        boards={boards}
        currentUser={currentUser}
        users={users}
        onCreateTask={onCreateTask}
        onUpdateTask={onUpdateTask}
        onDeleteTask={onDeleteTask}
        onCreateBoard={onCreateBoard}
        onUpdateBoard={onUpdateBoard}
        onDeleteBoard={onDeleteBoard}
        onCreateGroup={onCreateGroup}
        onUpdateGroup={onUpdateGroup}
        onDeleteGroup={onDeleteGroup}
        onCreateField={onCreateField}
        onPlanCopilot={onPlanCopilot}
        onAfterPlan={onAfterPlan}
        isMobile={isMobile}
      />

      <section className={cls("board-hero", `board-hero--${tone(boardTone(board))}`)}>
        <div className="board-hero__summary">
          <span className="eyebrow">{board.department}</span>
          <h2>{board.name}</h2>
          <p>{board.description || "Tasks, dates, notes, and owners in one place."}</p>
        </div>

        <div className="board-hero__controls">
          <input className="search" placeholder={isMobile ? "Search" : "Search tasks or notes"} value={search} onChange={(event) => setSearch(event.target.value)} />

          <button type="button" className={cls("toggle-chip", mineOnly && "is-active")} onClick={() => setMineOnly((current) => !current)}>
            {mineOnly ? (isMobile ? "Mine" : "Only mine") : isMobile ? "All" : "All tasks"}
          </button>

          <button
            type="button"
            className={cls("ghost-button", "ghost-button--icon", showBoardEditor && "ghost-button--active")}
            aria-label={showBoardEditor ? "Close project editor" : "Edit project"}
            title={showBoardEditor ? "Close project editor" : "Edit project"}
            onClick={() => setShowBoardEditor((current) => !current)}
          >
            <PencilIcon />
          </button>

          <button type="button" className="plus-button" onClick={() => setShowColumnForm((current) => !current)}>
            {showColumnForm ? (isMobile ? "Columns" : "Close columns") : isMobile ? "+ Column" : "+ Add Column"}
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

      <section className="task-zone">
        <div className="task-zone__head">
          <div>
            <span className="eyebrow">Task groups</span>
            <h3>Task groups</h3>
          </div>
          <p>Open the group you need and keep the rest collapsed.</p>
        </div>

        <div className="group-stack">
          {board.groups.map((group) => {
          const tasks = visibleTasksForGroup(group.id);
          const allTasks = sortTasks(board.tasks.filter((task) => task.group_id === group.id));
          const collapsed = Boolean(collapsedGroups[group.id]);
          const visibleLabel =
            tasks.length === allTasks.length ? `${allTasks.length} task${allTasks.length === 1 ? "" : "s"}` : `${tasks.length} shown of ${allTasks.length}`;
          const groupStatusCounts = STATUS_OPTIONS.map((status) => ({
            status,
            count: allTasks.filter((task) => visualStatus(task) === status).length,
          })).filter((entry) => entry.count);
          const groupDraftValue = groupEditDrafts[group.id] || {
            name: group.name || "",
            color: group.color || board.color || "#3156f5",
            mode: groupPrefs[group.id]?.mode || group.mode || group.type || "auto",
          };
          const displayMode = groupDisplayMode(group, groupPrefs);
          return (
              <section
                key={group.id}
                className={cls("group-card", collapsed && "group-card--collapsed")}
                style={{ "--group-accent": group.color || board.color || "#3156f5" }}
              >
              <div className="group-card__head">
                <button
                  type="button"
                  className="group-collapse-button"
                  aria-expanded={!collapsed}
                  aria-label={`${collapsed ? "Expand" : "Collapse"} ${group.name}`}
                  onClick={() => toggleGroupCollapsed(group.id)}
                >
                  <span className="group-collapse-button__chevron" aria-hidden="true">
                    {collapsed ? ">" : "v"}
                  </span>
                  <div className="group-card__meta">
                    <h3>{group.name}</h3>
                    <small>{visibleLabel} - {groupModeLabel(displayMode)}</small>
                  </div>
                </button>

                <div className="group-card__actions">
                  <div className="group-card__swatch" style={{ "--group-swatch": group.color || board.color || "#3156f5" }} />
                  <button type="button" className={cls("ghost-button", editingGroupId === group.id && "ghost-button--active")} onClick={() => openGroupEditor(group)}>
                    {editingGroupId === group.id ? (isMobile ? "Editing" : "Editing group") : isMobile ? "Edit" : "Edit group"}
                  </button>
                </div>
              </div>

              <div className="group-card__summary">
                {groupStatusCounts.length ? (
                  groupStatusCounts.map((entry) => (
                    <span key={`${group.id}-${entry.status}`} className={cls("group-card__summary-item", `group-card__summary-item--${tone(entry.status)}`)}>
                      {entry.count} {entry.status}
                    </span>
                  ))
                ) : (
                  <span className="group-card__summary-item group-card__summary-item--empty">No tasks yet</span>
                )}
                <span className="group-card__summary-item group-card__summary-item--mode">{groupModeLabel(displayMode)} mode</span>
              </div>

              {!collapsed ? (
                <div className="group-card__body">
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
                      <label>
                        <span>Display mode</span>
                        <select
                          value={groupDraftValue.mode || "auto"}
                          onChange={(event) =>
                            setGroupEditDrafts((current) => ({
                              ...current,
                              [group.id]: { ...groupDraftValue, mode: event.target.value },
                            }))
                          }
                        >
                          {GROUP_MODE_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <div className="group-editor__actions">
                        <button type="button" className="ghost-button ghost-button--danger" onClick={() => window.confirm(`Delete "${group.name}" and its tasks?`) && onDeleteGroup(group.id)}>
                          Delete
                        </button>
                        <button type="button" className="ghost-button" onClick={() => setEditingGroupId(null)}>
                          Cancel
                        </button>
                        <button type="submit">Save group</button>
                      </div>
                    </form>
                  ) : null}

                  {isMobile || displayMode === "checklist" ? (
                    <div className="mobile-task-list">
                      {tasks.map((task) => (
                        <MobileTaskCard key={task.id} task={task} board={board} group={group} groupMode={displayMode} users={users} onUpdateTask={onUpdateTask} />
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
                </div>
              ) : null}
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
          <label>
            <span>Mode</span>
            <select value={groupDraft.mode} onChange={(event) => setGroupDraft((current) => ({ ...current, mode: event.target.value }))}>
              {GROUP_MODE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <button type="submit">+ Add Task Group</button>
        </form>
      </section>
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
    activity: [],
    billing: null,
  });
  const [session, setSession] = useState(() => loadSession());
  const [theme, setTheme] = useState(() => loadTheme());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [selectedBoardId, setSelectedBoardId] = useState(null);
  const [page, setPage] = useState("dashboard");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginUsername, setLoginUsername] = useState(DEFAULT_LOGIN_USERNAME);
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

  async function refreshWorkspace() {
    try {
      const next = await getBootstrap();
      setData(next);
      return next;
    } catch (refreshError) {
      setError(refreshError.message || "Unable to refresh workspace");
      return null;
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
  const firstVisibleBoardId = visibleBoards[0]?.id || null;
  const activeBoard = useMemo(
    () => visibleBoards.find((board) => Number(board.id) === Number(selectedBoardId)) || visibleBoards[0] || null,
    [visibleBoards, selectedBoardId]
  );
  const quickLoginUsers = useMemo(
    () =>
      data.users.filter(
        (user) =>
          user.active !== false &&
          user.username &&
          (user.quick_login === true || normalizePhrase(user.username) === normalizePhrase(DEFAULT_LOGIN_USERNAME))
      ),
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
    if (!isMobile || !currentUser || page !== "dashboard" || !firstVisibleBoardId) return;
    setSelectedBoardId((current) => current || firstVisibleBoardId);
    setPage("project");
  }, [isMobile, currentUser?.id, page, firstVisibleBoardId]);

  useEffect(() => {
    if (currentUser) setProjectForm(blankProject(currentUser));
  }, [currentUser?.id]);

  useEffect(() => {
    if (!isAdmin && page === "admin") setPage("dashboard");
  }, [isAdmin, page]);

  useEffect(() => {
    if (!currentUser || typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (!params.has("billing")) return;
    setPage("billing");
    refreshWorkspace();
    window.history.replaceState({}, "", window.location.pathname);
  }, [currentUser?.id]);

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
      const firstUserBoard = relevantBoards(data.boards, response.user)[0] || null;
      saveSession(nextSession);
      setSession(nextSession);
      if (firstUserBoard) setSelectedBoardId(firstUserBoard.id);
      setPage(isMobile && firstUserBoard ? "project" : "dashboard");
      setLoginPassword("");
      setLoginUsername(DEFAULT_LOGIN_USERNAME);
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
    setLoginUsername(DEFAULT_LOGIN_USERNAME);
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
    const previewUser = data.users.find((user) => Number(user.id) === Number(userId)) || null;
    const firstPreviewBoard = relevantBoards(data.boards, previewUser)[0] || null;
    const nextSession = { user_id: Number(userId), admin_user_id: Number(currentUser.id) };
    saveSession(nextSession);
    setSession(nextSession);
    if (firstPreviewBoard) setSelectedBoardId(firstPreviewBoard.id);
    setPage(isMobile && firstPreviewBoard ? "project" : "dashboard");
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

  function scrollToWorkspaceSection(selector) {
    if (typeof window === "undefined") return;
    requestAnimationFrame(() => {
      const target = document.querySelector(selector);
      target?.scrollIntoView({ behavior: "smooth", block: "start" });
      target?.querySelector?.("textarea,input,button")?.focus?.({ preventScroll: true });
    });
  }

  function openMobileCopilot() {
    navigateTo("project");
    scrollToWorkspaceSection(".copilot-panel");
  }

  function openMobileQuickAdd() {
    navigateTo("project");
    scrollToWorkspaceSection(".add-task-inline--mobile, .add-task-inline");
  }

  async function handlePlanCopilot(message, context = {}) {
    if (!activeBoard || !currentUser) return null;
    const plan = await planCopilot({
      message,
      board_id: activeBoard.id,
      user_id: currentUser.id,
      context,
    });
    return plan?.mode ? plan : null;
  }

  async function handleUndoActivity(activityId = null) {
    setBusy(activityId ? `undo-${activityId}` : "undo-latest");
    setError("");
    try {
      const result = await undoActivity(activityId);
      if (result?.workspace) {
        setData(result.workspace);
      } else {
        await refreshWorkspace();
      }
      return true;
    } catch (undoError) {
      setError(undoError.message || "Unable to undo that change");
      return false;
    } finally {
      setBusy("");
    }
  }

  async function handleStartBillingCheckout() {
    setBusy("billing-checkout");
    setError("");
    try {
      const response = await createBillingCheckout({
        success_url: `${window.location.origin}${window.location.pathname}?billing=success`,
        cancel_url: `${window.location.origin}${window.location.pathname}?billing=cancelled`,
      });
      if (response?.billing) {
        setData((current) => ({ ...current, billing: response.billing }));
      }
      if (response?.url) {
        window.location.assign(response.url);
      } else {
        setError("Stripe did not return a checkout link");
      }
    } catch (billingError) {
      setError(billingError.message || "Unable to start checkout");
    } finally {
      setBusy("");
    }
  }

  async function handleManageBilling() {
    setBusy("billing-portal");
    setError("");
    try {
      const response = await createBillingPortal({
        return_url: `${window.location.origin}${window.location.pathname}?billing=return`,
      });
      if (response?.url) {
        window.location.assign(response.url);
      } else {
        setError("Stripe did not return a billing portal link");
      }
    } catch (billingError) {
      setError(billingError.message || "Unable to open billing portal");
    } finally {
      setBusy("");
    }
  }

  function mutateBoard(boardId, updater) {
    setData((current) => ({
      ...current,
      boards: current.boards.map((board) => (Number(board.id) === Number(boardId) ? updater(board) : board)),
    }));
  }

  async function handleCreateBoard(payload, options = {}) {
    const { openBoard = false, busyKey = "create-project" } = options;
    setBusy(busyKey);
    setError("");
    try {
      const board = await createBoard({
        ...payload,
        name: String(payload.name || "").trim(),
        description: String(payload.description || "").trim(),
        store_id: null,
      });
      setData((current) => ({ ...current, boards: [...current.boards, board] }));
      if (openBoard) {
        setSelectedBoardId(board.id);
        setPage("project");
      }
      return board;
    } catch (submitError) {
      setError(submitError.message || "Unable to create project");
      return null;
    } finally {
      setBusy("");
    }
  }

  async function handleCreateProject(event) {
    event.preventDefault();
    const name = projectForm.name.trim();
    if (!name) return;
    const board = await handleCreateBoard(
      {
        ...projectForm,
        name,
      },
      { openBoard: true, busyKey: "create-project" }
    );
    if (board) {
      setShowProjectForm(false);
      setProjectForm(blankProject(currentUser));
    }
  }

  async function handleUpdateBoard(changes, boardId = activeBoard?.id) {
    if (!boardId) return null;
    setBusy("save-board");
    setError("");
    try {
      const updated = await updateBoard(boardId, changes);
      mutateBoard(boardId, (board) => ({ ...board, ...updated }));
      return updated;
    } catch (submitError) {
      setError(submitError.message || "Unable to update project");
      return null;
    } finally {
      setBusy("");
    }
  }

  async function handleDeleteBoard(boardId) {
    const targetBoardId = Number(boardId);
    if (!targetBoardId) return null;
    setBusy(`delete-board-${targetBoardId}`);
    setError("");
    try {
      const result = await deleteBoard(targetBoardId);
      const remainingBoards = data.boards.filter((board) => Number(board.id) !== targetBoardId);
      setData((current) => ({
        ...current,
        boards: current.boards.filter((board) => Number(board.id) !== targetBoardId),
      }));

      if (Number(selectedBoardId) === targetBoardId) {
        const nextBoard = relevantBoards(remainingBoards, currentUser)[0] || null;
        setSelectedBoardId(nextBoard?.id || null);
        setPage(nextBoard ? "project" : "dashboard");
      }
      return result;
    } catch (submitError) {
      setError(submitError.message || "Unable to delete project");
      return null;
    } finally {
      setBusy("");
    }
  }

  async function handleCreateGroup(name, color, mode = "auto") {
    if (!activeBoard) return;
    setBusy("create-group");
    setError("");
    try {
      const group = await createGroup({ board_id: activeBoard.id, name, color, mode });
      mutateBoard(activeBoard.id, (board) => ({ ...board, groups: [...board.groups, group] }));
      return group;
    } catch (submitError) {
      setError(submitError.message || "Unable to create task group");
      return null;
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
      return updated;
    } catch (submitError) {
      setError(submitError.message || "Unable to update task group");
      return null;
    } finally {
      setBusy("");
    }
  }

  async function handleDeleteGroup(groupId) {
    if (!activeBoard) return null;
    setBusy(`delete-group-${groupId}`);
    setError("");
    try {
      const result = await deleteGroup(activeBoard.id, groupId);
      mutateBoard(activeBoard.id, (board) => ({
        ...board,
        groups: board.groups.filter((group) => Number(group.id) !== Number(groupId)),
        tasks: board.tasks.filter((task) => Number(task.group_id) !== Number(groupId)),
      }));
      return result;
    } catch (submitError) {
      setError(submitError.message || "Unable to delete task group");
      return null;
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

  async function handleCreateTask(groupId, name, overrides = {}) {
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
        ...overrides,
      });
      mutateBoard(activeBoard.id, (board) => ({ ...board, tasks: [...board.tasks, task] }));
      return task;
    } catch (submitError) {
      setError(submitError.message || "Unable to create task");
      return null;
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
      return updated;
    } catch (submitError) {
      setError(submitError.message || "Unable to update task");
      return null;
    }
  }

  async function handleDeleteTask(taskId) {
    if (!activeBoard) return null;
    setBusy(`delete-task-${taskId}`);
    setError("");
    try {
      const result = await deleteTask(activeBoard.id, taskId);
      mutateBoard(activeBoard.id, (board) => ({
        ...board,
        tasks: board.tasks.filter((task) => Number(task.id) !== Number(taskId)),
      }));
      return result;
    } catch (submitError) {
      setError(submitError.message || "Unable to delete task");
      return null;
    } finally {
      setBusy("");
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

  const pageTitle = page === "dashboard" ? "Dashboard" : page === "project" ? activeBoard?.name || "Projects" : page === "billing" ? "Billing" : "Admin";
  const pageCopy =
    page === "dashboard"
      ? isMobile
        ? "Boards and tasks."
        : "Boards, tasks, dates, and notes."
      : page === "project"
        ? isMobile
          ? "Edit the board."
          : "Edit the board directly."
        : page === "billing"
          ? isMobile
            ? "Plan and payment."
            : "Free plan, Pro upgrade, and Stripe billing."
          : isMobile
            ? "Users and access."
            : "Users, access, and preview mode.";

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
          {!isMobile ? (
            <button type="button" className={page === "dashboard" ? "is-active" : ""} onClick={() => navigateTo("dashboard")}>
              Dashboard
            </button>
          ) : null}
          <button type="button" className={page === "project" ? "is-active" : ""} onClick={() => navigateTo("project")}>
            Projects
          </button>
          <button type="button" className={page === "billing" ? "is-active" : ""} onClick={() => navigateTo("billing")}>
            Billing
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
            activity={data.activity || []}
            onUndoActivity={handleUndoActivity}
            busy={busy}
            onOpenBoard={(boardId) => {
              setSelectedBoardId(boardId);
              setPage("project");
            }}
          />
        ) : null}

        {page === "project" ? (
          <ProjectBoard
            board={activeBoard}
            boards={visibleBoards}
            currentUser={currentUser}
            users={data.users.filter((user) => user.active !== false)}
            onUpdateTask={handleUpdateTask}
            onDeleteTask={handleDeleteTask}
            onCreateTask={handleCreateTask}
            onCreateBoard={handleCreateBoard}
            onDeleteBoard={handleDeleteBoard}
            onCreateGroup={handleCreateGroup}
            onDeleteGroup={handleDeleteGroup}
            onUpdateGroup={handleUpdateGroup}
            onCreateField={handleCreateField}
            onUpdateBoard={handleUpdateBoard}
            onPlanCopilot={handlePlanCopilot}
            onAfterPlan={refreshWorkspace}
            isMobile={isMobile}
          />
        ) : null}

        {page === "billing" ? (
          <BillingView
            billing={data.billing}
            boards={visibleBoards}
            busy={busy}
            onStartCheckout={handleStartBillingCheckout}
            onManageBilling={handleManageBilling}
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

      {isMobile ? (
        <nav className="mobile-bottom-nav" aria-label="Mobile workspace shortcuts">
          <button type="button" className={page === "project" ? "is-active" : ""} onClick={() => navigateTo("project")}>
            Boards
          </button>
          <button type="button" onClick={openMobileCopilot}>
            AI
          </button>
          <button type="button" className="mobile-bottom-nav__add" onClick={openMobileQuickAdd}>
            Add
          </button>
          {isAdmin ? (
            <button type="button" className={page === "admin" ? "is-active" : ""} onClick={() => navigateTo("admin")}>
              Admin
            </button>
          ) : (
            <button type="button" className={page === "billing" ? "is-active" : ""} onClick={() => navigateTo("billing")}>
              Billing
            </button>
          )}
        </nav>
      ) : null}
    </div>
  );
}
