import { useState } from "react";
import { type Api, CATEGORY_LABEL, type Category, categoryLabel, type DistributionPlan, isConflict } from "../lib/api.ts";
import { DemoApi } from "../lib/demo.ts";

const DEFAULT_PER: Partial<Record<Category, number>> = { staple: 2, retort: 1, canned: 1, snack: 1, drink: 1 };

export function DistributeView({ api, onChanged }: { api: Api; onChanged: () => Promise<void> }) {
  const [households, setHouseholds] = useState(10);
  const [per, setPer] = useState<Record<string, number>>(() => ({ ...DEFAULT_PER }));
  const [result, setResult] = useState<DistributionPlan | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function makePlan(keepError = false) {
    if (!keepError) setError(null);
    setMessage(null);
    try {
      setResult(await api.planDistribution(households, per));
    } catch (e) {
      setError(e instanceof Error ? e.message : "提案を作れませんでした");
    }
  }

  async function confirm() {
    if (!result) return;
    setError(null);
    try {
      await api.confirmDistribution(result.picks.map(({ lotId, quantity, version }) => ({ lotId, quantity, version })));
      const total = result.picks.reduce((n, p) => n + p.quantity, 0);
      setMessage(`${households} 世帯分、合計 ${total} 個の配布を記録しました`);
      setResult(null);
      await onChanged();
    } catch (e) {
      if (isConflict(e)) {
        setError("他のスタッフが先に在庫を更新したため、確定しませんでした（在庫は何も変わっていません）。最新の在庫で提案し直しました");
        await onChanged();
        await makePlan(true);
      } else {
        setError(e instanceof Error ? e.message : "記録できませんでした");
      }
    }
  }

  return (
    <div className="stack">
      <section className="card">
        <h2>配布の提案を作る</h2>
        <p className="muted">世帯数と、1世帯に配る個数を種類ごとに入れてください。期限の早い在庫から割り当てます。</p>
        <label className="field narrow-field">
          <span>世帯数</span>
          <input
            type="number"
            min={1}
            max={10000}
            value={households}
            onChange={(e) => setHouseholds(Number(e.target.value))}
          />
        </label>
        <div className="per-grid">
          {Object.entries(CATEGORY_LABEL).map(([value, label]) => (
            <label key={value} className="field">
              <span>{label}</span>
              <input
                type="number"
                min={0}
                max={100}
                value={per[value] ?? 0}
                onChange={(e) => setPer({ ...per, [value]: Number(e.target.value) })}
                aria-label={`${label}（1世帯あたり）`}
              />
            </label>
          ))}
        </div>
        <button type="button" className="primary" onClick={() => void makePlan()} disabled={households < 1}>
          提案を作る
        </button>
      </section>

      {message && (
        <output className="notice">
          {message}
        </output>
      )}
      {error && <p className="error">{error}</p>}

      {result && (
        <section className="card" aria-label="配布の提案">
          <h2>提案（{households} 世帯分）</h2>
          {result.shortages.length > 0 && (
            <div className="warning">
              {result.shortages.map((s) => (
                <p key={s.category}>
                  {categoryLabel(s.category)}が {s.short} 個足りません（必要 {s.needed} 個・在庫 {s.available} 個）
                </p>
              ))}
            </div>
          )}
          {result.picks.length === 0 ? (
            <p className="muted">配れる在庫がありません。</p>
          ) : (
            <table className="picks">
              <thead>
                <tr>
                  <th>種類</th>
                  <th>商品</th>
                  <th>個数</th>
                  <th>理由</th>
                </tr>
              </thead>
              <tbody>
                {result.picks.map((p) => (
                  <tr key={p.lotId} className={p.daysLeft <= 3 ? "soon" : ""}>
                    <td>{categoryLabel(p.category)}</td>
                    <td>{p.itemName}</td>
                    <td className="num">{p.quantity}</td>
                    <td>{p.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div className="actions">
            <button type="button" className="primary" onClick={() => void confirm()} disabled={result.picks.length === 0}>
              この内容で配布を記録
            </button>
            {api instanceof DemoApi && result.picks.length > 0 && (
              <button
                type="button"
                className="link"
                onClick={() => {
                  (api as DemoApi).simulateOtherStaff(result.picks[0].lotId);
                  setMessage(`デモ：別のスタッフが「${result.picks[0].itemName}」を1個配った状態にしました。このまま記録すると同時更新が検知されます`);
                }}
              >
                別のスタッフの操作を再現（同時更新のデモ）
              </button>
            )}
          </div>
          <p className="muted small">期限の判断は最終的にスタッフが行ってください。消費期限が切れた食品は提案に含めません。</p>
        </section>
      )}
    </div>
  );
}
