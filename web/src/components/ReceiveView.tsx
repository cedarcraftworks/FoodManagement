import { useState } from "react";
import { type Api, CATEGORY_LABEL, type Category } from "../lib/api.ts";
import { cleanJan, isValidJan } from "../lib/jan.ts";
import type { ExpiryType } from "../lib/planner.ts";

// ブラウザのバーコード読み取り機能（Android の Chrome などが対応）。型定義がないため最小限だけ書く。
interface BarcodeDetectorLike {
  detect(image: ImageBitmap): Promise<{ rawValue: string }[]>;
}
type BarcodeDetectorCtor = new (options: { formats: string[] }) => BarcodeDetectorLike;
const Detector = (globalThis as unknown as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector;

export function ReceiveView({ api, onSaved }: { api: Api; onSaved: () => Promise<void> }) {
  const [jan, setJan] = useState("");
  const [name, setName] = useState("");
  const [category, setCategory] = useState<Category>("staple");
  const [quantity, setQuantity] = useState(1);
  const [expiresOn, setExpiresOn] = useState("");
  const [expiryType, setExpiryType] = useState<ExpiryType>("best_before");
  const [donor, setDonor] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function lookup(raw: string) {
    const code = cleanJan(raw);
    setJan(code);
    setError(null);
    if (!code) return;
    if (!isValidJan(code)) {
      setError("バーコードの番号が正しくないようです（最後の1桁が合いません）。もう一度確かめてください");
      return;
    }
    const item = await api.findItemByJan(code);
    if (item) {
      setName(item.name);
      setCategory(item.category);
      setMessage(`登録済みの商品「${item.name}」です。数量と期限を入れてください`);
    } else {
      setMessage("はじめての商品です。商品名と種類を入れてください（次からは自動で入ります）");
    }
  }

  async function scan(file: File | undefined) {
    if (!file || !Detector) return;
    try {
      const codes = await new Detector({ formats: ["ean_13", "ean_8"] }).detect(await createImageBitmap(file));
      if (codes.length === 0) setError("バーコードを読み取れませんでした。明るい場所でもう一度撮るか、番号を入力してください");
      else await lookup(codes[0].rawValue);
    } catch {
      setError("バーコードを読み取れませんでした。番号を入力してください");
    }
  }

  return (
    <form
      className="card"
      onSubmit={async (e) => {
        e.preventDefault();
        setError(null);
        try {
          await api.receive({
            jan: jan || undefined,
            name,
            category,
            quantity,
            expiresOn,
            expiryType,
            donor: donor || undefined,
          });
          setMessage(`「${name}」を ${quantity} 個登録しました`);
          setJan("");
          setName("");
          setQuantity(1);
          setExpiresOn("");
          await onSaved();
        } catch (err) {
          setError(err instanceof Error ? err.message : "登録できませんでした");
        }
      }}
    >
      <h2>入荷を登録する</h2>
      <div className="barcode">
        <label className="field">
          <span>バーコードの番号（任意）</span>
          <input
            inputMode="numeric"
            value={jan}
            onChange={(e) => setJan(e.target.value)}
            onBlur={(e) => void lookup(e.target.value)}
            placeholder="例：2000000000015"
          />
        </label>
        {Detector ? (
          <label className="ghost file-button">
            カメラで読む
            <input type="file" accept="image/*" capture="environment" onChange={(e) => void scan(e.target.files?.[0])} />
          </label>
        ) : (
          <p className="muted small">このブラウザはカメラでの読み取りに対応していないため、番号を入力してください。</p>
        )}
      </div>
      {message && (
        <p className="notice" role="status">
          {message}
        </p>
      )}
      <div className="row">
        <label className="field">
          <span>商品名</span>
          <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={200} />
        </label>
        <label className="field">
          <span>種類</span>
          <select value={category} onChange={(e) => setCategory(e.target.value as Category)}>
            {Object.entries(CATEGORY_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>数量（個）</span>
          <input
            type="number"
            min={1}
            max={100000}
            value={quantity}
            onChange={(e) => setQuantity(Number(e.target.value))}
            required
          />
        </label>
      </div>
      <div className="row">
        <label className="field">
          <span>期限の日付</span>
          <input type="date" value={expiresOn} onChange={(e) => setExpiresOn(e.target.value)} required />
        </label>
        <fieldset className="field radio">
          <legend>期限の種類</legend>
          <label>
            <input
              type="radio"
              name="expiryType"
              checked={expiryType === "best_before"}
              onChange={() => setExpiryType("best_before")}
            />
            賞味期限
          </label>
          <label>
            <input
              type="radio"
              name="expiryType"
              checked={expiryType === "use_by"}
              onChange={() => setExpiryType("use_by")}
            />
            消費期限
          </label>
        </fieldset>
        <label className="field">
          <span>寄付元（任意。個人の場合は「個人」）</span>
          <input value={donor} onChange={(e) => setDonor(e.target.value)} maxLength={200} />
        </label>
      </div>
      {error && <p className="error">{error}</p>}
      <button type="submit" className="primary">
        登録する
      </button>
    </form>
  );
}
