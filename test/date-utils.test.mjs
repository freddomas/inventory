import assert from "node:assert/strict";
import test from "node:test";

import { addLocalDays, formatLocalDate, todayLocal, weekDaysLocal } from "../public/date-utils.mjs";

test("formats local dates without UTC day drift", () => {
  assert.equal(formatLocalDate(new Date(2026, 5, 29, 0, 0, 0)), "2026-06-29");
  assert.equal(todayLocal(new Date(2026, 5, 29, 0, 0, 0)), "2026-06-29");
});

test("computes Monday-based weeks with local dates", () => {
  assert.deepEqual(weekDaysLocal("2026-06-29"), [
    "2026-06-29",
    "2026-06-30",
    "2026-07-01",
    "2026-07-02",
    "2026-07-03",
    "2026-07-04",
    "2026-07-05",
  ]);
});

test("adds days without using UTC conversion", () => {
  assert.equal(addLocalDays("2026-06-29", -1), "2026-06-28");
  assert.equal(addLocalDays("2026-06-29", 7), "2026-07-06");
});
