import { useEffect, useState } from "react";
import { type Api, categoryLabel, type Me } from "../lib/api.ts";
import type { Report } from "../lib/planner.ts";

const shiftMonth = (month: string, delta: number): string => {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
};

const rate = (disposed: number, distributed: number): string =>
  distributed + disposed === 0 ? "—" : `${((disposed / (distributed + disposed)) * 100).toFixed(1)}%`;

export function ReportView({ api, today, me, onSettings }: { api: Api; today: string; me: Me; onSettings: (m: Me) => void }) {
  const [month, setMonth] = useState(today.slice(0, 7));
  const [report, setReport] = useState<Report | null>(null);

  useEffect(() => {
    api.monthlyReport(month).then(setReport, () => setReport(null));
  }, [api, month]);

  return (
    <div className="stack">
      <section className="card">
        <div className="month-nav">
          <button type="button" className="ghost" onClick={() => setMonth(shiftMonth(month, -1))} aria-label="前の月">
            ←
          </button>
          <h2>{month.replace("-", "年")}月の報告</h2>
          <button type="button" className="ghost" onClick={() => setMonth(shiftMonth(month, 1))} aria-label="次の月">
            →
          </button>
        </div>
        {!report || report.rows.length === 0 ? (
          <p className="muted">この月の記録はありません。</p>
        ) : (
          <table className="report">
            <thead>
              <tr>
                <th>種類</th>
                <th className="num">受入</th>
                <th className="num">配布</th>
                <th className="num">廃棄</th>
                <th className="num">廃棄率</th>
              </tr>
            </thead>
            <tbody>
              {report.rows.map((r) => (
                <tr key={r.category}>
                  <td>{categoryLabel(r.category)}</td>
                  <td className="num">{r.received}</td>
                  <td className="num">{r.distributed}</td>
                  <td className="num">{r.disposed}</td>
                  <td className="num">{rate(r.disposed, r.distributed)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th>合計</th>
                <th className="num">{report.total.received}</th>
                <th className="num">{report.total.distributed}</th>
                <th className="num">{report.total.disposed}</th>
                <th className="num">{rate(report.total.disposed, report.total.distributed)}</th>
              </tr>
            </tfoot>
          </table>
        )}
        <p className="muted small">廃棄率 ＝ 廃棄 ÷（配布 ＋ 廃棄）。単位は個。</p>
      </section>

      {me.role === "ADMIN" && (
        <section className="card">
          <h2>団体の設定（管理者のみ）</h2>
          <label className="check">
            <input
              type="checkbox"
              checked={me.includeExpiredBestBefore}
              onChange={async (e) => onSettings(await api.updateSettings(e.target.checked))}
            />
            賞味期限が過ぎた食品も配布の提案に含める（消費期限切れは常に含めません）
          </label>
        </section>
      )}
    </div>
  );
}
