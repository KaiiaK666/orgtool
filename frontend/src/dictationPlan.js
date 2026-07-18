const OBLIGATION_PATTERN = /(?:(today|tomorrow|tonight|this\s+week|next\s+week|this\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)|next\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday))\s+)?(?:\b(?:(?:i|we)\s+)?(?:also\s+)?(?:(?:need|have|got|want)\s+(?:you\s+)?to|gotta|should|must)\b|\b(?:remember|remind\s+me|don'?t\s+forget|don'?t\s+let\s+me\s+forget)\s+to\b|\bmake\s+sure\s+(?:i|we)\b|\b(?:can|could|would)\s+you\b)/gi;

const ACTION_VERBS =
  "finish|complete|call|email|text|send|review|update|set up|setup|schedule|check|follow up|submit|record|prepare|create|build|order|buy|get|contact|meet|pay|book|write|read|fix|test|install|configure|launch|close|approve|print|upload|download|do|handle|work on";

const CONNECTED_ACTION_PATTERN = new RegExp(
  `(?:\\s*[,;]\\s*|\\s+(?:and\\s+then|then|and\\s+also|also|and)\\s+)(?=(?:${ACTION_VERBS})\\b)`,
  "gi"
);

const TIME_PATTERN =
  /\b(today|tomorrow|tonight|this\s+week|next\s+week|(?:this|next)\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)|monday|tuesday|wednesday|thursday|friday|saturday|sunday|\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)\b/i;

const ROUTING_ONLY_PATTERN =
  /^(?:add|put|drop|include|save|write)\s+(?:(?:all|these|this|it)\s+)?(?:in|into|on|to)?\s*(?:the\s+)?(?:tasks?|task\s+list|board|project|to\s*do\s*list|todo\s*list)?$/i;

const VAGUE_TASK_PATTERN =
  /^(?:do|finish|complete|update|handle|work\s+on)(?:\s+(?:(?:the|a|an)\s+)?(?:it|that|this|update|updated|thing|stuff|task|item|items))?$/i;

const UNRESOLVED_REFERENCE_PATTERN =
  /^(?:that|this|it|them|those|these|him|her|someone|somebody|something|anything|the\s+(?:thing|stuff|task|item)|another\s+task)$/i;

const UNRESOLVED_OBJECT_PATTERN =
  /^(?:call|email|text|contact|meet|message|ask|tell|send(?:\s+(?:it|that|this))?\s+to)\s+(?:him|her|them|it|that|this|someone|somebody)\b/i;

const AMBIGUOUS_CHOICE_PATTERN = new RegExp(
  `^(?:${ACTION_VERBS})\\b.{0,60}\\s+or\\s+(?:${ACTION_VERBS})\\b`,
  "i"
);

const META_TASK_PATTERN =
  /\b(?:add|create|make|write|put)\s+(?:(?:me|us)\s+)?(?:(?:another|a|an|new)\s+)?tasks?\b/i;

function sentenceCase(value = "") {
  const text = String(value || "").trim();
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : "";
}

function normalize(value = "") {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function pad(value) {
  return String(value).padStart(2, "0");
}

function isoDate(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function addDays(date, count) {
  const next = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  next.setDate(next.getDate() + count);
  return next;
}

function endOfWorkWeek(now, nextWeek = false) {
  const day = now.getDay();
  let delta = day <= 5 ? 5 - day : 7 - day;
  if (nextWeek) delta += 7;
  return isoDate(addDays(now, delta));
}

export function parseDateLabel(label = "", now = new Date()) {
  const text = String(label || "").trim().toLowerCase();
  if (!text) return null;
  if (text === "today" || text === "tonight") return isoDate(now);
  if (text === "tomorrow") return isoDate(addDays(now, 1));
  if (text === "this week") return endOfWorkWeek(now, false);
  if (text === "next week") return endOfWorkWeek(now, true);
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;

  const slash = text.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);
  if (slash) {
    const year = slash[3] ? Number(slash[3].length === 2 ? `20${slash[3]}` : slash[3]) : now.getFullYear();
    return isoDate(new Date(year, Number(slash[1]) - 1, Number(slash[2])));
  }

  const weekday = text.match(/^(?:(this|next)\s+)?(monday|tuesday|wednesday|thursday|friday|saturday|sunday)$/);
  if (!weekday) return null;
  const weekdayNumbers = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 };
  let delta = (weekdayNumbers[weekday[2]] - now.getDay() + 7) % 7;
  if (weekday[1] === "next") delta += delta === 0 ? 7 : 7;
  return isoDate(addDays(now, delta));
}

