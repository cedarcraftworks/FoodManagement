// 期限の早い在庫から配布を割り当てる（FEFO）と、月次の集計。
// Python（planner/app/planner.py）と同じ規則で、contract/cases.json の同じテストを通す。
// 本番ではこの計算は Python 側が行い、ここはデモ（サーバーなし）で使う。

export type ExpiryType = "best_before" | "use_by";
export type Status = "expired" | "within3" | "within7" | "ok";
export type MovementKind = "receive" | "distribute" | "dispose";

export interface PlanLot {
  id: number;
  itemName: string;
  category: string;
  quantity: number;
  expiresOn: string; // YYYY-MM-DD
  expiryType: ExpiryType;
  receivedOn: string;
}

export interface Pick {
  lotId: number;
  itemName: string;
  category: string;
  quantity: number;
  expiresOn: string;
  daysLeft: number;
  reason: string;
}

export interface Shortage {
  category: string;
  needed: number;
  available: number;
  short: number;
}

export interface Plan {
  picks: Pick[];
  shortages: Shortage[];
}

export interface ReportMovement {
  kind: MovementKind;
  category: string;
  quantity: number;
  occurredOn: string;
}

export interface ReportRow {
  category: string;
  received: number;
  distributed: number;
  disposed: number;
}

export interface Report {
  month: string;
  rows: ReportRow[];
  total: { received: number; distributed: number; disposed: number };
}

const DAY = 86_400_000;
/** "YYYY-MM-DD" 同士の日数の差（タイムゾーンの影響を受けないよう UTC で計算） */
export const daysBetween = (from: string, to: string): number =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY);

export function status(expiresOn: string, today: string): Status {
  const days = daysBetween(today, expiresOn);
  if (days < 0) return "expired";
  if (days <= 3) return "within3";
  if (days <= 7) return "within7";
  return "ok";
}

function eligible(lot: PlanLot, today: string, includeExpiredBestBefore: boolean): boolean {
  if (lot.quantity <= 0) return false;
  if (lot.expiresOn >= today) return true;
  // 期限切れ：消費期限は絶対に配らない。賞味期限は団体の設定しだい。
  return lot.expiryType === "best_before" && includeExpiredBestBefore;
}

function reason(daysLeft: number): string {
  if (daysLeft < 0) return `賞味期限を${-daysLeft}日過ぎています（団体の設定で配布対象）`;
  if (daysLeft === 0) return "期限は今日です";
  return `期限まで${daysLeft}日`;
}

const compare = (a: PlanLot, b: PlanLot): number =>
  a.expiresOn.localeCompare(b.expiresOn) || a.receivedOn.localeCompare(b.receivedOn) || a.id - b.id;

export function plan(
  lots: PlanLot[],
  households: number,
  perHousehold: Record<string, number>,
  today: string,
  includeExpiredBestBefore = false,
): Plan {
  const out: Plan = { picks: [], shortages: [] };
  for (const [category, per] of Object.entries(perHousehold)) {
    const needed = households * per;
    if (needed <= 0) continue;
    const candidates = lots
      .filter((lot) => lot.category === category && eligible(lot, today, includeExpiredBestBefore))
      .sort(compare);
    const available = candidates.reduce((n, lot) => n + lot.quantity, 0);
    let remaining = needed;
    for (const lot of candidates) {
      if (remaining === 0) break;
      const take = Math.min(lot.quantity, remaining);
      const daysLeft = daysBetween(today, lot.expiresOn);
      out.picks.push({
        lotId: lot.id,
        itemName: lot.itemName,
        category,
        quantity: take,
        expiresOn: lot.expiresOn,
        daysLeft,
        reason: reason(daysLeft),
      });
      remaining -= take;
    }
    if (remaining > 0) out.shortages.push({ category, needed, available, short: remaining });
  }
  return out;
}

const COLUMN: Record<MovementKind, "received" | "distributed" | "disposed"> = {
  receive: "received",
  distribute: "distributed",
  dispose: "disposed",
};

export function monthlyReport(movements: ReportMovement[], month: string): Report {
  const rows = new Map<string, ReportRow>();
  const total = { received: 0, distributed: 0, disposed: 0 };
  for (const m of movements) {
    if (m.occurredOn.slice(0, 7) !== month) continue;
    let row = rows.get(m.category);
    if (!row) {
      row = { category: m.category, received: 0, distributed: 0, disposed: 0 };
      rows.set(m.category, row);
    }
    row[COLUMN[m.kind]] += m.quantity;
    total[COLUMN[m.kind]] += m.quantity;
  }
  return { month, rows: [...rows.values()], total };
}
