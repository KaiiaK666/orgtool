import assert from "node:assert/strict";
import test from "node:test";

import { buildMixedCopilotPlan, splitMixedCopilotClauses } from "../src/mixedCopilotPlan.js";

const now = new Date(2026, 6, 18, 12, 0, 0);
const currentUser = { id: 7, name: "Kai" };
const board = {
  id: 1,
  name: "BDC Follow Up",
  groups: [
    { id: 11, name: "Open" },
    { id: 12, name: "Weekend Tasks" },
    { id: 13, name: "Completed" },
  ],
  tasks: [
    { id: 101, group_id: 11, owner_id: 7, name: "Milk", status: "Pending", priority: "Medium", due_date: "2026-07-18" },
    { id: 102, group_id: 11, owner_id: 7, name: "Finish CSI", status: "Pending", priority: "High", due_date: "2026-07-18" },
    { id: 103, group_id: 11, owner_id: 8, name: "Other owner's task", status: "Pending", priority: "Medium", due_date: "2026-07-18" },
    { id: 104, group_id: 11, owner_id: 7, name: "Tomorrow task", status: "Pending", priority: "Medium", due_date: "2026-07-19" },
    { id: 105, group_id: 13, owner_id: 7, name: "Old follow-up", status: "Done", priority: "Low", due_date: "2026-07-17" },
  ],
};

test("splits the investor-demo continuation into two actions", () => {
  assert.deepEqual(
    splitMixedCopilotClauses("OK mark all of my tasks today is done and then for my weekend tasks that I need to get snake food"),
    ["mark all of my tasks today is done", "for my weekend tasks that I need to get snake food"]
  );
});

test("handles the exact investor-demo prompt atomically", () => {
  const plan = buildMixedCopilotPlan(
    "OK mark all of my tasks today is done and then for my weekend tasks that I need to get snake food",
    board,
    currentUser,
    { now }
  );

  assert.equal(plan.mode, "proposal");
  assert.equal(plan.intent, "mixed");
  assert.equal(plan.parsedClauseCount, 2);
  assert.deepEqual(plan.operations.map((operation) => operation.type), ["bulk-update", "create-task"]);
  assert.deepEqual(plan.operations[0].taskIds, [101, 102], "only the current user's tasks due today are completed");
  assert.deepEqual(plan.operations[0].changes, { status: "Done" });
  assert.equal(plan.operations[1].groupId, 12);
  assert.equal(plan.operations[1].groupName, "Weekend Tasks");
  assert.equal(plan.operations[1].name, "Get snake food");
});

test("combines a named completion and a task addition", () => {
  const plan = buildMixedCopilotPlan("mark Milk done and add call Miguel to Weekend Tasks", board, currentUser, { now });
  assert.deepEqual(plan.operations.map((operation) => operation.type), ["update-task", "create-task"]);
  assert.equal(plan.operations[0].taskId, 101);
  assert.equal(plan.operations[1].name, "Call Miguel");
  assert.equal(plan.operations[1].groupId, 12);
});

test("combines rescheduling and creating work", () => {
  const plan = buildMixedCopilotPlan("push Finish CSI to Friday and add send CSI recap to Weekend Tasks", board, currentUser, { now });
  assert.deepEqual(plan.operations.map((operation) => operation.type), ["update-task", "create-task"]);
  assert.equal(plan.operations[0].changes.due_date, "2026-07-24");
  assert.equal(plan.operations[1].name, "Send CSI recap");
});

test("combines completed-task cleanup and replacement work", () => {
  const plan = buildMixedCopilotPlan("remove all completed tasks and add archive recap to Weekend Tasks", board, currentUser, { now });
  assert.deepEqual(plan.operations.map((operation) => operation.type), ["bulk-delete-tasks", "create-task"]);
  assert.deepEqual(plan.operations[0].taskIds, [105]);
  assert.equal(plan.operations[1].name, "Archive recap");
});

test("never drops an unclear clause from a mixed request", () => {
  const plan = buildMixedCopilotPlan("mark Milk done and move the other situation", board, currentUser, { now });
  assert.equal(plan.mode, "answer");
  assert.equal(plan.needsClarification, true);
  assert.deepEqual(plan.operations, []);
  assert.match(plan.message, /move the other situation/);
  assert.match(plan.message, /keep the rest of your request/);
});
