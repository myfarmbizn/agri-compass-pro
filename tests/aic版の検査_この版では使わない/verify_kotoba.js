/* 画面に出る日本語の検査（2026-08-04新設）

   作った理由: AIC版の初版で、Claudeが書いた画面の文言に不自然な日本語が多数あり
   NMから差し戻しを受けた（「日本語がへんな場所だらけ」）。目視だけでは同じことが起きるので、
   機械で拾える型だけを検査に固定する。禁止語の検査（check_kinshigo.py）とは別の層で、
   こちらは「語」ではなく「文の作り」を見る。

   検査するもの
   1. 1つの文が70字を超える（読点だけで延ばした文）
   2. 同じ語が1文の中で2回以上出る（ところ・こと・もの・ここ・ため・など）
   3. 読み手を三人称で指す言い方（その人の・利用者は）
   4. お役所調・翻訳調の言い回し（〜を行います／〜という形で／〜することが可能）
   5. 「ところから〜ところまで」の組

   使い方: node tests/serve.js を起動しておいて node tests/verify_kotoba.js
   対象は AIC版で新しく書いた画面のみ（道具ページは元の版から引き継いだ文のため対象外）。
*/
const puppeteer = require("puppeteer-core");
const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const BASE = process.env.BASE || "http://127.0.0.1:8123";
/* この版の入口は段1（品目と単価）。学校別の入口は置いていない */
const TARGETS = ["/tools/hinmoku.html", "/tools/nozomi.html", "/tools/teian.html"];

const MAX_LEN = 70;
const DUP_WORDS = ["ところ", "こと", "もの", "ここ", "ため", "など"];
const NG_PATTERNS = [
  [/その人の/, "読み手のことは「あなたの」と書く"],
  [/利用者は/, "画面の中では読み手を「利用者」と呼ばない"],
  [/を行います|を実施します/, "お役所調。「〜します」に開く"],
  [/という形で|といった形/, "翻訳調"],
  [/することが可能|することができます/, "「できます」に開く"],
  [/ところから[^。]{0,40}ところまで/, "「ところ」の重ね使い"],
];

const results = [];
function ok(name, cond, detail) {
  results.push({ name, pass: !!cond, detail: detail || "" });
  console.log((cond ? "PASS" : "FAIL") + " | " + name + (detail ? " | " + detail : ""));
}

(async () => {
  const b = await puppeteer.launch({ executablePath: EDGE, headless: "new", args: ["--no-sandbox"] });
  for (const t of TARGETS) {
    const p = await b.newPage();
    await p.setViewport({ width: 1280, height: 900 });
    await p.goto(BASE + t, { waitUntil: "networkidle2" });
    await p.evaluate(() => localStorage.clear());
    await p.reload({ waitUntil: "networkidle2" });
    await new Promise(r => setTimeout(r, 700));
    /* 立場を選んだあとに現れる文言も検査に含める */
    const card = await p.$('.p-card[data-pid="junbi"]');
    if (card) { await card.click(); await new Promise(r => setTimeout(r, 900)); }

    const texts = await p.evaluate(() => {
      const out = [];
      const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let n;
      while ((n = walk.nextNode())) {
        const s = (n.textContent || "").replace(/\s+/g, " ").trim();
        if (!s) continue;
        const el = n.parentElement;
        if (!el || el.offsetParent === null) continue;
        if (["SCRIPT", "STYLE"].indexOf(el.tagName) > -1) continue;
        if (el.closest(".wipe-bar")) continue;   /* 共通の注意書きは元の版から引き継いだ文 */
        out.push(s);
      }
      return out;
    });
    await p.close();

    /* 文に割ってから見る */
    const sentences = [];
    texts.forEach(s => s.split(/(?<=。)/).forEach(x => { const y = x.trim(); if (y.length > 3) sentences.push(y); }));

    const tooLong = sentences.filter(s => s.replace(/（[^）]*）/g, "").length > MAX_LEN);
    ok(t + ": " + MAX_LEN + "字を超える文がない", tooLong.length === 0,
      tooLong.length ? tooLong.length + "件 例: " + tooLong[0].slice(0, 60) : "");

    const dup = [];
    sentences.forEach(s => {
      DUP_WORDS.forEach(w => {
        const c = s.split(w).length - 1;
        if (c >= 2) dup.push("「" + w + "」×" + c + ": " + s.slice(0, 50));
      });
    });
    ok(t + ": 1つの文で同じ語を2回使っていない", dup.length === 0,
      dup.length ? dup.length + "件 例: " + dup[0] : "");

    const ng = [];
    sentences.forEach(s => NG_PATTERNS.forEach(([re, why]) => { if (re.test(s)) ng.push(why + ": " + s.slice(0, 50)); }));
    ok(t + ": 翻訳調・お役所調の言い回しがない", ng.length === 0,
      ng.length ? ng.length + "件 例: " + ng[0] : "");
  }
  await b.close();

  const failed = results.filter(r => !r.pass);
  console.log("\n--- " + (results.length - failed.length) + "/" + results.length + " PASS ---");
  process.exit(failed.length ? 1 : 0);
})();
