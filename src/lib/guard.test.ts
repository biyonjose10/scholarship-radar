// Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { admit } from "./guard";

process.env.RUNS_PER_IP_PER_HOUR = "2";
process.env.DAILY_RUN_CEILING = "3";

test("per-IP limit, then the daily ceiling, stop runs before any paid call", () => {
  assert.equal(admit("1.1.1.1").ok, true);
  assert.equal(admit("1.1.1.1").ok, true);
  const third = admit("1.1.1.1");
  assert.equal(third.ok, false);
  assert.match((third as { reason: string }).reason, /this hour/);
  assert.equal(admit("2.2.2.2").ok, true); // 3rd run today
  const capped = admit("3.3.3.3");
  assert.equal(capped.ok, false);
  assert.match((capped as { reason: string }).reason, /budget/);
});
