// 画面のビルド。esbuild でまとめ、dist/ に出力する（CSS は main.tsx から読み込み、app.css として出る）。
//   node build.mjs            … 本番用（Java の API を呼ぶ。API_URL で接続先を指定）
//   node build.mjs --demo     … デモ用（サーバーなし。GitHub Pages で公開）
//   node build.mjs --serve    … 開発用サーバー（http://localhost:5173）
import { copyFileSync, mkdirSync, rmSync } from "node:fs";
import * as esbuild from "esbuild";

const args = new Set(process.argv.slice(2));
const demo = args.has("--demo");
const serve = args.has("--serve");

rmSync("dist", { recursive: true, force: true });
mkdirSync("dist/assets", { recursive: true });
copyFileSync("index.html", "dist/index.html");

const options = {
  entryPoints: { app: "src/main.tsx" },
  bundle: true,
  format: "esm",
  outdir: "dist/assets",
  minify: !serve,
  sourcemap: true,
  target: "es2022",
  jsx: "automatic",
  define: {
    __DEMO__: JSON.stringify(demo),
    __API_URL__: JSON.stringify(process.env.API_URL ?? "http://localhost:8080"),
    __REPO_URL__: JSON.stringify("https://github.com/cedarcraftworks/FoodManagement"),
    "process.env.NODE_ENV": JSON.stringify(serve ? "development" : "production"),
  },
  logLevel: "info",
};

if (serve) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
  await ctx.serve({ servedir: "dist", port: 5173 });
} else {
  await esbuild.build(options);
}
