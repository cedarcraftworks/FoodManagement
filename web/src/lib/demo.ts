// デモ用：架空の子ども食堂「ひだまり食堂」の在庫で、サーバーなしに動く。
// 商品名・寄付元はすべて架空。JAN コードは店舗内で使う 20 番台の架空の番号。
// 期限は「今日」からの相対日数で作るので、いつ開いても期限が近い物・切れた物がそろう。
// 追加や配布はページを再読み込みすると元に戻る。
import {
  type Api,
  ApiError,
  type Category,
  type DistributionPlan,
  type Item,
  type Lot,
  type Me,
  type NewLot,
  todayInJapan,
} from "./api.ts";
import { type ExpiryType, monthlyReport, plan, type Report, type ReportMovement } from "./planner.ts";

const addDays = (date: string, days: number): string =>
  new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

interface Seed {
  jan?: string;
  name: string;
  category: Category;
  quantity: number;
  expiresIn: number;
  expiryType?: ExpiryType;
  receivedAgo: number;
  donor: string;
}

const SEEDS: Seed[] = [
  { jan: "2000000000015", name: "パックごはん", category: "staple", quantity: 12, expiresIn: 2, receivedAgo: 40, donor: "架空食品株式会社" },
  { jan: "2000000000015", name: "パックごはん", category: "staple", quantity: 20, expiresIn: 60, receivedAgo: 3, donor: "架空食品株式会社" },
  { jan: "2000000000022", name: "レトルトカレー", category: "retort", quantity: 15, expiresIn: 5, receivedAgo: 20, donor: "個人" },
  { jan: "2000000000039", name: "サバの水煮缶", category: "canned", quantity: 18, expiresIn: 200, receivedAgo: 10, donor: "地域の商店（架空）" },
  { jan: "2000000000046", name: "コーンフレーク", category: "staple", quantity: 3, expiresIn: -1, receivedAgo: 50, donor: "個人" },
  { jan: "2000000000053", name: "ミニクッキー", category: "snack", quantity: 10, expiresIn: 10, receivedAgo: 15, donor: "架空製菓" },
  { jan: "2000000000060", name: "りんごジュース", category: "drink", quantity: 24, expiresIn: 30, receivedAgo: 5, donor: "架空食品株式会社" },
  { name: "食パン", category: "staple", quantity: 4, expiresIn: 1, expiryType: "use_by", receivedAgo: 1, donor: "地域のパン屋（架空）" },
  { jan: "2000000000077", name: "しょうゆ", category: "seasoning", quantity: 6, expiresIn: 120, receivedAgo: 8, donor: "個人" },
];

interface StoredMovement extends ReportMovement {
  lotId?: number;
}

export class DemoApi implements Api {
  readonly demo = true;
  private readonly today = todayInJapan();
  private lots: Lot[] = [];
  private items = new Map<string, Item>();
  private movements: StoredMovement[] = [];
  private nextId = 1;
  private settings = { includeExpiredBestBefore: false };

  constructor() {
    for (const s of SEEDS) {
      this.addLot(
        {
          jan: s.jan,
          name: s.name,
          category: s.category,
          quantity: s.quantity,
          expiresOn: addDays(this.today, s.expiresIn),
          expiryType: s.expiryType ?? "best_before",
          donor: s.donor,
        },
        addDays(this.today, -s.receivedAgo),
      );
    }
    // 先月の実績（報告画面で前月を選んだときに表示される）
    const lastMonth = addDays(`${this.today.slice(0, 7)}-01`, -1);
    const past: [ReportMovement["kind"], Category, number][] = [
      ["receive", "staple", 40],
      ["distribute", "staple", 35],
      ["dispose", "staple", 2],
      ["receive", "canned", 20],
      ["distribute", "canned", 14],
      ["receive", "snack", 15],
      ["distribute", "snack", 15],
      ["receive", "drink", 24],
      ["distribute", "drink", 20],
      ["dispose", "drink", 1],
    ];
    for (const [kind, category, quantity] of past) {
      this.movements.push({ kind, category, quantity, occurredOn: lastMonth });
    }
  }

