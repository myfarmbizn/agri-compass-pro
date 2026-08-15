/* 3校フィードバック第2弾（2026-07-31・中身の作り替え）の実ブラウザ検証:
   gyakusan（目標から逆算）・kurabe（独立と雇用）・konkyo（数字の根拠しらべ）・
   check10の学びはじめチェック・農の学校の予測→確認ワーク・みらいの例題くらべ表。
   例題の判定の期待値（良い/注意/危ない）は tools/verify_presets.js（node）と同じ前提 */
const puppeteer = require("puppeteer-core");
const BASE = "http://127.0.0.1:8123";
const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const results = [];
let errs = [];
function ok(name, cond, detail) { results.push({ name, pass: !!cond, detail: detail || "" }); console.log((cond ? "PASS" : "FAIL") + " | " + name + (detail ? " | " + detail : "")); }
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({ executablePath: EDGE, headless: "new", args: ["--no-first-run"] });
  const page = await browser.newPage();
  page.on("pageerror", e => errs.push(String(e).slice(0, 200)));
  page.on("console", m => { if (m.type() === "error") errs.push(m.text().slice(0, 200)); });
  page.on("dialog", d => d.accept());

  /* ---------- 1. gyakusan: 目標から逆算（沖縄データで表が出る→試す→simulatorへ） ---------- */
  await page.goto(BASE + "/index.html", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem("myfarm-agri-compass-aic:mfkRegion", JSON.stringify("okinawa")); });
  await page.goto(BASE + "/tools/gyakusan.html", { waitUntil: "domcontentloaded" });
  await sleep(600);
  const gy = await page.evaluate(() => ({
    rows: document.querySelectorAll(".gy-table tr").length - 1,
    firstCrop: (document.querySelector(".gy-go") || {}).dataset ? document.querySelector(".gy-go").dataset.crop : null,
    firstArea: (document.querySelector(".gy-go") || {}).dataset ? +document.querySelector(".gy-go").dataset.area : null,
    cap: document.getElementById("capNote").textContent
  }));
  ok("gyakusan: 品目の行が出る（沖縄）", gy.rows > 3, "rows=" + gy.rows);
  ok("gyakusan: 家族労働の目安の注記が出る", gy.cap.indexOf("月160時間") > -1, gy.cap.slice(0, 50));
  await page.click(".gy-go");
  await page.waitForFunction(() => location.pathname.endsWith("simulator.html"), { timeout: 8000 });
  await sleep(800);
  const gyPlan = await page.evaluate(() => JSON.parse(localStorage.getItem("myfarm-agri-compass-aic:simPlan") || "null"));
  ok("gyakusan→simulator: 品目と必要面積が計画に入る", gyPlan && gyPlan.items[0].cropId === gy.firstCrop && gyPlan.items[0].area === gy.firstArea,
    JSON.stringify(gyPlan && gyPlan.items[0]));
  ok("gyakusan→simulator: 目標所得も引き継がれる", gyPlan && gyPlan.targetMan === 200, "targetMan=" + (gyPlan && gyPlan.targetMan));

  /* ---------- 2. kurabe: 例題Aを読み込んで独立側が埋まる ---------- */
  await page.evaluate(() => localStorage.clear());
  await page.goto(BASE + "/tools/kurabe.html?preset=exA", { waitUntil: "domcontentloaded" });
  await sleep(700);
  const kb = await page.evaluate(() => ({
    state: document.getElementById("dokuritsuState").textContent,
    cardShown: document.getElementById("cmpCard").style.display !== "none",
    tbl: document.getElementById("cmpTbl").textContent
  }));
  ok("kurabe: 例題読み込みで独立側が「計画あり」", kb.state.indexOf("計画あり") > -1, kb.state.slice(0, 40));
  ok("kurabe: 比較表が出る", kb.cardShown && kb.tbl.indexOf("資金の最低点") > -1);
  ok("kurabe: 雇用側は求人票なしの案内（未入力時）", kb.tbl.indexOf("求人票なし") > -1);

  /* ---------- 3. konkyo: 数字の一覧→出どころ選択→永続 ---------- */
  await page.goto(BASE + "/tools/konkyo.html", { waitUntil: "domcontentloaded" });
  await sleep(600);
  const kn1 = await page.evaluate(() => ({
    rows: document.querySelectorAll("#cropRows .kn-row").length,
    planRows: document.querySelectorAll("#planRows .kn-row").length,
    hanro: document.querySelectorAll("#hanroRows .kn-row").length
  }));
  ok("konkyo: 品目の数字行（例題A=2品目×4）", kn1.rows === 8, "rows=" + kn1.rows);
  ok("konkyo: 計画全体の行が出る（生活費・固定費・自己資金・目標・借入・投資）", kn1.planRows === 6, "rows=" + kn1.planRows);
  ok("konkyo: 売り先の行が品目ごとに出る", kn1.hanro === 2, "rows=" + kn1.hanro);
  await page.select("#cropRows .kn-row select", "jisseki");
  await sleep(300);
  await page.reload({ waitUntil: "domcontentloaded" });
  await sleep(600);
  const kn2 = await page.evaluate(() => ({
    sel: document.querySelector("#cropRows .kn-row select").value,
    thin: document.getElementById("thinList").textContent
  }));
  ok("konkyo: 選んだ出どころが再読込後も残る", kn2.sel === "jisseki", kn2.sel);
  ok("konkyo: 未選択の数字が相談リストに出る", kn2.thin.indexOf("単価") > -1, kn2.thin.slice(0, 60));

  /* ---------- 4. check10: 学びはじめの自己チェック ---------- */
  await page.goto(BASE + "/tools/check10.html?p=junbi", { waitUntil: "domcontentloaded" });
  await sleep(600);
  /* AIC版: 2つのチェックは切り替えで1つずつ出す。junbi の既定は経営力チェック側 */
  const segState = await page.evaluate(() => ({
    keiei: document.getElementById("paneKeiei").style.display !== "none",
    manabi: document.getElementById("paneManabi").style.display !== "none",
  }));
  ok("check10: junbi の既定は経営力チェック側だけが出る", segState.keiei && !segState.manabi, JSON.stringify(segState));
  await page.click('#segCheck button[data-v="manabi"]');
  await sleep(300);
  const mOpen = await page.evaluate(() => document.getElementById("paneManabi").style.display !== "none");
  ok("check10: 切り替えで学びはじめチェックが出る", mOpen === true);
  const preset = await page.evaluate(() =>
    [...document.querySelectorAll("#mQs .q-item")].every(it => it.querySelector('.q-btn[data-v="0"]').classList.contains("sel0")));
  ok("check10: はじめから全問「まだ」が選ばれている", preset === true);
  await page.evaluate(() => {
    document.querySelectorAll("#mQs .q-item").forEach(function (item, i) {
      var v = i < 4 ? "0" : "2";   // 理解の4問=まだ・残り=言える
      item.querySelector('.q-btn[data-v="' + v + '"]').click();
    });
  });
  await page.click("#mBtnDone");
  await sleep(400);
  const mRes = await page.evaluate(() => document.getElementById("mRes").textContent);
  ok("check10: 3つの面の集計が出る", mRes.indexOf("経営のことばの理解") > -1 && mRes.indexOf("0 / 8") > -1, mRes.slice(0, 60));
  ok("check10: 「まだ」の項目に学ぶページの誘導", mRes.indexOf("このページで触れます") > -1);

  /* ---------- 5. 農の学校: 予測→確認→答え合わせ ---------- */
  await page.goto(BASE + "/sites/nogakko/index.html", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "domcontentloaded" });
  await sleep(500);
  const ngCount = await page.evaluate(() => document.querySelectorAll(".ng-model").length);
  ok("nogakko: 営農モデル5つのカードが出る", ngCount === 5, "count=" + ngCount);
  const ansHidden = await page.evaluate(() => document.querySelector('[data-ans="ng_tahinmoku"]').style.display === "none");
  ok("nogakko: 予想前は答えが見えない", ansHidden === true);
  await page.click('.yb[data-id="ng_tahinmoku"][data-g="良い"]');
  await sleep(200);
  await page.click('.ng-go[data-go="ng_tahinmoku"]');
  await page.waitForFunction(() => location.pathname.endsWith("simulator.html"), { timeout: 8000 });
  await sleep(600);
  await page.goto(BASE + "/sites/nogakko/index.html", { waitUntil: "domcontentloaded" });
  await sleep(500);
  const ans1 = await page.evaluate(() => document.querySelector('[data-ans="ng_tahinmoku"]').textContent);
  ok("nogakko: 戻ると答え合わせが出て「良い」で一致", ans1.indexOf("良い") > -1 && ans1.indexOf("一致") > -1, ans1.slice(0, 80));
  /* 外れのケース: 水稲複合（実際は「注意」）に「良い」と予想した状態を作る */
  await page.evaluate(() => {
    var y = JSON.parse(localStorage.getItem("myfarm-agri-compass-aic:yosokuNg") || "{}");
    y.ng_fukugo = { guess: "良い", visited: true };
    localStorage.setItem("myfarm-agri-compass-aic:yosokuNg", JSON.stringify(y));
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await sleep(500);
  const ans2 = await page.evaluate(() => document.querySelector('[data-ans="ng_fukugo"]').textContent);
  ok("nogakko: 外れの予想は「外れ」と実際の判定（注意）が出る", ans2.indexOf("注意") > -1 && ans2.indexOf("外れ") > -1, ans2.slice(0, 80));

  /* ---------- 6. みらい: 例題くらべ表 ---------- */
  await page.goto(BASE + "/sites/mirai/index.html", { waitUntil: "domcontentloaded" });
  await sleep(500);
  const mi = await page.evaluate(() => ({
    facts: document.querySelectorAll("#factList table tr").length - 1,
    cmp: document.querySelectorAll("#cmpTbl table tr").length - 1,
    cmpText: document.getElementById("cmpTbl").textContent
  }));
  ok("mirai: 前提の一覧に7人の例題経営者", mi.facts === 7, "rows=" + mi.facts);
  ok("mirai: 結果の表も7人分", mi.cmp === 7, "rows=" + mi.cmp);
  ok("mirai: 例題B（先行投資）が「危ない」判定", /例題経営者B[^<]*/.test(mi.cmpText) && mi.cmpText.indexOf("危ない") > -1);
  ok("mirai: 読み込みボタンつき", mi.cmpText.indexOf("読み込む") > -1);

  ok("JSエラー0", errs.length === 0, errs.join(" / "));

  await browser.close();
  const failed = results.filter(r => !r.pass);
  console.log("\n--- " + (results.length - failed.length) + "/" + results.length + " PASS ---");
  process.exit(failed.length ? 1 : 0);
})();
