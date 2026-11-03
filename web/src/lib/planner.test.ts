// contract/cases.json の共通ケース。Python 側（planner/tests/test_contract.py）も同じファイルで確かめる。
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { cleanJan, isValidJan } from "./jan.ts";
import { monthlyReport, type PlanLot, plan, type ReportMovement, status } from "./planner.ts";

const cases = JSON.parse(readFileSync(new URL("../../../contract/cases.json", import.meta.url), "utf-8"));

for (const c of cases.status) {
  test(`status: ${c.name}`, () => assert.equal(status(c.expiresOn, c.today), c.expected));
}

for (const c of cases.plan) {
  test(`plan: ${c.name}`, () => {
    const result = plan(c.lots as PlanLot[], c.households, c.perHousehold, c.today, c.includeExpiredBestBefore);
    assert.deepEqual(result, c.expected);
  });
}

for (const c of cases.report) {
  test(`report: ${c.name}`, () => {
    assert.deepEqual(monthlyReport(c.movements as ReportMovement[], c.month), c.expected);
  });
}

test("JAN のチェックデジットで読み間違いを見つける", () => {
  assert.equal(isValidJan("4901234567894"), true);
  assert.equal(isValidJan("4901234567890"), false);
  assert.equal(isValidJan("2000000000015"), true);
  assert.equal(isValidJan("49123456"), true);
  assert.equal(isValidJan("49123457"), false);
  assert.equal(isValidJan("abc"), false);
  assert.equal(cleanJan("４９０１-２３４ 567894"), "4901234567894");
});
