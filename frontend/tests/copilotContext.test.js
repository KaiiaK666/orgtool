import test from "node:test";
import assert from "node:assert/strict";

import {
  buildContextualCopilotPlan,
  buildCopilotConversationContext,
  isComplexCopilotTurn,
  rememberExecutedOperations,
} from "../src/copilotContext.js";

const user = { id: 7, name: "Kai" };
const board = {
  id: 1,
  name: "Home",
  groups: [{ id: 11, name: "Shopping List" }],
  tasks: [
    { id: 101, group_id: 11, name: "Milk", status: "Pending", priority: "Medium" },
    { id: 102, group_id: 11, name: "Eggs", status: "Pending", priority: "Medium" },
    { id: 103, group_id: 11, name: "Bread", status: "Pending", priority: "Medium" },
  ],
};

const executedCreate = [
  {
    completedAt: "2026-07-16T12:00:00.000Z",
    operations: [
      { type: "create-group", name: "Shopping List", groupId: 11, groupName: "Shopping List" },
      { type: "create-task", name: "Milk", taskId: 101, taskName: "Milk", groupId: 11, groupName: "Shopping List" },
      { type: "create-task", name: "Eggs", taskId: 102, taskName: "Eggs", groupId: 11, groupName: "Shopping List" },
      { type: "create-task", name: "Bread", taskId: 103, taskName: "Bread", groupId: 11, groupName: "Shopping List" },
    ],
  },
];

test("removes the exact items created in the previous turn", () => {
  const plan = buildContextualCopilotPlan("remove those items", board, user, executedCreate);
  assert.equal(plan.mode, "proposal");
  assert.deepEqual(
    plan.operations.map((operation) => operation.taskId),
    [101, 102, 103]
  );
  assert.ok(plan.operations.every((operation) => operation.type === "delete-task"));
});

test("applies a follow-up priority to the previous task set", () => {
  const plan = buildContextualCopilotPlan("actually make them urgent", board, user, executedCreate);
  assert.deepEqual(
    plan.operations.map((operation) => operation.changes.priority),
    ["High", "High", "High"]
  );
});

test("adds new items to the recently created list", () => {
  const plan = buildContextualCopilotPlan("also add bananas and coffee to that list", board, user, executedCreate);
  assert.deepEqual(
    plan.operations.map((operation) => [operation.name, operation.groupId]),
    [
      ["Bananas", 11],
      ["Coffee", 11],
    ]
  );
});

test("deletes the list itself when the group is the referenced entity", () => {
  const plan = buildContextualCopilotPlan("delete that list", board, user, executedCreate);
  assert.equal(plan.operations.length, 1);
  assert.equal(plan.operations[0].type, "delete-group");
  assert.equal(plan.operations[0].groupId, 11);
});

test("handles multiple recently created items named directly without requiring pronouns", () => {
  const plan = buildContextualCopilotPlan("remove milk and eggs", board, user, executedCreate);
  assert.deepEqual(
    plan.operations.map((operation) => operation.taskId),
    [101, 102]
  );
});

test("defers mixed completion and addition to the AI planner", () => {
  const plan = buildContextualCopilotPlan("mark milk done but also add bananas", board, user, executedCreate);
  assert.equal(plan, null);
});

test("defers mixed pending-plan edits instead of flattening them into one action", () => {
  const pendingPlan = {
    mode: "proposal",
    operations: [
      { type: "create-task", name: "Milk", groupName: "Shopping List" },
      { type: "create-task", name: "Eggs", groupName: "Shopping List" },
    ],
  };
  const plan = buildContextualCopilotPlan("remove eggs but make milk urgent", board, user, [], pendingPlan);
  assert.equal(plan, null);
});

test("defers different instructions for the first and second referenced tasks", () => {
  const plan = buildContextualCopilotPlan("make the first one urgent and the second one low priority", board, user, executedCreate);
  assert.equal(plan, null);
});

test("identifies a complex first-turn request before any local fallback can flatten it", () => {
  assert.equal(
    isComplexCopilotTurn("I finished CSI, move the videos to Friday, and add send the update"),
    true
  );
  assert.equal(isComplexCopilotTurn("make those urgent"), false);
  assert.equal(isComplexCopilotTurn("I need to finish the month end report tomorrow"), false);
});

test("revises a pending creation instead of deleting nonexistent tasks", () => {
  const pendingPlan = {
    mode: "proposal",
    message: "Say yes",
    operations: [
      { type: "create-group", name: "Shopping List" },
      { type: "create-task", name: "Milk", groupName: "Shopping List" },
      { type: "create-task", name: "Eggs", groupName: "Shopping List" },
      { type: "create-task", name: "Bread", groupName: "Shopping List" },
    ],
  };
  const plan = buildContextualCopilotPlan("remove eggs from that", board, user, [], pendingPlan);
  assert.equal(plan.contextAction, "replace-pending");
  assert.deepEqual(
    plan.operations.filter((operation) => operation.type === "create-task").map((operation) => operation.name),
    ["Milk", "Bread"]
  );
});

test("keeps unfinished dictation warnings while revising a pending plan", () => {
  const pendingPlan = {
    mode: "proposal",
    captureSource: "dictation",
    skippedFragments: ["Do the updated"],
    operations: [
      { type: "create-task", name: "Finish CSI", groupName: "Shopping List", priority: "Medium" },
      { type: "create-task", name: "Set up the CSI automation bot", groupName: "Shopping List", priority: "Medium" },
    ],
  };
  const plan = buildContextualCopilotPlan("make them urgent", board, user, [], pendingPlan);
  assert.equal(plan.captureSource, "dictation");
  assert.deepEqual(plan.skippedFragments, ["Do the updated"]);
  assert.ok(plan.operations.every((operation) => operation.priority === "High"));
});

test("sends bounded conversation and action context to the planner", () => {
  const history = Array.from({ length: 20 }, (_, index) => ({ role: index % 2 ? "assistant" : "user", text: `message ${index}` }));
  const context = buildCopilotConversationContext({ history, recentActions: executedCreate });
  assert.equal(context.messages.length, 16);
  assert.equal(context.messages[0].content, "message 4");
  assert.equal(context.recent_actions[0].operations[1].taskId, 101);
});

test("keeps only the eight most recent completed action batches", () => {
  let actions = [];
  for (let index = 0; index < 10; index += 1) {
    actions = rememberExecutedOperations(actions, [{ type: "create-task", name: `Task ${index}`, taskId: index + 1 }]);
  }
  assert.equal(actions.length, 8);
  assert.equal(actions[0].operations[0].name, "Task 2");
});
