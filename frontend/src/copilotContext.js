const CONTEXT_REFERENCE_PATTERN =
  /\b(?:it|that|this|those|these|them|they|same|ones?|that\s+list|this\s+list|the\s+list|those\s+items?|these\s+items?|those\s+tasks?|these\s+tasks?|items?\s+you\s+just\s+(?:added|created)|tasks?\s+you\s+just\s+(?:added|created)|just\s+(?:added|created))\b/i;

const REMOVE_PATTERN = /\b(?:delete|remove|clear|erase|trash|scratch|take\s+off|take\s+out|cross\s+off|don'?t\s+add|drop)\b/i;
const ADD_PATTERN = /\b(?:add|include|put|need|get|grab|buy|pick\s+up)\b/i;
const DATE_OR_MOVE_PATTERN =
  /\b(?:move|push|reschedule|due|today|tomorrow|tonight|this\s+week|next\s+week|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i;
const MOVE_OR_RESCHEDULE_PATTERN = /\b(?:move|push|reschedule|change\s+(?:the\s+)?date|make\s+(?:it|that)\s+due)\b/i;
const ASSIGN_OR_RENAME_PATTERN = /\b(?:assign|owner|give\s+to|rename|call\s+it|change\s+the\s+name)\b/i;
const EXPLICIT_COMPLETION_PATTERN =
  /\b(?:finished|completed|handled|wrapped\s+up|knocked\s+out|checked\s+off|crossed\s+off|done\s+with|got|bought|grabbed|purchased)\b|\b(?:mark|make|set)\b.+\b(?:done|complete|completed)\b/i;
const DIFFERENTIAL_REFERENCE_PATTERN =
  /\b(?:but|except|instead|first|second|third|former|latter|other\s+one|one\s+of\s+them)\b/i;

function normalize(value = "") {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function sentenceCase(value = "") {
  const text = String(value || "").trim();
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : "";
}

function spokenJoin(parts = []) {
  const items = parts.filter(Boolean);
  if (items.length <= 1) return items[0] || "";
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

function operationSummary(operation = {}) {
  if (operation.type === "create-group") return `create the task group "${operation.name}"`;
  if (operation.type === "create-task") return `add "${operation.name}"${operation.groupName ? ` to ${operation.groupName}` : ""}`;
  if (operation.type === "delete-task") return `remove "${operation.taskName}"`;
  if (operation.type === "delete-group") return `remove the task group "${operation.groupName}"`;
  if (operation.type === "update-task" && operation.changes?.status) {
    return `mark "${operation.taskName}" as ${operation.changes.status}`;
  }
  if (operation.type === "update-task" && operation.changes?.priority) {
    return `make "${operation.taskName}" ${operation.changes.priority} priority`;
  }
  return "make that change";
}

function proposal(operations, prefix = "") {
  const summary = spokenJoin(operations.map(operationSummary));
  return {
    mode: "proposal",
    operations,
    message: `${prefix ? `${prefix.trim()} ` : ""}Say yes if you want me to ${summary}.`,
  };
}

function preservePendingMetadata(plan, pendingPlan) {
  return {
    ...plan,
    ...(pendingPlan?.captureSource ? { captureSource: pendingPlan.captureSource } : {}),
    ...(pendingPlan?.skippedFragments?.length ? { skippedFragments: pendingPlan.skippedFragments } : {}),
  };
}

function splitItems(value = "") {
  const cleaned = String(value || "")
    .replace(/[.?!]+$/g, "")
    .replace(/\b(?:to|in|on|into)\s+(?:that|this|the|same|my)?\s*(?:shopping|grocery)?\s*(?:list|group)\b.*$/i, "")
    .replace(/\b(?:also|please|could\s+you|can\s+you|add|include|put|need|get|grab|buy|pick\s+up)\b/gi, " ")
    .replace(/\b(?:those|these|them|it)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return [];
  return cleaned
    .split(/\s*(?:,|;|\n|\band\b|\bplus\b)\s*/i)
    .map((item) => sentenceCase(item.trim()))
    .filter((item) => item.length > 1);
}

function statusFromMessage(message = "") {
  if (/\b(?:done|complete|completed|finished|checked\s+off|bought|got)\b/i.test(message)) return "Done";
  if (/\b(?:pending|open|not\s+done|todo|to\s+do)\b/i.test(message)) return "Pending";
  if (/\b(?:overdue|late|behind|past\s+due)\b/i.test(message)) return "Overdue";
  return null;
}

function priorityFromMessage(message = "") {
  if (/\b(?:critical|emergency|highest|top\s+priority)\b/i.test(message)) return "Critical";
  if (/\b(?:high|urgent|important|asap|hot)\b/i.test(message)) return "High";
  if (/\b(?:medium|normal|regular)\b/i.test(message)) return "Medium";
  if (/\b(?:low|not\s+urgent|whenever|back\s+burner)\b/i.test(message)) return "Low";
  return null;
}

function shouldDeferComplexContextTurn(message = "") {
  const hasAdd = ADD_PATTERN.test(message);
  const actionFamilies = [
    REMOVE_PATTERN.test(message),
    hasAdd,
    EXPLICIT_COMPLETION_PATTERN.test(message),
    MOVE_OR_RESCHEDULE_PATTERN.test(message),
    ASSIGN_OR_RENAME_PATTERN.test(message),
  ].filter(Boolean).length;
  if (actionFamilies > 1) return true;
  const modifierFamilies = [
    Boolean(statusFromMessage(message)),
    Boolean(priorityFromMessage(message)),
    DATE_OR_MOVE_PATTERN.test(message),
  ].filter(Boolean).length;
  if (!hasAdd && modifierFamilies > 1) return true;
  return DIFFERENTIAL_REFERENCE_PATTERN.test(message) && /\b(?:and|but|except|while)\b/i.test(message);
}

export function isComplexCopilotTurn(message = "") {
  return shouldDeferComplexContextTurn(message);
}

function operationTaskRefs(operation = {}) {
  if (operation.type === "bulk-update" || operation.type === "bulk-delete-tasks") {
    return (operation.taskIds || []).map((taskId) => ({ taskId }));
  }
  if (operation.taskId || operation.taskName || operation.name) {
    return [
      {
        taskId: operation.taskId || null,
        taskName: operation.taskName || operation.name || "",
        groupId: operation.groupId || null,
        groupName: operation.groupName || "",
      },
    ];
  }
  return [];
}

function recentTaskMatches(board, recentActions = []) {
  const boardTasks = board?.tasks || [];
  for (let index = recentActions.length - 1; index >= 0; index -= 1) {
    const refs = (recentActions[index]?.operations || [])
      .filter((operation) => !["delete-task", "bulk-delete-tasks"].includes(operation.type))
      .flatMap(operationTaskRefs);
    const matches = refs
      .map((ref) => {
        if (ref.taskId) return boardTasks.find((task) => Number(task.id) === Number(ref.taskId));
        const key = normalize(ref.taskName);
        return key ? boardTasks.find((task) => normalize(task.name) === key) : null;
      })
      .filter(Boolean);
    const unique = Array.from(new Map(matches.map((task) => [Number(task.id), task])).values());
    if (unique.length) return unique;
  }
  return [];
}

function recentGroupMatch(board, recentActions = []) {
  const groups = board?.groups || [];
  for (let actionIndex = recentActions.length - 1; actionIndex >= 0; actionIndex -= 1) {
    const operations = recentActions[actionIndex]?.operations || [];
    for (let operationIndex = operations.length - 1; operationIndex >= 0; operationIndex -= 1) {
      const operation = operations[operationIndex];
      if (["delete-group", "bulk-delete-groups"].includes(operation.type)) continue;
      const groupId = operation.groupId || (operation.type === "update-group" ? operation.groupId : null);
      const groupName = operation.groupName || (operation.type === "create-group" ? operation.name : "");
      const match = groupId
        ? groups.find((group) => Number(group.id) === Number(groupId))
        : groups.find((group) => normalize(group.name) === normalize(groupName));
      if (match) return match;
    }
  }
  return null;
}

function selectMentionedTasks(message, tasks = []) {
  const normalizedMessage = normalize(message);
  const explicit = tasks.filter((task) => {
    const name = normalize(task.name);
    return name && normalizedMessage.includes(name);
  });
  if (explicit.length) return explicit;
  return CONTEXT_REFERENCE_PATTERN.test(message) ? tasks : [];
}

function selectPendingTaskOperations(message, operations = []) {
  const creates = operations.filter((operation) => operation.type === "create-task");
  const normalizedMessage = normalize(message);
  const explicit = creates.filter((operation) => {
    const name = normalize(operation.name);
    return name && normalizedMessage.includes(name);
  });
  if (explicit.length) return explicit;
  return CONTEXT_REFERENCE_PATTERN.test(message) ? creates : [];
}

function pendingTargetGroup(pendingPlan = null) {
  const operations = pendingPlan?.operations || [];
  const createGroup = operations.find((operation) => operation.type === "create-group");
  const task = operations.find((operation) => operation.type === "create-task" && (operation.groupId || operation.groupName));
  if (task) return { id: task.groupId || null, name: task.groupName || createGroup?.name || "" };
  if (createGroup) return { id: null, name: createGroup.name || "" };
  return null;
}

function revisePendingPlan(message, pendingPlan, currentUser) {
  if (!pendingPlan?.operations?.length) return null;
  const operations = pendingPlan.operations;
  const selected = selectPendingTaskOperations(message, operations);

  if (REMOVE_PATTERN.test(message) && selected.length) {
    const selectedSet = new Set(selected);
    const remaining = operations.filter((operation) => !selectedSet.has(operation));
    const removedNames = selected.map((operation) => operation.name);
    if (!remaining.length) {
      return {
        mode: "answer",
        operations: [],
        contextAction: "replace-pending",
        message: `Okay, I removed ${spokenJoin(removedNames.map((name) => `"${name}"`))} and canceled the empty request.`,
      };
    }
    return {
      ...preservePendingMetadata(
        proposal(remaining, `Okay, I removed ${spokenJoin(removedNames.map((name) => `"${name}"`))} from the pending change.`),
        pendingPlan
      ),
      contextAction: "replace-pending",
    };
  }

  const status = statusFromMessage(message);
  if (status && selected.length) {
    const selectedSet = new Set(selected);
    const revised = operations.map((operation) =>
      selectedSet.has(operation) ? { ...operation, status, changes: { ...(operation.changes || {}), status } } : operation
    );
    return {
      ...preservePendingMetadata(proposal(revised, `Okay, I updated the pending items to ${status}.`), pendingPlan),
      contextAction: "replace-pending",
    };
  }

  const priority = priorityFromMessage(message);
  if (priority && selected.length) {
    const selectedSet = new Set(selected);
    const revised = operations.map((operation) => (selectedSet.has(operation) ? { ...operation, priority } : operation));
    return {
      ...preservePendingMetadata(proposal(revised, `Okay, I changed the pending items to ${priority} priority.`), pendingPlan),
      contextAction: "replace-pending",
    };
  }

  const targetGroup = pendingTargetGroup(pendingPlan);
  if (targetGroup && ADD_PATTERN.test(message) && /\b(?:also|that|this|same|it)\b/i.test(message)) {
    const items = splitItems(message);
    const existing = new Set(
      operations.filter((operation) => operation.type === "create-task").map((operation) => normalize(operation.name))
    );
    const additions = items
      .filter((item) => !existing.has(normalize(item)))
      .map((name) => ({
        type: "create-task",
        groupId: targetGroup.id,
        groupName: targetGroup.name,
        name,
        status: "Pending",
        priority: "Medium",
        ownerId: currentUser?.id ?? null,
        dueDate: null,
        notes: "",
      }));
    if (additions.length) {
      const revised = [...operations, ...additions];
      return {
        ...preservePendingMetadata(
          proposal(revised, `Okay, I added ${spokenJoin(additions.map((operation) => `"${operation.name}"`))} to the pending change.`),
          pendingPlan
        ),
        contextAction: "replace-pending",
      };
    }
  }

  return null;
}

export function buildContextualCopilotPlan(message, board, currentUser, recentActions = [], pendingPlan = null) {
  if ((pendingPlan?.operations?.length || recentActions.length) && shouldDeferComplexContextTurn(message)) {
    return null;
  }
  const pendingRevision = revisePendingPlan(message, pendingPlan, currentUser);
  if (pendingRevision) return pendingRevision;

  const recentTasks = recentTaskMatches(board, recentActions);
  const normalizedMessage = normalize(message);
  const explicitRecentTasks = recentTasks.filter((task) => {
    const name = normalize(task.name);
    return name && normalizedMessage.includes(name);
  });
  const hasContextReference =
    CONTEXT_REFERENCE_PATTERN.test(message) || /^\s*also\b/i.test(message) || explicitRecentTasks.length > 1;
  if (!hasContextReference) return null;

  const selectedTasks = selectMentionedTasks(message, recentTasks);
  const recentGroup = recentGroupMatch(board, recentActions);
  const refersToGroup = /\b(?:list|group|lane|section)\b/i.test(message) && !/\b(?:items?|tasks?|those|them)\b/i.test(message);

  if (REMOVE_PATTERN.test(message) && refersToGroup && recentGroup?.id) {
    const taskCount = (board?.tasks || []).filter((task) => Number(task.group_id) === Number(recentGroup.id)).length;
    return proposal([
      {
        type: "delete-group",
        groupId: recentGroup.id,
        groupName: recentGroup.name,
        taskCount,
      },
    ]);
  }

  if (REMOVE_PATTERN.test(message) && selectedTasks.length) {
    return proposal(
      selectedTasks.map((task) => ({ type: "delete-task", taskId: task.id, taskName: task.name }))
    );
  }

  const status = statusFromMessage(message);
  if (status && selectedTasks.length) {
    return proposal(
      selectedTasks.map((task) => ({
        type: "update-task",
        taskId: task.id,
        taskName: task.name,
        changes: { status },
      }))
    );
  }

  const priority = priorityFromMessage(message);
  if (priority && selectedTasks.length) {
    return proposal(
      selectedTasks.map((task) => ({
        type: "update-task",
        taskId: task.id,
        taskName: task.name,
        changes: { priority },
      }))
    );
  }

  if (ADD_PATTERN.test(message) && recentGroup?.id) {
    const items = splitItems(message);
    const existing = new Set(
      (board?.tasks || [])
        .filter((task) => Number(task.group_id) === Number(recentGroup.id))
        .map((task) => normalize(task.name))
    );
    const operations = items
      .filter((item) => !existing.has(normalize(item)))
      .map((name) => ({
        type: "create-task",
        groupId: recentGroup.id,
        groupName: recentGroup.name,
        name,
        status: "Pending",
        priority: "Medium",
        ownerId: currentUser?.id ?? null,
        dueDate: null,
        notes: "",
      }));
    if (operations.length) return proposal(operations);
  }

  return null;
}

function compactOperation(operation = {}) {
  const allowedKeys = [
    "type",
    "name",
    "taskId",
    "taskName",
    "taskIds",
    "taskCount",
    "groupId",
    "groupName",
    "groupIds",
    "groupCount",
    "boardId",
    "boardName",
    "status",
    "priority",
    "dueDate",
    "ownerId",
    "changes",
  ];
  return Object.fromEntries(allowedKeys.filter((key) => operation[key] !== undefined).map((key) => [key, operation[key]]));
}

export function buildCopilotConversationContext({ history = [], pendingPlan = null, recentActions = [] } = {}) {
  return {
    messages: history
      .slice(-16)
      .filter((entry) => entry?.text && ["user", "assistant"].includes(entry.role))
      .map((entry) => ({ role: entry.role, content: String(entry.text).slice(0, 1600) })),
    pending_plan: pendingPlan?.operations?.length
      ? {
          message: String(pendingPlan.message || "").slice(0, 1200),
          operations: pendingPlan.operations.slice(0, 40).map(compactOperation),
        }
      : null,
    recent_actions: recentActions.slice(-8).map((action) => ({
      completed_at: action.completedAt || null,
      operations: (action.operations || []).slice(0, 40).map(compactOperation),
    })),
  };
}

export function rememberExecutedOperations(recentActions = [], operations = []) {
  if (!operations.length) return recentActions;
  return [
    ...recentActions,
    {
      completedAt: new Date().toISOString(),
      operations: operations.map(compactOperation),
    },
  ].slice(-8);
}
