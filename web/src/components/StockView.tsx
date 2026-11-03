import { useState } from "react";
import { type Api, categoryLabel, isConflict, type Lot } from "../lib/api.ts";
import { daysBetween, type Status, status } from "../lib/planner.ts";

const STATUS_LABEL: Record<Status, string> = {
  expired: "期限切れ",
  within3: "3日以内",
  within7: "7日以内",
  ok: "",
};

export function expiryText(lot: Lot, today: string): string {
  const days = daysBetween(today, lot.expiresOn);
  const kind = lot.expiryType === "use_by" ? "消費期限" : "賞味期限";
  if (days < 0) return `${kind} ${lot.expiresOn}（${-days}日過ぎ）`;
  if (days === 0) return `${kind} ${lot.expiresOn}（今日）`;
  return `${kind} ${lot.expiresOn}（あと${days}日）`;
}

export function StockView({
  api,
  lots,
  today,
  reload,
}: {
  api: Api;
  lots: Lot[];
  today: string;
  reload: () => Promise<void>;
}) {
  const [message, setMessage] = useState<string | null>(null);
  const counts = { expired: 0, within3: 0, within7: 0, ok: 0 };
  for (const lot of lots) counts[status(lot.expiresOn, today)] += 1;
  const total = lots.reduce((n, l) => n + l.quantity, 0);

  const statusOf = (lot: Lot) => status(lot.expiresOn, today);

  async function dispose(lot: Lot) {
    const input = window.prompt(`「${lot.itemName}」を何個廃棄しますか？（最大 ${lot.quantity} 個）`, String(lot.quantity));
    if (input === null) return;
    const quantity = Number(input);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > lot.quantity) {
      setMessage("1以上、在庫数以下の数を入れてください");
      return;
    }
    try {
      await api.dispose(lot.id, quantity, lot.version, statusOf(lot) === "expired" ? "期限切れ" : "その他");
      setMessage(`「${lot.itemName}」を ${quantity} 個、廃棄として記録しました`);
    } catch (e) {
      setMessage(isConflict(e) ? "他のスタッフが先に更新しました。最新の在庫を表示します" : String(e));
    }
    await reload();
  }

  return (
    <div className="stack">
      <section className="summary-grid" aria-label="期限の状況">
        <div className="stat danger">
          <span className="stat-num">{counts.expired}</span>
          <span>期限切れ</span>
        </div>
        <div className="stat warn">
          <span className="stat-num">{counts.within3}</span>
          <span>3日以内</span>
        </div>
        <div className="stat caution">
          <span className="stat-num">{counts.within7}</span>
          <span>7日以内</span>
        </div>
        <div className="stat">
          <span className="stat-num">{total}</span>
          <span>在庫の合計（個）</span>
        </div>
      </section>
      {message && (
        <output className="notice">
          {message}
        </output>
      )}
      <section className="card">
        <h2>在庫（期限が近い順）</h2>
        {lots.length === 0 && <p className="muted">在庫がありません。「入荷」から登録してください。</p>}
        <ul className="lots">
          {lots.map((lot) => {
            const s = statusOf(lot);
            return (
              <li key={lot.id} className={`lot lot-${s}`}>
                <div className="lot-main">
                  <span className="category">{categoryLabel(lot.category)}</span>
                  <strong>{lot.itemName}</strong>
                  {STATUS_LABEL[s] && <span className={`badge badge-${s}`}>{STATUS_LABEL[s]}</span>}
                </div>
                <div className="lot-sub">
                  <span className="qty">{lot.quantity} 個</span>
                  <span>{expiryText(lot, today)}</span>
                  {lot.donor && <span className="muted">寄付：{lot.donor}</span>}
                </div>
                <button type="button" className="ghost" onClick={() => void dispose(lot)}>
                  廃棄を記録
                </button>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