function stripTimePhrase(value = "") {
  const text = String(value || "");
  const matches = Array.from(text.matchAll(new RegExp(TIME_PATTERN.source, "gi")));
  if (!matches.length) return { text, label: "" };

  const selected = matches[matches.length - 1];
  const cleaned = text
    .replace(new RegExp(TIME_PATTERN.source, "gi"), " ")
    .replace(/\b(?:actually\s+(?:make\s+)?(?:that|it)|make\s+(?:that|it)|i\s+mean|no|sorry|rather|instead)\b/gi, " ")
    .replace(/(?:\s+(?:that|which))?\s+(?:(?:can|could|should|needs?\s+to|has\s+to)\s+)?(?:be\s+)?(?:done|finished|completed|handled)\s*(?:by|for|on|during)?\s*(?=$|[,;]|\band\s+then\b)/gi, " ")
    .replace(/\b(?:due|by|for|on|during)\s*$/i, " ");
  return { text: cleaned, label: selected[1] };
}

function cleanTaskText(value = "") {
  const text = sentenceCase(
    String(value || "")
      .replace(/^[,;:.!?\s-]+|[,;:.!?\s-]+$/g, " ")
      .replace(/^(?:and\s+then|then|and\s+also|also|anyway)\b/gi, " ")
      .replace(/^(?:add|put|save|write)\s+(?:a\s+)?(?:new\s+)?task\s+(?:to\s+)?/i, " ")
      .replace(/^(?:add|put|save|write)\s+(?:this|it)\s+(?:in|into|on|to)\s+(?:the\s+)?(?:tasks?|board|list)\s*/i, " ")
      .replace(/^(?:add|put|drop|save|write)\s+(?:(?:in|into|on|to)\s+(?:the\s+)?(?:tasks?|board|list)\s+)?/i, " ")
      .replace(/\bautomation\s+bought\b/gi, "automation bot")
      .replace(/\b(?:and\s+then\s+also|and\s+then|then|and\s+also|also)\s*$/i, " ")
      .replace(/\s+/g, " ")
      .trim()
  );
  if (
    !text ||
    text.length > 120 ||
    ROUTING_ONLY_PATTERN.test(text) ||
    VAGUE_TASK_PATTERN.test(text) ||
    UNRESOLVED_REFERENCE_PATTERN.test(text) ||
    UNRESOLVED_OBJECT_PATTERN.test(text) ||
    AMBIGUOUS_CHOICE_PATTERN.test(text) ||
    META_TASK_PATTERN.test(text)
  ) {
    return "";
  }
  if (/\b(?:tasks?|board|list)\s*$/i.test(text) && /^(?:add|put|save|write)\b/i.test(text)) return "";
  return text;
}

function explicitGroup(board, message) {
  const normalizedMessage = normalize(message);
  return (board?.groups || [])
    .filter((group) => normalize(group?.name))
    .sort((left, right) => String(right.name).length - String(left.name).length)
    .find((group) => normalizedMessage.includes(normalize(group.name)));
}

function defaultGroup(board) {
  return (
    (board?.groups || []).find((group) => !/\b(done|complete|finished|archive)\b/i.test(group?.name || "")) ||
    board?.groups?.[0] ||
    null
  );
}

function joinNames(operations) {
  const names = operations.map((operation) => `“${operation.name}”`);
  if (names.length < 2) return names[0] || "the task";
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
}

