/* 画面に出る数字のラベルを全ページ分書き出す（人の目で「何の数字か分かるか」を点検するため）。
   2026-08-04新設。トップの「品目3つの面積」が合計なのか品目ごとなのか分からない、という
   指摘を受けて、同じ曖昧さが他のページに無いかを一度に見られるようにした。
   使い方: node tests/serve.js を起動しておいて node tests/dump_suuji.js */
const puppeteer = require("puppeteer-core");
const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const BASE = process.env.BASE || "http://127.0.0.1:8123";

const PAGES = [
  "/index.html", "/tools/simulator.html", "/tools/shikin.html", "/tools/sakutsuke.html",
  "/tools/checkup.html", "/tools/hinmoku.html", "/tools/taifu.html", "/tools/toushi.html",
  "/tools/keikaku.html", "/tools/gyakusan.html", "/tools/kurabe.html", "/tools/kyuyo.html",
];

(async () => {
  const b = await puppeteer.launch({ executablePath: EDGE, headless: "new", args: ["--no-sandbox"] });
  const page = await b.newPage();
  await page.setViewport({ width: 1440, height: 1000 });
  page.on("dialog", async d => { await d.accept(); });
  await page.goto(BASE + "/index.html", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem("myfarm-agri-compass-aic:mfkPersona", JSON.stringify("junbi"));
  });

  for (const path of PAGES) {
    await page.goto(BASE + path, { waitUntil: "networkidle2" });
    await new Promise(r => setTimeout(r, 1100));
    const r = await page.evaluate(() => {
      const vis = el => el && el.offsetParent !== null;
      const kpi = [...document.querySelectorAll(".kpi")].filter(vis).map(k => {
        const l = k.querySelector(".k-label"), v = k.querySelector(".k-value");
        return (l ? l.textContent.trim() : "") + " = " + (v ? v.textContent.replace(/\s+/g, " ").trim() : "");
      });
      const th = [...document.querySelectorAll("table th")].filter(vis)
        .map(t => t.textContent.replace(/\s+/g, " ").trim()).filter(Boolean);
      /* 数字を含む見出し・強調 */
      const strong = [...document.querySelectorAll("main h3, main b, main strong")].filter(vis)
        .map(e => e.textContent.replace(/\s+/g, " ").trim())
        .filter(t => t && /[0-9０-９]/.test(t) && t.length < 60);
      return { kpi, th: [...new Set(th)], strong: [...new Set(strong)] };
    });
    console.log("\n==== " + path + " ====");
    if (r.kpi.length) { console.log("[数字のタイル]"); r.kpi.forEach(x => console.log("  " + x)); }
    if (r.th.length) { console.log("[表の見出し] " + r.th.join(" / ")); }
    if (r.strong.length) { console.log("[数字を含む見出し] " + r.strong.join(" / ")); }
  }
  await b.close();
})();
