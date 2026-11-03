import { useState } from "react";
import type { HttpApi } from "../lib/api.ts";

export function LoginView({ api, onToken }: { api: HttpApi; onToken: (token: string) => void }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [organizationName, setOrganizationName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="card narrow"
      onSubmit={async (e) => {
        e.preventDefault();
        setError(null);
        try {
          const res =
            mode === "login"
              ? await api.login(email, password)
              : await api.register(organizationName, email, password);
          onToken(res.token);
        } catch (err) {
          setError(err instanceof Error ? err.message : "ログインできませんでした");
        }
      }}
    >
      <h2>{mode === "login" ? "ログイン" : "団体を登録する"}</h2>
      {mode === "register" && (
        <label className="field">
          <span>団体名</span>
          <input value={organizationName} onChange={(e) => setOrganizationName(e.target.value)} required maxLength={200} />
        </label>
      )}
      <label className="field">
        <span>メールアドレス</span>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
      </label>
      <label className="field">
        <span>パスワード（8文字以上）</span>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={8}
          autoComplete={mode === "login" ? "current-password" : "new-password"}
        />
      </label>
      {mode === "register" && <p className="muted small">登録した人が団体の管理者になります。スタッフは管理者が追加します。</p>}
      {error && <p className="error">{error}</p>}
      <button type="submit" className="primary">
        {mode === "login" ? "ログイン" : "登録する"}
      </button>
      <button type="button" className="link" onClick={() => setMode(mode === "login" ? "register" : "login")}>
        {mode === "login" ? "はじめての団体は登録" : "登録済みの方はログイン"}
      </button>
    </form>
  );
}
