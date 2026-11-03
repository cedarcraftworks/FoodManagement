import { useCallback, useEffect, useMemo, useState } from "react";
import { DistributeView } from "./components/DistributeView.tsx";
import { LoginView } from "./components/LoginView.tsx";
import { ReceiveView } from "./components/ReceiveView.tsx";
import { ReportView } from "./components/ReportView.tsx";
import { StockView } from "./components/StockView.tsx";
import { type Api, ApiError, HttpApi, type Lot, type Me, todayInJapan } from "./lib/api.ts";
import { DemoApi } from "./lib/demo.ts";

declare const __DEMO__: boolean;
declare const __API_URL__: string;
declare const __REPO_URL__: string;

type Tab = "stock" | "receive" | "distribute" | "report";
const TABS: { id: Tab; label: string }[] = [
  { id: "stock", label: "在庫" },
  { id: "receive", label: "入荷" },
  { id: "distribute", label: "配布" },
  { id: "report", label: "報告" },
];

const TOKEN_KEY = "food-management-token";
const storage = {
  get: (): string | null => {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  set: (v: string | null) => {
    try {
      if (v) localStorage.setItem(TOKEN_KEY, v);
      else localStorage.removeItem(TOKEN_KEY);
    } catch {
      // 保存できない環境でも、このタブの間はログインしたまま使える
    }
  },
};

export function App() {
  const [token, setToken] = useState<string | null>(() => (__DEMO__ ? null : storage.get()));
  const http = useMemo(() => new HttpApi(__API_URL__, () => token), [token]);
  const api: Api = useMemo(() => (__DEMO__ ? new DemoApi() : http), [http]);
  const [tab, setTab] = useState<Tab>("stock");
  const [lots, setLots] = useState<Lot[]>([]);
  const [me, setMe] = useState<Me | null>(null);
  const today = todayInJapan();

  const updateToken = useCallback((t: string | null) => {
    storage.set(t);
    setToken(t);
  }, []);

  const reload = useCallback(async () => {
    try {
      const [nextLots, nextMe] = await Promise.all([api.listLots(), api.me()]);
      setLots(nextLots);
      setMe(nextMe);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) updateToken(null);
    }
  }, [api, updateToken]);

  const loggedIn = __DEMO__ || token !== null;
  useEffect(() => {
    if (loggedIn) void reload();
  }, [loggedIn, reload]);

  return (
    <div className="app">
      <header className="header">
        <div className="brand">
          <span className="logo" aria-hidden="true">
            ▦
          </span>
          <div>
            <h1>FoodManagement</h1>
            <p className="tagline">{me ? me.organizationName : "子ども食堂・フードバンクの在庫と配布の管理"}</p>
          </div>
        </div>
        {!__DEMO__ && token && (
          <button
            type="button"
            className="link"
            onClick={async () => {
              await http.logout().catch(() => undefined);
              updateToken(null);
            }}
          >
            ログアウト
          </button>
        )}
      </header>

      {__DEMO__ && (
        <p className="demo-banner">
          架空の子ども食堂の在庫で動くデモです。登録不要で、入力した内容は再読み込みで元に戻ります。期限は今日を基準に作っています。{" "}
          <a href={__REPO_URL__}>ソースコード</a>
        </p>
      )}

      {!loggedIn ? (
        <LoginView api={http} onToken={updateToken} />
      ) : (
        <>
          <nav className="tabs" aria-label="画面の切り替え">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                className={tab === t.id ? "tab active" : "tab"}
                aria-current={tab === t.id ? "page" : undefined}
                onClick={() => setTab(t.id)}
              >
                {t.label}
              </button>
            ))}
          </nav>
          <main>
            {tab === "stock" && <StockView api={api} lots={lots} today={today} reload={reload} />}
            {tab === "receive" && <ReceiveView api={api} onSaved={reload} />}
            {tab === "distribute" && <DistributeView api={api} onChanged={reload} />}
            {tab === "report" && me && <ReportView api={api} today={today} me={me} onSettings={setMe} />}
          </main>
        </>
      )}
      {__DEMO__ && (
        <footer className="footer">デモの商品名・寄付元・団体名はすべて架空です。</footer>
      )}
    </div>
  );
}
