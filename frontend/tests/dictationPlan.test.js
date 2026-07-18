import test from "node:test";
import assert from "node:assert/strict";

import { buildDictationPlan, shouldPreferDictationPlan } from "../src/dictationPlan.js";

const board = {
  id: 4,
  name: "BDC Follow Up",
  groups: [
    { id: 41, name: "All" },
    { id: 42, name: "Done" },
  ],
  tasks: [],
};
const user = { id: 7, name: "Kai" };
const friday = new Date(2026, 6, 17, 9, 0, 0);
const wednesday = new Date(2026, 6, 15, 9, 0, 0);

test("turns the reported messy voice note into separate dated tasks", () => {
  const plan = buildDictationPlan(
    "I'm taking a shit right now but in the tasks I need to finish CSI today and then I also need to set up the CSI automation bought that can be done for this week and then also this week I need to do the updated",
    board,
    user,
    { now: friday }
  );

  assert.deepEqual(
    plan.operations.map((operation) => [operation.name, operation.dueDate]),
    [
      ["Finish CSI", "2026-07-17"],
      ["Set up the CSI automation bot", "2026-07-17"],
    ]
  );
  assert.match(plan.message, /left out/i);
  assert.deepEqual(plan.skippedFragments, ["Do the updated"]);
});

test("rejects the garbage fragments shown in the live review screen", () => {
  const plan = buildDictationPlan(
    "I need to that today and then finish the CSI automation videos and then send or create another task for sending the update",
    board,
    user,
    { now: friday }
  );

  assert.deepEqual(plan.operations.map((operation) => operation.name), ["Finish the CSI automation videos"]);
  assert.deepEqual(plan.skippedFragments, [
    "That today",
    "Send or create another task for sending the update",
  ]);
});

test("asks for clarification instead of creating a task with an unresolved target", () => {
  const local = buildDictationPlan("I need to call them today", board, user, { now: friday });
  const remote = {
    mode: "proposal",
    source: "rules",
    operations: [{ type: "create-task", name: "Call them" }],
  };

  assert.equal(local.mode, "answer");
  assert.equal(local.needsClarification, true);
  assert.match(local.message, /not sure/i);
  assert.equal(shouldPreferDictationPlan(remote, local), true);
});

test("splits connected actions even when the obligation is only said once", () => {
  const plan = buildDictationPlan(
    "I need to call Miguel today and then send the recap tomorrow and also review the CSI report next week",
    board,
    user,
    { now: friday }
  );

  assert.deepEqual(
    plan.operations.map((operation) => [operation.name, operation.dueDate]),
    [
      ["Call Miguel", "2026-07-17"],
      ["Send the recap", "2026-07-18"],
      ["Review the CSI report", "2026-07-24"],
    ]
  );
});

test("understands gotta and several actions spoken in one breath", () => {
  const plan = buildDictationPlan(
    "so I'm driving but I gotta call Miguel today, finish the CSI report tomorrow, and set up the automation bot by Friday",
    board,
    user,
    { now: wednesday }
  );

  assert.deepEqual(
    plan.operations.map((operation) => [operation.name, operation.dueDate]),
    [
      ["Call Miguel", "2026-07-15"],
      ["Finish the CSI report", "2026-07-16"],
      ["Set up the automation bot", "2026-07-17"],
    ]
  );
});

test("understands should without requiring command-style wording", () => {
  const plan = buildDictationPlan("I should send the recap and update the tracker this week", board, user, { now: wednesday });
  assert.deepEqual(
    plan.operations.map((operation) => [operation.name, operation.dueDate]),
    [
      ["Send the recap", null],
      ["Update the tracker", "2026-07-17"],
    ]
  );
});

test("uses the corrected date when the speaker changes their mind", () => {
  const plan = buildDictationPlan(
    "can you add finish CSI tomorrow actually make that today and then set up the bot Friday",
    board,
    user,
    { now: wednesday }
  );
  assert.deepEqual(
    plan.operations.map((operation) => [operation.name, operation.dueDate]),
    [
      ["Finish CSI", "2026-07-15"],
      ["Set up the bot", "2026-07-17"],
    ]
  );
});

test("uses an explicitly named task group", () => {
  const plan = buildDictationPlan("I need to call Miguel tomorrow in Done", board, user, { now: friday });
  assert.equal(plan.operations[0].groupId, 42);
  assert.equal(plan.operations[0].groupName, "Done");
});

test("does not turn a vague question into a task", () => {
  assert.equal(buildDictationPlan("what do I need to do today", board, user, { now: friday }), null);
  assert.equal(buildDictationPlan("can you tell me what I need to do today", board, user, { now: friday }), null);
});

test("overrides a greedy one-task fallback with the structured dictation plan", () => {
  const local = buildDictationPlan("I need to call Miguel today and then send the recap tomorrow", board, user, { now: friday });
  const remote = {
    mode: "proposal",
    source: "rules",
    operations: [{ type: "create-task", name: "Call Miguel today and then send the recap tomorrow" }],
  };
  assert.equal(shouldPreferDictationPlan(remote, local), true);
});

test("keeps a richer AI plan when it already separated the work", () => {
  const local = buildDictationPlan("I need to call Miguel today and then send the recap tomorrow", board, user, { now: friday });
  const remote = {
    mode: "proposal",
    source: "ai",
    operations: [
      { type: "create-task", name: "Call Miguel" },
      { type: "create-task", name: "Send the recap" },
    ],
  };
  assert.equal(shouldPreferDictationPlan(remote, local), false);
});

test("keeps an AI clarification instead of replacing it with a local guess", () => {
  const local = buildDictationPlan("I need to call them today", board, user, { now: friday });
  const remote = {
    mode: "answer",
    source: "ai",
    needsClarification: true,
    message: "I'm not sure which item you want to update. Which task do you mean?",
    operations: [],
  };
  assert.equal(shouldPreferDictationPlan(remote, local), false);
});
