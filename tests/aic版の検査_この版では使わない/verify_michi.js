/* 進む道が1本になっているかの検査（2026-08-04新設）

   作った理由: 経営シミュレーターのページの下に、ページ側が置いた「資金繰りカレンダーへ進む」と、
   順路の帯が出す「次へ進む：数字の根拠しらべ」が並び、進む道が2本に見える状態でNMから
   差し戻しを受けた（「2こ進む道がある。すごくわかりにくい」）。同じ形が他のページにも
   残っていないかを機械で見つける。

   検査するもの
   1. ページの下側（縦の55%より下）に、別のページへ移動する大きなボタンが2つ以上ないこと
      対象は href を持つ .jny-next（順路の帯）と .btn.primary（ページ側の主ボタン）。
      保存・決定のボタン（その場で処理して移動しないもの）と、控えめな .btn.ghost、
      本文中のテキストリンクは、道が増えたようには見えないため数えない。
   2. 同じ行き先の主ボタンが1ページに2つ以上ないこと

   使い方: node tests/serve.js を起動しておいて node tests/verify_michi.js
*/
const puppeteer = require("puppeteer-core");
const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const BASE = process.env.BASE || "http://127.0.0.1:8123";

/* 立場を junbi（就農準備）にして、順路の帯が出る状態で見る */
/* 現役農家版のページ。消したページ（経営力チェック・独立と雇用の比較・給与の換算・
   AIに相談する・学校別の入口）は、この版に無いので見に行かない。 */
const PAGES = [
  "/tools/hinmoku.html", "/tools/kiroku.html", "/tools/checkup.html",
  "/tools/sakutsuke.html", "/tools/simulator.html", "/tools/shikin.html",
  "/tools/toushi.html", "/tools/taifu.html", "/tools/nozomi.html",
  "/tools/teian.html", "/tools/keikaku.html", "/tools/konkyo.html",
  "/tools/hanro.html", "/tools/gyakusan.html",
];

const results = [];
function ok(name, cond, detail) {
  results.push({ name, pass: !!cond, detail: detail || "" });
  console.log((cond ? "PASS" : "FAIL") + " | " + name + (detail ? " | " + detail : ""));
}

(async () => {
  const b = await puppeteer.launch({ executablePath: EDGE, headless: "new", args: ["--no-sandbox"] });
  const page = await b.newPage();
  await page.setViewport({ width: 1280, height: 900 });
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
      const h = document.body.scrollHeight;
      const list = [...document.querySelectorAll(".jny-next, .btn.primary, a.btn.primary")]
        .filter(el => el.offsetParent !== null)
        .map(el => {
          const box = el.getBoundingClientRect();
          return {
            top: box.top + window.scrollY,
            text: (el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 30),
            href: el.getAttribute("href") || "",
          };
        });
      /* 別のページへ移動するものだけを「道」と数える（保存・決定はその場の操作） */
      const lower = list.filter(x => x.top > h * 0.55 && x.href && x.href.indexOf("#") !== 0);
      const hrefs = list.filter(x => x.href).map(x => x.href.split("#")[0]);
      const dup = hrefs.filter((v, i) => v && hrefs.indexOf(v) !== i);
      return { lower, dup, total: list.length };
    });
    ok(path + ": 下の方で進む道が1本以内", r.lower.length <= 1,
      r.lower.length ? r.lower.length + "本 " + r.lower.map(x => "「" + x.text + "」").join(" / ") : "");
    ok(path + ": 同じ行き先の主ボタンが重複しない", r.dup.length === 0, r.dup.join(","));
  }

  /* ---------- 上のナビ「ページ一覧」が、開いて中身まで見えるか ----------
     2026-08-04: 右端をぼかすマスクが掛かったままで、開いてもメニューが見えない状態になっていた。
     要素があるか（offsetParent）だけでは気づけなかったので、マスクと実際の大きさまで見る。 */
  await page.goto(BASE + "/tools/check10.html", { waitUntil: "networkidle2" });
  await new Promise(r => setTimeout(r, 1200));
  const sum = await page.$(".nav-more summary");
  if (sum) {
    await sum.click();
    await new Promise(r => setTimeout(r, 700));
    const st = await page.evaluate(() => {
      const d = document.querySelector(".nav-more");
      const menu = d ? d.querySelector(".nav-more-menu") : null;
      const nav = d ? d.closest(".topbar-nav") : null;
      const cs = nav ? getComputedStyle(nav) : null;
      const box = menu ? menu.getBoundingClientRect() : null;
      return {
        open: d ? d.open : false,
        mask: cs ? (cs.maskImage || "none") + "|" + (cs.webkitMaskImage || "none") : "",
        h: box ? Math.round(box.height) : 0,
        items: menu ? menu.querySelectorAll("a").length : 0,
      };
    });
    ok("ナビ: ページ一覧が開く", st.open === true);
    ok("ナビ: メニューにマスクが掛かっていない", st.mask.indexOf("none|none") === 0, st.mask.slice(0, 60));
    ok("ナビ: 中身が描かれている（高さと項目数）", st.h > 100 && st.items >= 5, "h=" + st.h + " items=" + st.items);
  } else {
    ok("ナビ: ページ一覧がある", false, ".nav-more summary が見つからない");
  }

  await b.close();
  const failed = results.filter(x => !x.pass);
  console.log("\n--- " + (results.length - failed.length) + "/" + results.length + " PASS ---");
  process.exit(failed.length ? 1 : 0);
})();
