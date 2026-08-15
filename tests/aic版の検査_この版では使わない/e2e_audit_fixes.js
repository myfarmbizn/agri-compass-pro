/* 公開前総点検で入れた修正の検証（2026-07-19）
   - 投資・雇用→資金繰りの返済引き継ぎ（保存順によらず）
   - 実績の診断→作付けの決定の実績再反映（下書きがあっても）
   - 免責・窓口の地域出し分け（非沖縄でNOSAI沖縄を出さない）
   - kibiページの非沖縄ガード
   - 実績の診断のきび注記の出し分け */
const puppeteer = require("puppeteer-core");
const BASE = "http://127.0.0.1:8123";
const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const results = [];
let browser, page;
function ok(name, cond, detail) {
  results.push({ name, pass: !!cond });
  console.log((cond ? "PASS" : "FAIL") + " | " + name + (detail ? " | " + String(detail).slice(0, 160) : ""));
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  browser = await puppeteer.launch({ executablePath: EDGE, headless: "new" });
  page = await browser.newPage();
  page.on("dialog", async d => { await d.accept(); });
  await page.setViewport({ width: 1280, height: 900 });

  // ---- 1. 非沖縄（島根）での免責・kibiガード・checkup注記 ----
  await page.goto(BASE + "/index.html", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem("myfarm-agri-compass-aic:mfkPersona", JSON.stringify("hatten"));
    localStorage.setItem("myfarm-agri-compass-aic:mfkRegion", JSON.stringify("shimane"));
  });
  await page.goto(BASE + "/tools/checkup.html", { waitUntil: "domcontentloaded" });
  await sleep(1000);
  const ck = await page.evaluate(() => ({
    disc: (document.getElementById("disclaimer") || {}).textContent || "",
    kibiNote: (document.getElementById("kibiLaborNote") || {}).textContent || "",
    body: [...document.querySelectorAll("main *")].filter(el => el.offsetParent !== null && !el.children.length).map(el => el.textContent).join(" ").indexOf("売上には原料代金＋交付金を含む") > -1,
  }));
  ok("1 非沖縄の免責にNOSAI沖縄が出ない", ck.disc.indexOf("NOSAI沖縄") === -1 && ck.disc.indexOf("NOSAI") > -1, ck.disc.slice(0, 80));
  ok("1 checkupのきび注記が非沖縄で出ない", ck.kibiNote.indexOf("きび") === -1, ck.kibiNote);
  ok("1 checkupの交付金文言が非沖縄で出ない", !ck.body);
  await page.goto(BASE + "/tools/kibi.html", { waitUntil: "domcontentloaded" });
  await sleep(800);
  const kb = await page.evaluate(() => document.body.textContent.indexOf("このページは沖縄地域専用です") > -1);
  ok("1 kibiページの非沖縄ガード", kb);
  await page.goto(BASE + "/tools/smart.html", { waitUntil: "domcontentloaded" });
  await sleep(1800);
  const sm = await page.evaluate(() => ({
    win: (document.getElementById("windowBody") || {}).textContent || "",
    head: document.body.textContent.indexOf("沖縄の相談・申請窓口") > -1,
  }));
  ok("1 smartの窓口が非沖縄で農政局案内", sm.win.indexOf("地方農政局") > -1 && sm.win.indexOf("沖縄総合事務局") === -1, sm.win.slice(0, 60));
  ok("1 smartの見出しに沖縄固定がない", !sm.head);

  // ---- 2. 沖縄では従来どおり ----
  await page.evaluate(() => localStorage.setItem("myfarm-agri-compass-aic:mfkRegion", JSON.stringify("okinawa")));
  await page.goto(BASE + "/tools/smart.html", { waitUntil: "domcontentloaded" });
  await sleep(1800);
  const sm2 = await page.evaluate(() => (document.getElementById("windowBody") || {}).textContent || "");
  ok("2 沖縄では沖縄総合事務局の窓口", sm2.indexOf("沖縄総合事務局") > -1, sm2.slice(0, 60));
  await page.goto(BASE + "/tools/checkup.html", { waitUntil: "domcontentloaded" });
  await sleep(1000);
  const ck2 = await page.evaluate(() => ({
    kibiNote: (document.getElementById("kibiLaborNote") || {}).textContent || "",
    disc: (document.getElementById("disclaimer") || {}).textContent || "",
  }));
  ok("2 沖縄ではきび注記に出典が入る", ck2.kibiNote.indexOf("36.56") > -1, ck2.kibiNote.slice(0, 60));
  ok("2 沖縄の免責はNOSAI沖縄のまま", ck2.disc.indexOf("NOSAI沖縄") > -1);

  // ---- 3. 投資・雇用→資金繰りの返済引き継ぎ（資金繰り未保存の端末） ----
  await page.evaluate(() => {
    localStorage.removeItem("myfarm-agri-compass-aic:cashflow");
    localStorage.removeItem("myfarm-agri-compass-aic:plan");
  });
  await page.goto(BASE + "/tools/toushi.html", { waitUntil: "domcontentloaded" });
  await sleep(1200);
  // 借入欄に値を入れて資金繰りへ書き込むボタンを押す
  const wrote = await page.evaluate(() => {
    const btn = document.getElementById("s-to-cashflow");
    if (!btn) return "no-btn";
    btn.click();
    const saved = JSON.parse(localStorage.getItem("myfarm-agri-compass-aic:cashflow") || "null");
    return saved && saved.loans && saved.loans.length ? "saved" : "no-save";
  });
  ok("3 投資・雇用が返済をcashflowに保存", wrote === "saved", wrote);
  await page.goto(BASE + "/tools/shikin.html", { waitUntil: "domcontentloaded" });
  await sleep(1200);
  const sk = await page.evaluate(() => {
    const t = document.body.textContent;
    const loans = JSON.parse(localStorage.getItem("myfarm-agri-compass-aic:cashflow") || "{}").loans || [];
    return { hasLoanRow: t.indexOf("投資・雇用") > -1 || loans.length > 0, loansLen: loans.length };
  });
  ok("3 資金繰りが返済を失わない（loans維持）", sk.loansLen > 0, "loans=" + sk.loansLen);

  // ---- 4. 実績の診断→作付けの決定の再反映（保存済みの下書きがあっても） ----
  // 下書きを直接作り（収録値の単価のまま）、そのあと実績（annual）を置いて再訪問→画面の単価が実績値になるか
  const seeded = await page.evaluate(() => {
    const c = DATA.CROPS.filter(x => !x.custom)[0];
    if (!c || !c.yieldKg10a || !c.priceYenKg) return null;
    const item = { cropId: c.id, area: 10, yieldV: c.yieldKg10a.v, priceV: c.priceYenKg.v,
      costRate: c.costRate ? c.costRate.v : 0.5, typhoonExp: c.typhoonExp || 0.1,
      laborH10a: c.laborH10a ? c.laborH10a.v : 0, jisseki: false };
    const plans = [{ items: [Object.assign({}, item)] }, { items: [Object.assign({}, item)] }, { items: [Object.assign({}, item)] }];
    localStorage.setItem("myfarm-agri-compass-aic:sakutsukeDraft", JSON.stringify({ plans: plans, fam: 2, cap: 160, view: 0, yearMode: "normal" }));
    const annual = { "2025": { items: [{ cropId: c.id, sales: 5000000, area10a: 10, laborH: 500 }] } };
    localStorage.setItem("myfarm-agri-compass-aic:annual", JSON.stringify(annual));
    const expPrice = Math.round(5000000 / 10 / c.yieldKg10a.v);
    return { cropId: c.id, masterPrice: c.priceYenKg.v, expPrice: expPrice };
  });
  ok("4 検証用の下書きと実績を配置", !!seeded, JSON.stringify(seeded));
  if (seeded) {
    await page.goto(BASE + "/tools/sakutsuke.html", { waitUntil: "domcontentloaded" });
    await sleep(1400);
    const shown = await page.evaluate(() => {
      const inp = document.querySelector("input.in-price");
      return inp ? Number(inp.value) : null;
    });
    ok("4 下書きがあっても実績単価が画面に再反映される", shown === seeded.expPrice && shown !== seeded.masterPrice,
      "表示=" + shown + " 期待=" + seeded.expPrice + " 収録値=" + seeded.masterPrice);
  }

  await browser.close();
  const fails = results.filter(r => !r.pass).length;
  console.log("---- " + (results.length - fails) + "/" + results.length + " PASS ----");
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
