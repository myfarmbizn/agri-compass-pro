/* 総合レビュー対応の検証: 入力値がログに乗らない・実績→作付けの連携が生きる */
const puppeteer = require("puppeteer-core");
const BASE = "http://127.0.0.1:8123";
const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const results = [];
function ok(name, cond, detail) {
  results.push({ name, pass: !!cond });
  console.log((cond ? "PASS" : "FAIL") + " | " + name + (detail ? " | " + String(detail).slice(0, 180) : ""));
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const b = await puppeteer.launch({ executablePath: EDGE, headless: "new" });
  const p = await b.newPage();
  p.on("dialog", async d => { await d.accept(); });
  await p.setViewport({ width: 1280, height: 900 });
  await p.goto(BASE + "/index.html", { waitUntil: "domcontentloaded" });
  await p.evaluate(() => {
    localStorage.clear();
    localStorage.setItem("myfarm-agri-compass-aic:mfkPersona", JSON.stringify("hatten"));
    localStorage.setItem("myfarm-agri-compass-aic:mfkRegion", JSON.stringify("chiba"));
    localStorage.setItem("myfarm-agri-compass-aic:annual", JSON.stringify({
      "2025": { items: [{ cropId: "cb_rice", area10a: 10, qty: 0, sales: 5000000, direct: 0 }] }
    }));
    localStorage.setItem("myfarm-agri-compass-aic:profile", JSON.stringify({
      place: "千葉県", crops: [{ cropId: "cb_rice", area10a: 10 }], laborFamily: 2, updatedAt: new Date().toISOString()
    }));
  });

  // 1. 入力値が操作ログに乗らないこと（実タイプ→oplogのinputイベントのvが空）
  await p.goto(BASE + "/tools/shikin.html", { waitUntil: "domcontentloaded" });
  await sleep(1200);
  await p.click("#inCash", { clickCount: 3 });
  await p.type("#inCash", "998877");
  await p.keyboard.press("Tab");
  await sleep(700);
  const log = await p.evaluate(() => JSON.parse(localStorage.getItem("myfarm-agri-compass-aic:oplog") || "[]"));
  const inputs = log.filter(e => e.e === "input");
  const leak = log.some(e => String(e.v || "").indexOf("998877") > -1);
  ok("1 inputイベントが記録される", inputs.length > 0, "n=" + inputs.length);
  ok("1 入力値がログに入らない", !leak && inputs.every(e => !e.v), JSON.stringify(inputs.slice(-2)));

  // 2. 実績（annual.sales 現行形式）→作付けの決定に「実績」バッジで反映
  await p.goto(BASE + "/tools/sakutsuke.html", { waitUntil: "domcontentloaded" });
  await sleep(1500);
  const badge = await p.evaluate(() => document.body.textContent.indexOf("実績（2025年）") > -1);
  ok("2 実績の診断→作付けの決定の連携（salesで保存した実績が反映）", badge);

  await b.close();
  const fails = results.filter(r => !r.pass);
  console.log("==== 合計 " + results.length + " / 不合格 " + fails.length + " ====");
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error("HARNESS ERROR", e); process.exit(2); });
