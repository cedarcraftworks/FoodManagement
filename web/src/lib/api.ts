// 画面が使うデータの窓口。本番は Java の API、デモはブラウザの中だけで動く。
import type { ExpiryType, Pick, Report, Shortage } from "./planner.ts";

export type Category = "staple" | "retort" | "canned" | "seasoning" | "snack" | "drink" | "fresh" | "other";

export const CATEGORY_LABEL: Record<Category, string> = {
  staple: "主食",
  retort: "レトルト・インスタント",
  canned: "缶詰・瓶詰",
  seasoning: "調味料",
  snack: "お菓子",
  drink: "飲料",
  fresh: "生鮮",
  other: "その他",
};

export const categoryLabel = (c: string): string => CATEGORY_LABEL[c as Category] ?? c;

export interface Lot {
  id: number;
  itemName: string;
  category: Category;
  jan?: string;
  quantity: number;
  expiresOn: string;
  expiryType: ExpiryType;
  receivedOn: string;
  donor?: string;
  version: number;
}

export interface Item {
  jan: string;
  name: string;
  category: Category;
}

export interface Me {
  email: string;
  role: "ADMIN" | "STAFF";
  organizationName: string;
  includeExpiredBestBefore: boolean;
}

export interface NewLot {
  jan?: string;
  name: string;
  category: Category;
  quantity: number;
  expiresOn: string;
  expiryType: ExpiryType;
  donor?: string;
}

export type PlannedPick = Pick & { version: number };

export interface DistributionPlan {
  today: string;
  picks: PlannedPick[];
  shortages: Shortage[];
}

export interface Api {
  readonly demo: boolean;
  me(): Promise<Me>;
  listLots(): Promise<Lot[]>;
  findItemByJan(jan: string): Promise<Item | null>;
  receive(lot: NewLot): Promise<Lot>;
  dispose(lotId: number, quantity: number, version: number, reason: string): Promise<Lot>;
  planDistribution(households: number, perHousehold: Record<string, number>): Promise<DistributionPlan>;
  confirmDistribution(picks: { lotId: number; quantity: number; version: number }[]): Promise<void>;
  monthlyReport(month: string): Promise<Report>;
  updateSettings(includeExpiredBestBefore: boolean): Promise<Me>;
}

export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

/** 他のスタッフが先に在庫を更新していたとき（409 Conflict） */
export const isConflict = (e: unknown): boolean => e instanceof ApiError && e.status === 409;

/** 日本時間の今日（YYYY-MM-DD） */
export const todayInJapan = (): string => new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });

/** Java の API を呼ぶ。トークンは Authorization ヘッダーで送る。 */
export class HttpApi implements Api {
  readonly demo = false;
  private readonly baseUrl: string;
  private readonly token: () => string | null;

  constructor(baseUrl: string, token: () => string | null) {
    this.baseUrl = baseUrl;
    this.token = token;
  }

  private async call<T>(method: string, path: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    const token = this.token();
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (res.status === 204) return undefined as T;
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new ApiError(data.error ?? "通信に失敗しました", res.status);
    return data as T;
  }

  me = () => this.call<Me>("GET", "/api/me");
  listLots = () => this.call<Lot[]>("GET", "/api/lots");
  findItemByJan = async (jan: string) => {
    try {
      return await this.call<Item>("GET", `/api/items/by-jan/${encodeURIComponent(jan)}`);
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) return null;
      throw e;
    }
  };
  receive = (lot: NewLot) => this.call<Lot>("POST", "/api/lots", lot);
  dispose = (lotId: number, quantity: number, version: number, reason: string) =>
    this.call<Lot>("POST", `/api/lots/${lotId}/dispose`, { quantity, version, reason });
  planDistribution = (households: number, perHousehold: Record<string, number>) =>
    this.call<DistributionPlan>("POST", "/api/distributions/plan", { households, perHousehold });
  confirmDistribution = (picks: { lotId: number; quantity: number; version: number }[]) =>
    this.call<void>("POST", "/api/distributions", { picks });
  monthlyReport = (month: string) => this.call<Report>("GET", `/api/reports/monthly?month=${month}`);
  updateSettings = (includeExpiredBestBefore: boolean) =>
    this.call<Me>("PUT", "/api/organization/settings", { includeExpiredBestBefore });

  register = (organizationName: string, email: string, password: string) =>
    this.call<{ token: string }>("POST", "/api/auth/register", { organizationName, email, password });
  login = (email: string, password: string) =>
    this.call<{ token: string }>("POST", "/api/auth/login", { email, password });
  logout = () => this.call<void>("POST", "/api/auth/logout");
}
