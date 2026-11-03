import assert from "node:assert/strict";
import { test } from "node:test";
import { isConflict, todayInJapan } from "./api.ts";
import { DemoApi } from "./demo.ts";

test("在庫は期限の近い順に並び、数量0の在庫は出ない", async () => {
  const api = new DemoApi();
  const lots = await api.listLots();
  const dates = lots.map((l) => l.expiresOn);
  assert.deepEqual(dates, [...dates].sort());
  assert.ok(lots.every((l) => l.quantity > 0));
});

test("配布の提案は期限の近い順（明日の食パン→2日後のパックごはん）。期限切れは出さない", async () => {
  const api = new DemoApi();
  const result = await api.planDistribution(10, { staple: 2 });
  assert.deepEqual(
    result.picks.map((p) => [p.itemName, p.quantity, p.daysLeft]),
    [
      ["食パン", 4, 1],
      ["パックごはん", 12, 2],
      ["パックごはん", 4, 60],
    ],
  );
  assert.ok(!result.picks.some((p) => p.itemName === "コーンフレーク"));
  assert.equal(result.today, todayInJapan());
});

test("配布を確定すると在庫が減り、今月の報告に反映される", async () => {
  const api = new DemoApi();
  const { picks } = await api.planDistribution(3, { canned: 1 });
  await api.confirmDistribution(picks);
  const saba = (await api.listLots()).find((l) => l.itemName === "サバの水煮缶");
  assert.equal(saba?.quantity, 15);
  const report = await api.monthlyReport(todayInJapan().slice(0, 7));
  assert.equal(report.rows.find((r) => r.category === "canned")?.distributed, 3);
});

test("他のスタッフが先に更新していたら 409 になり、何も変わらない（楽観的ロック）", async () => {
  const api = new DemoApi();
  const { picks } = await api.planDistribution(20, { staple: 1, drink: 1 });
  const before = await api.listLots();
  api.simulateOtherStaff(picks[1].lotId);

  await assert.rejects(api.confirmDistribution(picks), (e) => isConflict(e));
  const after = await api.listLots();
  // 別のスタッフが配った1個以外は変わっていない（先に処理した在庫も元に戻っている）
  const changed = after.filter((l) => before.find((b) => b.id === l.id)?.quantity !== l.quantity);
  assert.deepEqual(
    changed.map((l) => l.id),
    [picks[1].lotId],
  );
});

test("賞味期限切れを含める設定にすると、コーンフレークも提案に入る", async () => {
  const api = new DemoApi();
  await api.updateSettings(true);
  const result = await api.planDistribution(30, { staple: 2 });
  const corn = result.picks.find((p) => p.itemName === "コーンフレーク");
  assert.ok(corn);
  assert.match(corn.reason, /賞味期限を1日過ぎています/);
});

test("バーコードで登録した商品は、次から名前が自動で出る", async () => {
  const api = new DemoApi();
  assert.equal(await api.findItemByJan("2000000000084"), null);
  await api.receive({
    jan: "2000000000084",
    name: "カップスープ",
    category: "retort",
    quantity: 8,
    expiresOn: "2027-03-01",
    expiryType: "best_before",
  });
  assert.equal((await api.findItemByJan("2000000000084"))?.name, "カップスープ");
});