  private addLot(input: NewLot, receivedOn: string): Lot {
    if (input.jan) this.items.set(input.jan, { jan: input.jan, name: input.name, category: input.category });
    const lot: Lot = {
      id: this.nextId++,
      itemName: input.name,
      category: input.category,
      jan: input.jan,
      quantity: input.quantity,
      expiresOn: input.expiresOn,
      expiryType: input.expiryType,
      receivedOn,
      donor: input.donor,
      version: 0,
    };
    this.lots.push(lot);
    this.movements.push({ kind: "receive", category: lot.category, quantity: lot.quantity, occurredOn: receivedOn, lotId: lot.id });
    return lot;
  }

  /** Java 側と同じ：見ていた version が今と同じで、在庫が足りるときだけ減らす（楽観的ロック） */
  private take(lotId: number, quantity: number, version: number): Lot {
    const lot = this.lots.find((l) => l.id === lotId);
    if (!lot) throw new ApiError("在庫が見つかりません", 404);
    if (lot.version !== version || lot.quantity < quantity) {
      throw new ApiError("他のスタッフが先に在庫を更新しました。最新の在庫で確認してください", 409);
    }
    lot.quantity -= quantity;
    lot.version += 1;
    return lot;
  }

  /** デモ専用：別のスタッフが同じ在庫を 1 個配った状態を再現する */
  simulateOtherStaff(lotId: number): void {
    const lot = this.lots.find((l) => l.id === lotId);
    if (!lot || lot.quantity === 0) return;
    this.take(lot.id, 1, lot.version);
    this.movements.push({ kind: "distribute", category: lot.category, quantity: 1, occurredOn: this.today, lotId });
  }

  async me(): Promise<Me> {
    return { email: "demo@example.com", role: "ADMIN", organizationName: "ひだまり食堂（架空）", ...this.settings };
  }

  async listLots(): Promise<Lot[]> {
    return structuredClone(
      this.lots
        .filter((l) => l.quantity > 0)
        .sort((a, b) => a.expiresOn.localeCompare(b.expiresOn) || a.receivedOn.localeCompare(b.receivedOn) || a.id - b.id),
    );
  }

  async findItemByJan(jan: string): Promise<Item | null> {
    return this.items.get(jan) ?? null;
  }

  async receive(input: NewLot): Promise<Lot> {
    if (!input.name.trim()) throw new ApiError("商品名を入力してください", 400);
    if (!(input.quantity > 0)) throw new ApiError("数量は1以上にしてください", 400);
    return structuredClone(this.addLot({ ...input, name: input.name.trim() }, this.today));
  }

  async dispose(lotId: number, quantity: number, version: number, _reason: string): Promise<Lot> {
    const lot = this.take(lotId, quantity, version);
    this.movements.push({ kind: "dispose", category: lot.category, quantity, occurredOn: this.today, lotId });
    return structuredClone(lot);
  }

  async planDistribution(households: number, perHousehold: Record<string, number>): Promise<DistributionPlan> {
    const result = plan(this.lots, households, perHousehold, this.today, this.settings.includeExpiredBestBefore);
    const version = new Map(this.lots.map((l) => [l.id, l.version]));
    return {
      today: this.today,
      picks: result.picks.map((p) => ({ ...p, version: version.get(p.lotId) ?? 0 })),
      shortages: result.shortages,
    };
  }

  async confirmDistribution(picks: { lotId: number; quantity: number; version: number }[]): Promise<void> {
    // 本番のトランザクションと同じく、1 つでも失敗したら何も変えない
    const lotsBefore = structuredClone(this.lots);
    const movementCount = this.movements.length;
    try {
      for (const p of picks) {
        const lot = this.take(p.lotId, p.quantity, p.version);
        this.movements.push({
          kind: "distribute",
          category: lot.category,
          quantity: p.quantity,
          occurredOn: this.today,
          lotId: p.lotId,
        });
      }
    } catch (e) {
      this.lots = lotsBefore;
      this.movements.length = movementCount;
      throw e;
    }
  }

  async monthlyReport(month: string): Promise<Report> {
    return monthlyReport(this.movements, month);
  }

  async updateSettings(includeExpiredBestBefore: boolean): Promise<Me> {
    this.settings = { includeExpiredBestBefore };
    return this.me();
  }
}