function capturedSegments(message) {
  const text = String(message || "").replace(/\s+/g, " ").trim();
  const matches = Array.from(text.matchAll(OBLIGATION_PATTERN));
  if (!matches.length) return [];

  const segments = [];
  matches.forEach((match, index) => {
    const start = (match.index || 0) + match[0].length;
    const end = index + 1 < matches.length ? matches[index + 1].index : text.length;
    const body = text.slice(start, end).trim();
    const pieces = body.split(CONNECTED_ACTION_PATTERN).map((piece) => piece.trim()).filter(Boolean);
    pieces.forEach((piece, pieceIndex) => {
      segments.push({ text: piece, prefixDate: pieceIndex === 0 ? match[1] || "" : "" });
    });
  });
  return segments;
}

export function buildDictationPlan(message, board, currentUser, { now = new Date() } = {}) {
  if (!board?.id || !currentUser?.id || String(message || "").trim().length < 12) return null;
  if (/^\s*(?:what|which|when|where|why|how)\b/i.test(message)) return null;
  if (/\b(?:tell|show)\s+me\s+(?:what|which|how|when)\b/i.test(message)) return null;
  const group = explicitGroup(board, message) || defaultGroup(board);
  if (!group?.id) return null;

  const operations = [];
  const skipped = [];
  const seen = new Set();
  for (const segment of capturedSegments(message)) {
    const dated = stripTimePhrase(segment.text);
    const taskName = cleanTaskText(dated.text);
    if (!taskName) {
      const fragment = cleanTaskText(String(segment.text).replace(TIME_PATTERN, " ")) || sentenceCase(segment.text.slice(0, 80));
      if (fragment && !ROUTING_ONLY_PATTERN.test(fragment)) skipped.push(fragment);
      continue;
    }
    const key = normalize(taskName);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const dateLabel = dated.label || segment.prefixDate;
    operations.push({
      type: "create-task",
      groupId: group.id,
      groupName: group.name,
      name: taskName,
      status: "Pending",
      dueDate: parseDateLabel(dateLabel, now),
      ownerId: currentUser.id,
      priority: "Medium",
      notes: "",
    });
  }

  if (!operations.length) {
    if (!skipped.length) return null;
    return {
      mode: "answer",
      operations: [],
      captureSource: "dictation",
      needsClarification: true,
      skippedFragments: skipped,
      message: `I'm not sure what you mean by "${skipped[0]}", and I don't want to create the wrong task. Tell me the specific action or person and I'll add it.`,
    };
  }
  const skippedNote = skipped.length
    ? ` I left out “${skipped[0]}” because it sounds unfinished.`
    : "";
  return {
    mode: "proposal",
    operations,
    captureSource: "dictation",
    skippedFragments: skipped,
    message: `I pulled ${operations.length} clear task${operations.length === 1 ? "" : "s"} out of that note:${skippedNote} Say yes if you want me to add ${joinNames(operations)}.`,
  };
}

function suspiciousCreateTask(operation = {}) {
  if (operation.type !== "create-task") return false;
  const name = String(operation.name || "");
  return (
    !cleanTaskText(name) ||
    name.length > 100 ||
    /\b(?:in the tasks?|on the board)\b/i.test(name) ||
    (name.match(/\b(?:i|we)\s+(?:also\s+)?(?:need|have|got|want)\s+to\b/gi) || []).length > 0
  );
}

export function shouldPreferDictationPlan(remotePlan, localPlan) {
  if (localPlan?.captureSource !== "dictation") return false;
  if (remotePlan?.source === "ai") return false;
  if (localPlan.mode === "answer" && localPlan.needsClarification) {
    if (!remotePlan) return true;
    return remotePlan.mode === "proposal" && (remotePlan.operations || []).some(suspiciousCreateTask);
  }
  if (!localPlan.operations?.length) return false;
  if (!remotePlan || remotePlan.mode !== "proposal") return true;
  const remoteOperations = remotePlan.operations || [];
  if (remoteOperations.some(suspiciousCreateTask)) return true;
  if (remotePlan.source === "rules" && localPlan.operations.length > remoteOperations.length) return true;
  return remoteOperations.length <= 1 && localPlan.operations.length > 1;
}
