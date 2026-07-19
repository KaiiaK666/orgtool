const STATUS_WORDS = {
  done: "Done",
  complete: "Done",
  completed: "Done",
  finished: "Done",
  pending: "Pending",
  open: "Pending",
  overdue: "Overdue",
  late: "Overdue",
};

const ACTION_BOUNDARY =
  /\s+(?:and\s+then|then|and\s+also|also|and)\s+(?=(?:mark|set|change|move|push|reschedule|update|add|create|new|complete|finish|delete|remove|clear|rename|assign|put|send|remember|remind|don['â€™]?t\s+forget|i\s+(?:need|have|want)|we\s+(?:need|have|want)|for\s+(?:my|the|our)\b|in\s+(?:my|the|our)\b))/gi;

function normalize(value = "") {
  return String(value || "")
    .toLowerCase()
    .replace(/[â€™']/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function sentenceCase(value = "") {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : "";
}

function localIsoDate(value = new Date()) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(value, count) {
  const next = new Date(value);
  next.setDate(next.getDate() + count);
  return next;
}

function dateFromClause(clause, now) {
  const text = normalize(clause);
  if (/\btoday\b/.test(text)) return localIsoDate(now);
  if (/\b(?:tomorrow|next day)\b/.test(text)) return localIsoDate(addDays(now, 1));
  const iso = String(clause || "").match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (iso) return iso[1];
  const numeric = String(clause || "").match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
  if (numeric) {
    const year = numeric[3] ? Number(numeric[3].length === 2 ? `20${numeric[3]}` : numeric[3]) : now.getFullYear();
    return localIsoDate(new Date(year, Number(numeric[1]) - 1, Number(numeric[2])));
  }
  const weekdays = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  const weekdayIndex = weekdays.findIndex((weekday) => new RegExp(`\\b(?:this |next )?${weekday}\\b`).test(text));
  if (weekdayIndex >= 0) {
    let delta = (weekdayIndex - now.getDay() + 7) % 7;
    if (delta === 0 || new RegExp(`\\bnext ${weekdays[weekdayIndex]}\\b`).test(text)) delta += 7;
    return localIsoDate(addDays(now, delta));
  }
  return null;
}

function statusFromClause(clause) {
  const text = normalize(clause);
  if (/\b(?:complete|completed|finish|finished|check off|cross off|done with)\b/.test(text)) return "Done";
  const matches = Object.entries(STATUS_WORDS).filter(([word]) => new RegExp(`\\b${word}\\b`).test(text));
  return matches.length ? matches[matches.length - 1][1] : null;
}

function priorityFromClause(clause) {
  const text = normalize(clause);
  if (/\b(?:critical|emergency|top priority|highest priority)\b/.test(text)) return "Critical";
  if (/\b(?:high|urgent|important|asap)\b/.test(text)) return "High";
  if (/\b(?:low|not urgent|whenever|back burner)\b/.test(text)) return "Low";
  return /\b(?:medium|normal)\b/.test(text) ? "Medium" : null;
}

function findNamed(items = [], clause = "", field = "name") {
  const haystack = normalize(clause);
  return [...items]
    .filter((item) => {
      const needle = normalize(item?.[field]);
      return needle && new RegExp(`(?:^| )${needle.replace(/ /g, " +")}(?: |$)`).test(haystack);
    })
    .sort((left, right) => normalize(right?.[field]).length - normalize(left?.[field]).length)[0] || null;
}

function findTask(board, clause) {
  return findNamed(board?.tasks || [], clause);
}

function findGroup(board, clause) {
  const groups = board?.groups || [];
  const direct = findNamed(groups, clause);
  if (direct) return direct;
  const text = normalize(clause);
  const semanticScopes = ["weekend", "shopping", "grocery"];
  for (const scope of semanticScopes) {
    if (!new RegExp(`\\b${scope}\\b`).test(text)) continue;
    const semanticMatch = groups.find((group) => new RegExp(`\\b${scope}\\b`).test(normalize(group?.name)));
    if (semanticMatch) return semanticMatch;
  }
  return null;
}

function scopedActionGroup(board, clause) {
  const group = findGroup(board, clause);
  if (!group) return null;
  const label = normalize(group.name);
  const canBeStatusOrDate = /^(?:today|this week|done|complete|completed|pending|overdue)$/.test(label);
  if (!canBeStatusOrDate) return group;
  const text = normalize(clause);
  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/ /g, " +");
  const explicitlyScoped = new RegExp(`\\b(?:in|inside|under|from|within) +(?:the +)?${escapedLabel}\\b|\\b${escapedLabel} +(?:group|list|project|section)\\b`).test(text);
  return explicitlyScoped ? group : null;
}

function groupForTask(board, task) {
  return (board?.groups || []).find((group) => Number(group.id) === Number(task?.group_id)) || null;
}

function firstWorkingGroup(board) {
  return (board?.groups || []).find((group) => !/\b(?:done|complete|finished)\b/i.test(group.name || "")) || board?.groups?.[0] || null;
}

function isOwnedBy(task, currentUser) {
  return Number(task?.owner_id) === Number(currentUser?.id);
}

function cleanCreatedTaskName(value, group) {
  let text = String(value || "")
    .replace(/^[\s,:;.-]+|[\s,;.!?]+$/g, " ")
    .replace(/^(?:that\s+)?(?:i|we)\s+(?:need|have|want)\s+(?:to\s+)?/i, "")
    .replace(/^(?:please\s+)?(?:add|create|make|put|remember|remind\s+me\s+to|don['â€™]?t\s+forget\s+to)\s+(?:a\s+)?(?:new\s+)?(?:task|item|todo|to-do)?\s*/i, "")
    .trim();
  if (group?.name) {
    const escaped = String(group.name).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    text = text
      .replace(new RegExp(`^(?:for|in|into|under|on)\\s+(?:my|the|our)?\\s*${escaped}(?:\\s+(?:group|list|section))?(?:\\s+that)?\\s*`, "i"), "")
      .replace(new RegExp(`\\s+(?:to|for|in|into|under|on)\\s+(?:my|the|our)?\\s*${escaped}(?:\\s+(?:group|list|section))?$`, "i"), "")
      .trim();
  }
  text = text
    .replace(/^tasks?\s+(?:that\s+)?/i, "")
    .replace(/^(?:that\s+)?(?:i|we)\s+(?:need|have|want)\s+(?:to\s+)?/i, "")
    .replace(/\s+(?:due|for|on)\s+(?:today|tomorrow|this\s+\w+|next\s+\w+|\d{1,2}\/\d{1,2}(?:\/\d{2,4})?|\d{4}-\d{2}-\d{2})$/i, "")
    .replace(/\s+/g, " ")
    .trim();
  return sentenceCase(text);
}

function parseBulkStatus(clause, board, currentUser, now) {
  const targetStatus = statusFromClause(clause);
  const isBulk = /\b(?:all|every|everything|whole|entire)\b/i.test(clause);
  if (!targetStatus || !isBulk || !/\b(?:mark|set|change|update|complete|finish|done)\b/i.test(clause)) return null;

  const group = scopedActionGroup(board, clause);
  const myOnly = /\b(?:my tasks?|mine|assigned to me)\b/i.test(clause);
  const todayOnly = /\b(?:today|today['â€™]?s)\b/i.test(clause);
  const dueDate = todayOnly ? localIsoDate(now) : null;
  const candidates = (board?.tasks || []).filter((task) => {
    if (group && Number(task.group_id) !== Number(group.id)) return false;
    if (myOnly && !isOwnedBy(task, currentUser)) return false;
    if (dueDate && task.due_date !== dueDate) return false;
    return task.status !== targetStatus;
  });
  const scopeParts = [group?.name, myOnly ? "assigned to you" : "", todayOnly ? "due today" : ""].filter(Boolean);
  if (!candidates.length) {
    return { operations: [], note: `No active tasks ${scopeParts.join(" ") || "in that scope"} needed that status change.` };
  }
  return {
    operations: [{
      type: "bulk-update",
      taskIds: candidates.map((task) => task.id),
      taskCount: candidates.length,
      groupName: group?.name || null,
      sourceStatus: null,
      scopeLabel: scopeParts.join(" "),
      changes: { status: targetStatus },
    }],
    context: { group },
  };
}

function parseBulkDelete(clause, board, currentUser, now) {
  if (!/\b(?:delete|remove|clear|trash|erase)\b/i.test(clause) || !/\b(?:all|every|everything|completed|done)\b/i.test(clause)) return null;
  const group = scopedActionGroup(board, clause);
  const myOnly = /\b(?:my tasks?|mine|assigned to me)\b/i.test(clause);
  const todayOnly = /\b(?:today|today['â€™]?s)\b/i.test(clause);
  const dueDate = todayOnly ? localIsoDate(now) : null;
  const doneOnly = /\b(?:completed|done|finished)\b/i.test(clause);
  const candidates = (board?.tasks || []).filter((task) => {
    if (group && Number(task.group_id) !== Number(group.id)) return false;
    if (myOnly && !isOwnedBy(task, currentUser)) return false;
    if (dueDate && task.due_date !== dueDate) return false;
    if (doneOnly && task.status !== "Done") return false;
    return true;
  });
  if (!candidates.length) return { operations: [], note: "No matching tasks needed to be removed." };
  return {
    operations: [{
      type: "bulk-delete-tasks",
      taskIds: candidates.map((task) => task.id),
      taskCount: candidates.length,
      groupName: group?.name || null,
      sourceStatus: doneOnly ? "Done" : null,
    }],
    context: { group },
  };
}

function parseNamedDelete(clause, board) {
  if (!/\b(?:delete|remove|trash|erase)\b/i.test(clause)) return null;
  const task = findTask(board, clause);
  if (!task) return null;
  return { operations: [{ type: "delete-task", taskId: task.id, taskName: task.name }], context: { group: groupForTask(board, task) } };
}

function parseDateMove(clause, board, now) {
  if (!/\b(?:move|push|reschedule|set|change|update)\b/i.test(clause)) return null;
  const task = findTask(board, clause);
  const dueDate = dateFromClause(clause, now);
  if (!task || !dueDate) return null;
  return {
    operations: [{ type: "update-task", taskId: task.id, taskName: task.name, changes: { due_date: dueDate } }],
    context: { group: groupForTask(board, task) },
  };
}

function parseGroupMove(clause, board) {
  if (!/\b(?:move|send|put)\b/i.test(clause)) return null;
  const task = findTask(board, clause);
  const group = findGroup(board, clause);
  if (!task || !group || Number(task.group_id) === Number(group.id)) return null;
  return {
    operations: [{ type: "update-task", taskId: task.id, taskName: task.name, targetGroupName: group.name, changes: { group_id: group.id } }],
    context: { group },
  };
}

function parseNamedStatus(clause, board) {
  const targetStatus = statusFromClause(clause);
  if (!targetStatus || !/\b(?:mark|set|change|update|complete|finish|done)\b/i.test(clause)) return null;
  const task = findTask(board, clause);
  if (!task) return null;
  if (task.status === targetStatus) return { operations: [], note: `${task.name} is already ${targetStatus.toLowerCase()}.` };
  return {
    operations: [{ type: "update-task", taskId: task.id, taskName: task.name, changes: { status: targetStatus } }],
    context: { group: groupForTask(board, task) },
  };
}

function parsePriority(clause, board) {
  if (!/\b(?:make|set|change|mark|priority)\b/i.test(clause)) return null;
  const task = findTask(board, clause);
  const priority = priorityFromClause(clause);
  if (!task || !priority) return null;
  return {
    operations: [{ type: "update-task", taskId: task.id, taskName: task.name, changes: { priority } }],
    context: { group: groupForTask(board, task) },
  };
}

function parseCreate(clause, board, currentUser, now, context = {}) {
  if (!/\b(?:add|create|new|put|need|have to|want to|remember|remind|don['â€™]?t forget|buy|get|grab|pick up)\b/i.test(clause)) return null;
  if (/\b(?:what|which|show|how many|summary|summarize)\b/i.test(clause)) return null;
  const group = findGroup(board, clause) || context.group || firstWorkingGroup(board);
  if (!group) return null;

  const obligation = String(clause).match(/\b(?:that\s+)?(?:i|we)\s+(?:need|have|want)\s+(?:to\s+)?(.+)$/i);
  const reminder = String(clause).match(/\b(?:remember|remind\s+me|don['â€™]?t\s+forget)\s+(?:to\s+)?(.+)$/i);
  const direct = String(clause).match(/\b(?:add|create|put)\s+(?:a\s+)?(?:new\s+)?(?:task|item|todo|to-do)?\s*(.+)$/i);
  const bareNeed = String(clause).match(/\b(?:need|have|want)\s+(?:to\s+)?(.+)$/i);
  const source = obligation?.[1] || reminder?.[1] || direct?.[1] || bareNeed?.[1] || "";
  const name = cleanCreatedTaskName(source, group);
  if (!name || normalize(name) === normalize(group.name) || /^(?:task|item|one)$/i.test(name)) return null;

  return {
    operations: [{
      type: "create-task",
      groupId: group.id,
      groupName: group.name,
      name,
      status: "Pending",
      dueDate: dateFromClause(clause, now),
      ownerId: currentUser?.id ?? null,
      priority: priorityFromClause(clause) || "Medium",
      notes: "",
    }],
    context: { group },
  };
}

function parseClause(clause, board, currentUser, now, context) {
  const parsers = [
    () => parseBulkStatus(clause, board, currentUser, now),
    () => parseBulkDelete(clause, board, currentUser, now),
    () => parseNamedDelete(clause, board),
    () => parseDateMove(clause, board, now),
    () => parseGroupMove(clause, board),
    () => parseNamedStatus(clause, board),
    () => parsePriority(clause, board),
    () => parseCreate(clause, board, currentUser, now, context),
  ];
  for (const parser of parsers) {
    const result = parser();
    if (result) return result;
  }
  return null;
}

function spokenJoin(items) {
  if (items.length <= 1) return items[0] || "";
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

function describe(operation) {
  if (operation.type === "bulk-update") {
    const scope = operation.scopeLabel ? ` ${operation.scopeLabel}` : operation.groupName ? ` in ${operation.groupName}` : "";
    return `mark ${operation.taskCount} task${operation.taskCount === 1 ? "" : "s"}${scope} as ${operation.changes.status}`;
  }
  if (operation.type === "bulk-delete-tasks") return `remove ${operation.taskCount} matching task${operation.taskCount === 1 ? "" : "s"}`;
  if (operation.type === "delete-task") return `remove \"${operation.taskName}\"`;
  if (operation.type === "create-task") return `add \"${operation.name}\" to ${operation.groupName}`;
  if (operation.type === "update-task" && operation.changes.status) return `mark \"${operation.taskName}\" as ${operation.changes.status}`;
  if (operation.type === "update-task" && operation.changes.due_date) return `move \"${operation.taskName}\" to ${operation.changes.due_date}`;
  if (operation.type === "update-task" && operation.changes.group_id) return `move \"${operation.taskName}\" to ${operation.targetGroupName}`;
  if (operation.type === "update-task" && operation.changes.priority) return `set \"${operation.taskName}\" to ${operation.changes.priority} priority`;
  return "make the requested change";
}

export function splitMixedCopilotClauses(message = "") {
  return String(message || "")
    .replace(/^\s*(?:hey\s+)?(?:ok(?:ay)?)[,\s]+/i, "")
    .split(ACTION_BOUNDARY)
    .map((clause) => clause.replace(/^[,.;:\s]+|[,.;:\s]+$/g, "").trim())
    .filter(Boolean);
}

export function buildMixedCopilotPlan(message, board, currentUser, options = {}) {
  const clauses = splitMixedCopilotClauses(message);
  if (clauses.length < 2) return null;

  const now = options.now instanceof Date ? options.now : new Date();
  const operations = [];
  const notes = [];
  let context = { group: null };

  for (const clause of clauses) {
    const parsed = parseClause(clause, board, currentUser, now, context);
    if (!parsed) {
      return {
        mode: "answer",
        needsClarification: true,
        operations: [],
        source: "local-mixed",
        message: `I understood the other changes, but I am not sure what you want me to do with \"${clause}\". Clarify just that part and I will keep the rest of your request.`,
        unresolvedClause: clause,
      };
    }
    operations.push(...(parsed.operations || []));
    if (parsed.note) notes.push(parsed.note);
    context = { ...context, ...(parsed.context || {}) };
  }

  if (!operations.length) {
    return {
      mode: "answer",
      needsClarification: false,
      operations: [],
      source: "local-mixed",
      message: notes.length ? spokenJoin(notes) : "Those changes are already reflected on the board.",
    };
  }

  const summary = spokenJoin(operations.map(describe));
  const notePrefix = notes.length ? `${spokenJoin(notes)} ` : "";
  return {
    mode: "proposal",
    intent: "mixed",
    needsClarification: false,
    operations,
    source: "local-mixed",
    parsedClauseCount: clauses.length,
    message: `${notePrefix}Say yes if you want me to ${summary}.`,
  };
}
