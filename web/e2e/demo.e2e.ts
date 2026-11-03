// デモ版を本物のブラウザ（Chromium）で操作して確かめる E2E テスト。
// 先に `npm run build:demo` で dist/ を作ってから `npm run e2e` で実行する。
// SCREENSHOTS=<フォルダ> を付けると、README と説明書用の画面の画像も保存する。
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { extname, join } from "node:path";
import { after, before, test } from "node:test";
import { type Browser, chromium, type Page } from "playwright";

const DIST = new URL("../dist/", import.meta.url).pathname;
const SHOTS = process.env.SCREENSHOTS;
const TYPES: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" };

let server: Server;
let browser: Browser;
let page: Page;
const errors: string[] = [];

const shot = async (name: string) => {
  if (SHOTS) await page.screenshot({ path: join(SHOTS, `${name}.png`), fullPage: true });
};

before(async () => {
  server = createServer(async (req, res) => {
    const path = req.url === "/" ? "/index.html" : (req.url ?? "/");
    try {
      const body = await readFile(join(DIST, path));
      res.writeHead(200, { "Content-Type": TYPES[extname(path)] ?? "application/octet-stream" });
      res.end(body);
    } catch {
      res.writeHead(404).end();
    }
  });
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  browser = await chromium.launch();
  page = await browser.newPage({ viewport: { width: 420, height: 900 } });
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`http://localhost:${port}/`);
});

after(async () => {
  await browser?.close();
  server?.close();
});

test("在庫は期限の近い順で、期限切れが目立つ", async () => {
  await page.getByRole("heading", { name: "在庫（期限が近い順）" }).waitFor();
  const first = page.getByRole("listitem").first();
  assert.match((await first.textContent()) ?? "", /コーンフレーク.*期限切れ/);
  await shot("stock");
});

test("期限切れの在庫を廃棄として記録できる", async () => {
  page.once("dialog", (d) => void d.accept("3"));
  await page.getByRole("listitem").filter({ hasText: "コーンフレーク" }).getByRole("button", { name: "廃棄を記録" }).click();
  await page.getByText("「コーンフレーク」を 3 個、廃棄として記録しました").waitFor();
  assert.equal(await page.getByRole("listitem").filter({ hasText: "コーンフレーク" }).count(), 0);
});

test("登録済みのバーコードを入れると商品名が自動で入る", async () => {
  await page.getByRole("button", { name: "入荷" }).click();
  const jan = page.getByLabel("バーコードの番号（任意）");
  await jan.fill("2000000000039");
  await jan.blur();
  await page.getByText("登録済みの商品「サバの水煮缶」です").waitFor();
  assert.equal(await page.getByLabel("商品名").inputValue(), "サバの水煮缶");

  await jan.fill("2000000000038");
  await jan.blur();
  await page.getByText("バーコードの番号が正しくないようです").waitFor();
  await jan.fill("2000000000039");
  await jan.blur();

  await page.getByLabel("数量（個）").fill("6");
  await page.getByLabel("期限の日付").fill("2027-06-30");
  await shot("receive");
  await page.getByRole("button", { name: "登録する" }).click();
  await page.getByText("「サバの水煮缶」を 6 個登録しました").waitFor();
});

test("配布の提案を作り、同時更新を検知してから記録できる", async () => {
  await page.getByRole("button", { name: "配布" }).click();
  await page.getByLabel("世帯数").fill("8");
  await page.getByRole("button", { name: "提案を作る" }).click();
  const proposal = page.getByRole("region", { name: "配布の提案" });
  await proposal.waitFor();
  assert.match((await proposal.textContent()) ?? "", /食パン.*期限まで1日/);
  await shot("distribute");

  await page.getByRole("button", { name: /別のスタッフの操作を再現/ }).click();
  await page.getByRole("button", { name: "この内容で配布を記録" }).click();
  await page.getByText("他のスタッフが先に在庫を更新したため、確定しませんでした").waitFor();

  await page.getByRole("button", { name: "この内容で配布を記録" }).click();
  await page.getByText(/8 世帯分、合計 \d+ 個の配布を記録しました/).waitFor();
});

test("報告に今月の配布と廃棄が出る", async () => {
  await page.getByRole("button", { name: "報告" }).click();
  await page.getByRole("heading", { name: /月の報告/ }).waitFor();
  const table = page.getByRole("table");
  assert.match((await table.textContent()) ?? "", /主食/);
  await shot("report");
});

test("画面のエラーが起きていない", () => {
  assert.deepEqual(errors, []);
});
