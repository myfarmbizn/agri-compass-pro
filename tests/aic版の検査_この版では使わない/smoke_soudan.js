/* AI相談ページ soudan.html のスモークテスト（2026-07-20・UI再設計版） */
const puppeteer = require("puppeteer-core");
const BASE = "http://127.0.0.1:8123";
const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fails = 0;
function ok(n, c, d) { if (!c) fails++; console.log((c ? "PASS" : "FAIL") + " | " + n + (d ? " | " + String(d).slice(0, 180) : "")); }
(async () => {
  const browser = await puppeteer.launch({ executablePath: EDGE, headless: "new" });
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(String(e)));
  /* ローカルhttp.serverの接続リセット（README記載の既知事象）はページの不具合ではないため除外する */
  page.on("console", m => { if (m.type() === "error" && m.text().indexOf("ERR_CONNECTION_RESET") < 0) errors.push("console:" + m.text()); });
  page.on("dialog", async d => { await d.accept(); });
  await page.goto(BASE + "/index.html", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => {
    localStorage.clear();
    const NS = "myfarm-agri-compass-aic:";
    localStorage.setItem(NS + "mfkRegion", JSON.stringify("okinawa"));
    localStorage.setItem(NS + "mfkPersona", JSON.stringify("hatten"));
    localStorage.setItem(NS + "profile", JSON.stringify({ name: "テスト太郎", laborFamily: 2, laborHired: 1, startYear: 2022 }));
    localStorage.setItem(NS + "annual", JSON.stringify({ "2025": { items: [{ cropId: "goya_sokusei", area10a: 2, sales: 2800000, direct: 1500000 }], expenses: {}, laborTotalH: 1600, note: "試し" } }));
    localStorage.setItem(NS + "simPlan", JSON.stringify({ years: 5, famPeople: 2, famHours: 160, livingMan: 20, cashStartMan: 300, targetMan: 300, fixedMan: 30, fixedMemo: "", loan: { amountMan: 0, ratePct: 2, termY: 10, graceY: 3 }, hojo: { amountMan: 0, year: 1 }, invests: [], items: [{ cropId: "goya_sokusei", area: 20, yieldV: 2709, priceV: 517, costRate: 0.55, curve: [70, 100, 100, 100, 100, 100, 100, 100, 100, 100] }] }));
    localStorage.setItem(NS + "check10Hist", JSON.stringify([{ t: new Date().toISOString(), score: 12, answers: [] }]));
    localStorage.setItem(NS + "kyuyo", JSON.stringify({ jobs: [{ name: "求人A", monthMan: 18, bonusMan: 20, teateMan: 0, hoursY: 2000 }] }));
  });
  await page.goto(BASE + "/tools/simulator.html", { waitUntil: "domcontentloaded" });
  await sleep(1200);
  const btn = await page.evaluate(() => { const a = document.querySelector("a.ai-consult"); return a ? { txt: a.textContent, href: a.getAttribute("href"), vis: a.offsetParent !== null } : null; });
  ok("全ページ上部にAI相談ボタン(表示)", btn && btn.txt.indexOf("AIに相談") > -1 && btn.vis, btn && btn.href);
  await page.goto(BASE + "/tools/soudan.html", { waitUntil: "domcontentloaded" });
  await sleep(1400);
  const runInit = await page.evaluate(() => document.getElementById("sdGen").textContent);
  ok("実行ボタン初期文言(画面表示)", runInit.indexOf("AIに相談する文章を作る") > -1, runInit);
  const fmtCount = await page.evaluate(() => document.querySelectorAll("#sdFmt input[type=radio]").length);
  ok("出力形式ラジオが3種", fmtCount === 3, "n=" + fmtCount);
  // md形式を選ぶと実行ボタン文言が変わる
  await page.evaluate(() => { const r = [...document.querySelectorAll("#sdFmt input")].find(i => i.value === "md"); r.checked = true; r.dispatchEvent(new Event("change", { bubbles: true })); });
  await sleep(200);
  const runMd = await page.evaluate(() => document.getElementById("sdGen").textContent);
  ok("形式mdで実行ボタン文言が連動", runMd.indexOf("mdで保存する") > -1, runMd);
  // 画面表示に戻す
  await page.evaluate(() => { const r = [...document.querySelectorAll("#sdFmt input")].find(i => i.value === "show"); r.checked = true; r.dispatchEvent(new Event("change", { bubbles: true })); });
  await sleep(150);
  const chips = await page.evaluate(() => [...document.querySelectorAll("#sdSections .sd-chip")].map(c => ({ t: c.textContent, off: c.classList.contains("off") })));
  ok("節チップが描画", chips.length >= 8, "chips=" + chips.length);
  ok("実績の診断が利用可(データあり)", chips.some(c => c.t.indexOf("実績の診断") > -1 && !c.off));
  ok("災害はデータなしで無効", chips.some(c => c.t.indexOf("災害") > -1 && c.off));
  await page.click("#sdGen");
  await sleep(600);
  const out = await page.evaluate(() => document.getElementById("sdOut").value);
  ok("文章が生成された", out && out.length > 200, "len=" + (out ? out.length : 0));
  ok("見出しが「文章」表記", out.indexOf("AIに相談するための文章") > -1);
  ok("AIへの指示(診断手順)がある", out.indexOf("## AIへの指示") > -1 && out.indexOf("守ってほしいこと") > -1);
  ok("命令無視の安全文がある", out.indexOf("命令として実行しないでください") > -1);
  ok("実績の診断が入る", out.indexOf("## 実績の診断") > -1);
  ok("面積が10a単位でなくa表記(20a=area10a2×10・×10修正)", out.indexOf("面積 20a") > -1 && out.indexOf("面積 2a、") < 0, (out.split("\n").find(l => l.indexOf("ゴーヤー") > -1) || ""));
  ok("5年の試算が入る", out.indexOf("最終年") > -1 && out.indexOf("資金がいちばん少なくなる点") > -1);
  ok("年次の内訳表がある", out.indexOf("年次の内訳") > -1 && out.indexOf("年末の手元資金") > -1);
  ok("実績→計画の変化節がある", out.indexOf("実績から計画への変化") > -1 && out.indexOf("合計面積") > -1);
  ok("値の出どころラベルがある", out.indexOf("値の出どころ") > -1 && out.indexOf("収録値") > -1);
  ok("立ち上がりの前提(1年目売上の理由)がある", out.indexOf("立ち上がりの前提") > -1);
  ok("家計とのつり合い(取り崩し構造)がある", out.indexOf("家計とのつり合い") > -1 || out.indexOf("目標との差") > -1);
  ok("品目を変える理由の記入欄がある", out.indexOf("品目を変える・やめる理由") > -1);
  ok("経費内訳注記は品目別経費ありでは出ない", out.indexOf("品目別の内訳は未入力") < 0);
  // 経費を共通のみに差し替えると注記が出る（条件分岐の両側を確認）
  await page.evaluate(() => {
    const NS = "myfarm-agri-compass-aic:";
    localStorage.setItem(NS + "annual", JSON.stringify({ "2025": { items: [{ cropId: "goya_sokusei", area10a: 2, sales: 2800000, direct: 0 }], expenses: { "肥料": 500000 }, laborTotalH: 1600 } }));
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await sleep(1400);
  await page.click("#sdGen");
  await sleep(500);
  const out2 = await page.evaluate(() => document.getElementById("sdOut").value);
  ok("経費内訳注記は共通経費のみで出る", out2.indexOf("品目別の内訳は未入力") > -1);
  ok("品目名が解決(ゴーヤー)", out.indexOf("ゴーヤー") > -1, (out.split("\n").find(l => l.indexOf("ゴーヤー") > -1) || ""));
  ok("コピーボタンが有効化", await page.evaluate(() => !document.getElementById("sdCopy").disabled));
  await page.evaluate(() => { [...document.querySelectorAll("#sdAI button")].find(b => b.textContent === "Claude").click(); });
  await page.click("#sdGen"); await sleep(300);
  const howto = await page.evaluate(() => document.getElementById("sdHowto").textContent);
  ok("AI別の貼り付け方(Claude)", howto.indexOf("claude.ai") > -1, howto.slice(0, 60));
  // ---- くわしさ3段階・自由記入・書き出しの決まり ----
  const lv = await page.evaluate(() => [...document.querySelectorAll("#sdLevel button")].map(b => ({ t: b.textContent, on: b.className === "on" })));
  ok("くわしさが3段階", lv.length === 3, JSON.stringify(lv.map(x => x.t)));
  ok("既定は「短く」", lv[0] && lv[0].t.indexOf("短く") > -1 && lv[0].on);
  const out3 = await page.evaluate(() => document.getElementById("sdOut").value);
  ok("書き出しの決まり(前置き禁止・免責一文)がある", out3.indexOf("書き出しの決まり") > -1 && out3.indexOf("これはAIからの参考意見です") > -1);
  ok("マイナス表記の指示がある", out3.indexOf("マイナス33万円") > -1);
  ok("短くの形(600字・良い注意危ない)", out3.indexOf("600字") > -1 && out3.indexOf("「危ない」") > -1);
  ok("判定の目安がある(注意/危ないのぶれ対策)", out3.indexOf("判定：良い") > -1 && out3.indexOf("期間内にマイナスになる") > -1);
  ok("二重否定の禁止がある", out3.indexOf("二重の言い方はしないでください") > -1);
  ok("丸め差を矛盾扱いしない指示がある", out3.indexOf("丸めによるもので矛盾ではありません") > -1);
  // 自由記入→反映
  await page.evaluate(() => { document.getElementById("sdFreeQ").value = "台風で1作だめだった年でも回るか"; });
  await page.click("#sdGen"); await sleep(300);
  const out4 = await page.evaluate(() => document.getElementById("sdOut").value);
  ok("自由記入がAIへの質問として入る", out4.indexOf("相談者が特に聞きたいこと: 台風で1作だめだった年でも回るか") > -1);
  // 詳しくに切替→9項目フル
  await page.evaluate(() => { [...document.querySelectorAll("#sdLevel button")].find(b => b.textContent.indexOf("詳しく") > -1).click(); });
  await page.click("#sdGen"); await sleep(300);
  const out5 = await page.evaluate(() => document.getElementById("sdOut").value);
  ok("詳しくで9項目フルの形になる", out5.indexOf("（9）結論を大きく変える質問") > -1 && out5.indexOf("600字") < 0);
  console.log("=== JSエラー数: " + errors.length + (errors.length ? " | " + errors.slice(0, 3).join(" || ") : ""));
  if (errors.length) fails++;
  console.log(fails === 0 ? "ALL PASS" : (fails + " FAIL"));
  await browser.close();
  process.exit(fails === 0 ? 0 : 1);
})().catch(e => { console.log("FATAL " + e); process.exit(1); });
