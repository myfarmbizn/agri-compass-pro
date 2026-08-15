/* v3改修の検証（従業員入力・入金月編集・給与化・在圃グラフ常時表示） */
const puppeteer = require("puppeteer-core");
const BASE = "http://127.0.0.1:8123";
const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const results = [];
let browser, page;
function ok(name, cond, detail) {
  results.push({ name, pass: !!cond });
  console.log((cond ? "PASS" : "FAIL") + " | " + name + (detail ? " | " + String(detail).slice(0, 180) : ""));
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
const visText = () => [...document.querySelectorAll("main *")].filter(el => el.offsetParent !== null && !el.children.length).map(el => el.textContent).join(" ");

(async () => {
  browser = await puppeteer.launch({ executablePath: EDGE, headless: "new" });
  page = await browser.newPage();
  page.on("pageerror", e => console.log("PAGEERR", String(e).slice(0, 150)));
  page.on("dialog", async d => { await d.accept(); });
  await page.setViewport({ width: 1280, height: 900 });
  await page.goto(BASE + "/index.html", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem("myfarm-agri-compass-aic:mfkPersona", JSON.stringify("hatten"));
    localStorage.setItem("myfarm-agri-compass-aic:mfkRegion", JSON.stringify("okinawa"));
  });

  // 1. checkup: 従業員区画＋人を足す→laborForce保存
  await page.goto(BASE + "/tools/checkup.html", { waitUntil: "domcontentloaded" });
  await sleep(1300);
  const wk = await page.evaluate(() => ({ btn: !!document.getElementById("addWorkerBtn"), rows: !!document.getElementById("wkRows") }));
  ok("1 従業員・アルバイト区画", wk.btn && wk.rows);
  await page.click("#addWorkerBtn");
  await sleep(400);
  await page.evaluate(() => { const b = [...document.querySelectorAll("#wkRows .mon-btn")].find(x => x.textContent.indexOf("5") > -1); if (b) b.click(); });
  await sleep(500);
  const lf = await page.evaluate(() => JSON.parse(localStorage.getItem("myfarm-agri-compass-aic:laborForce") || "null"));
  ok("1 laborForce保存（1人・月選択）", lf && lf.workers && lf.workers.length === 1, JSON.stringify(lf).slice(0, 120));

  // 1b. 品目別経費の折りたたみ
  const dtl = await page.evaluate(() => document.body.innerHTML.indexOf("この品目の経費をくわしく入れる") > -1);
  ok("1b 品目別経費のくわしい入力", dtl);

  // 2. sakutsuke: 入金月12マス＋労働上限線（家族＋従業員）
  await page.goto(BASE + "/tools/sakutsuke.html", { waitUntil: "domcontentloaded" });
  await sleep(1500);
  const sk = await page.evaluate(() => ({
    imcells: document.querySelectorAll(".im-cell").length,
    legend: document.body.textContent.indexOf("家族＋従業員") > -1,
  }));
  ok("2 品目行に入金月12マス", sk.imcells >= 12, "cells=" + sk.imcells);
  ok("2 上限線の凡例（家族＋従業員・仮）", sk.legend);
  // 入金月を1マス切り替え→cropCustomに書き戻し
  const before = await page.evaluate(() => JSON.stringify(JSON.parse(localStorage.getItem("myfarm-agri-compass-aic:cropCustom") || "{}")));
  await page.evaluate(() => { const c = [...document.querySelectorAll(".im-cell")].find(x => !x.classList.contains("on") && !x.disabled); if (c) c.click(); });
  await sleep(700);
  const after = await page.evaluate(() => localStorage.getItem("myfarm-agri-compass-aic:cropCustom") || "");
  ok("2 マス押下でcropCustomへ書き戻し", after.indexOf("income") > -1 && after !== before, after.slice(0, 100));

  // 3. shikin: 月チップが押しボタン＋給与ラベル
  await page.goto(BASE + "/tools/shikin.html", { waitUntil: "domcontentloaded" });
  await sleep(1300);
  const sh = await page.evaluate(() => ({
    label: document.body.textContent.indexOf("自分・家族への給与") > -1,
    seikatsu: (() => { const t = [...document.querySelectorAll("main label, main h3, main p, main .band-note")].filter(el => el.offsetParent !== null).map(e => e.textContent).join(" "); return t.indexOf("生活費") > -1; })(),
  }));
  ok("3 資金繰りに給与ラベル", sh.label);
  ok("3 生活費の語が画面に無い", !sh.seikatsu);

  // 4. simulator: 骨格に生活費なし・ステップ4に給与
  await page.goto(BASE + "/tools/simulator.html", { waitUntil: "domcontentloaded" });
  await sleep(1300);
  const sim = await page.evaluate(() => ({
    stp1: (document.getElementById("stp1") || {}).textContent || "",
    body: document.body.textContent,
  }));
  ok("4 骨格に生活費が無い", sim.stp1.indexOf("生活費") === -1);
  ok("4 給与ラベルと税務注記", sim.body.indexOf("自分・家族への給与") > -1 && sim.body.indexOf("事業主貸") > -1);

  // 5. keikaku: 生活費表記なし
  await page.goto(BASE + "/tools/keikaku.html", { waitUntil: "domcontentloaded" });
  await sleep(1500);
  const kk = await page.evaluate(() => {
    const t = [...document.querySelectorAll("main *")].filter(el => el.offsetParent !== null && !el.children.length).map(e => e.textContent).join(" ");
    return { seikatsu: t.indexOf("生活費") > -1, kyuyo: t.indexOf("自分・家族への給与") > -1 };
  });
  ok("5 計画書から生活費表記が消えた", !kk.seikatsu && kk.kyuyo, JSON.stringify(kk));

  // 6. taifu: 千葉・災害未選択でも在圃グラフが出る
  await page.evaluate(() => {
    localStorage.setItem("myfarm-agri-compass-aic:mfkRegion", JSON.stringify("chiba"));
    localStorage.removeItem("myfarm-agri-compass-aic:taifuLocal");
  });
  await page.goto(BASE + "/tools/taifu.html", { waitUntil: "domcontentloaded" });
  await sleep(1500);
  const tf = await page.evaluate(() => ({
    svg: !!document.querySelector("#vizCore svg"),
    hzState: (document.getElementById("hzState") || {}).textContent || "",
  }));
  ok("6 災害未選択でも在圃グラフ表示", tf.svg, tf.hzState);

  await browser.close();
  const fails = results.filter(r => !r.pass);
  console.log("\n==== 合計 " + results.length + " / 不合格 " + fails.length + " ====");
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error("HARNESS ERROR", e); process.exit(2); });
