/* 6府県データ追加（兵庫・福岡・島根・埼玉・京都・大阪）の検証
   - 地域を選ぶと品目が入れ替わり、件数が正しい
   - 値が無いフィールドで画面がNaN・停止を起こさない
   - 品質ラベル（国統計・県平均／古い調査値／計算値）が表示される
   - 地域品目への利用者上書き（cropCustom）が反映される（data_regions.js の修正の検証）
   - 出典（SRC）が DATA.SOURCES に届き、出典行が表示される */
const puppeteer = require("puppeteer-core");
const BASE = "http://127.0.0.1:8123";
const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const results = [];
let browser, page;
let pageErrors = [];
function ok(name, cond, detail) {
  results.push({ name, pass: !!cond });
  console.log((cond ? "PASS" : "FAIL") + " | " + name + (detail ? " | " + String(detail).slice(0, 180) : ""));
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function setRegion(rid) {
  await page.goto(BASE + "/index.html", { waitUntil: "domcontentloaded" });
  await page.evaluate(r => {
    localStorage.clear();
    localStorage.setItem("myfarm-agri-compass-aic:mfkPersona", JSON.stringify("hatten"));
    localStorage.setItem("myfarm-agri-compass-aic:mfkRegion", JSON.stringify(r));
  }, rid);
}

(async () => {
  browser = await puppeteer.launch({ executablePath: EDGE, headless: "new" });
  page = await browser.newPage();
  page.on("pageerror", e => { pageErrors.push(String(e).slice(0, 150)); console.log("PAGEERR", String(e).slice(0, 150)); });
  page.on("dialog", async d => { await d.accept(); });
  await page.setViewport({ width: 1280, height: 900 });

  const EXPECT = { hyogo: 7, fukuoka: 7, shimane: 9, saitama: 8, kyoto: 8, osaka: 3 };

  for (const rid of Object.keys(EXPECT)) {
    pageErrors = [];
    await setRegion(rid);
    await page.goto(BASE + "/tools/hinmoku.html", { waitUntil: "domcontentloaded" });
    await sleep(900);
    const st = await page.evaluate(() => {
      const rows = document.querySelectorAll("#baseTbl tbody tr").length;
      const crops = (window.DATA && DATA.CROPS || []).filter(c => !c.custom).map(c => c.id);
      const body = document.querySelector("#baseTbl").textContent;
      return { rows, ids: crops.join(","), nan: body.indexOf("NaN") > -1, undef: body.indexOf("undefined") > -1, body: body.slice(0, 4000) };
    });
    ok(rid + " 品目数 " + EXPECT[rid], st.rows === EXPECT[rid], "rows=" + st.rows + " ids=" + st.ids);
    ok(rid + " NaN/undefined なし", !st.nan && !st.undef);
    ok(rid + " ページエラーなし", pageErrors.length === 0, pageErrors.join(";"));
    if (rid === "hyogo") ok("hyogo（古い調査値）表示", st.body.indexOf("古い調査値") > -1);
    if (rid === "fukuoka" || rid === "saitama" || rid === "osaka") ok(rid + "（国統計・県平均）表示", st.body.indexOf("国統計・県平均") > -1);
    if (rid === "saitama") ok("saitama 単価は―（要確認）", st.body.indexOf("―") > -1 && st.body.indexOf("要確認") > -1);
    if (rid === "kyoto") ok("kyoto 単価（計算値）表示", st.body.indexOf("計算値") > -1);
  }

  // 島根: 出典が SOURCES に届く・年またぎ収穫月・複合経営品目に経費率が無い
  pageErrors = [];
  await setRegion("shimane");
  await page.goto(BASE + "/tools/hinmoku.html", { waitUntil: "domcontentloaded" });
  await sleep(900);
  const sm = await page.evaluate(() => {
    const c = DATA.CROPS.find(x => x.id === "sm_strawberry_forcing");
    const rice = DATA.CROPS.find(x => x.id === "sm_rice_tsuyahime");
    return {
      src: DATA.SOURCES.SM015 ? DATA.SOURCES.SM015.url : "",
      harvest: c ? JSON.stringify(c.months.harvest) : "",
      months12: c ? c.months.harvest.every(m => Number.isInteger(m) && m >= 1 && m <= 12) : false,
      riceCostRate: rice ? ("costRate" in rice) : null,
      srcLine: DATA.srcLine(c.yieldKg10a)
    };
  });
  ok("shimane 出典URLがSOURCESに届く", sm.src.indexOf("pref.shimane.lg.jp") > -1, sm.src);
  ok("shimane いちご年またぎ収穫月 [11,12,1,2,3,4,5]", sm.harvest === "[11,12,1,2,3,4,5]" && sm.months12, sm.harvest);
  ok("shimane 複合経営の水稲に品目別経費率なし", sm.riceCostRate === false);
  ok("shimane 出典行に県指標ラベル", sm.srcLine.indexOf("島根県") > -1, sm.srcLine);

  // 上書きの反映（地域品目への cropCustom 適用＝今回の修正）
  await page.evaluate(() => {
    localStorage.setItem("myfarm-agri-compass-aic:cropCustom", JSON.stringify({
      overrides: { sm_white_leek: { priceYenKg: 500, months: { income: [12, 1] } } }, custom: []
    }));
  });
  await page.goto(BASE + "/tools/sakutsuke.html", { waitUntil: "domcontentloaded" });
  await sleep(1200);
  const ov = await page.evaluate(() => {
    const c = DATA.CROPS.find(x => x.id === "sm_white_leek");
    return { price: c && c.priceYenKg.v, jibun: c && !!c.priceYenKg.jibun, income: c ? JSON.stringify(c.months.income) : "" };
  });
  ok("地域品目への上書き反映（単価500・自分の値）", ov.price === 500 && ov.jibun, JSON.stringify(ov));
  ok("地域品目への入金月書き戻し反映 [12,1]", ov.income === "[12,1]", ov.income);

  // 作付けページ: 単価未収録の品目（埼玉）を足しても NaN が出ない
  pageErrors = [];
  await setRegion("saitama");
  await page.goto(BASE + "/tools/sakutsuke.html", { waitUntil: "domcontentloaded" });
  await sleep(1200);
  const sk = await page.evaluate(() => {
    const t = [...document.querySelectorAll("main *")].filter(el => el.offsetParent !== null && !el.children.length).map(el => el.textContent).join(" ");
    return { nan: t.indexOf("NaN") > -1, loaded: !!document.querySelector("main") };
  });
  ok("saitama 作付けページ NaNなし・描画あり", sk.loaded && !sk.nan);
  ok("saitama 作付けページ ページエラーなし", pageErrors.length === 0, pageErrors.join(";"));

  // 資金繰り: 入金月が全品目空でも停止しない
  pageErrors = [];
  await page.goto(BASE + "/tools/shikin.html", { waitUntil: "domcontentloaded" });
  await sleep(1200);
  const shik = await page.evaluate(() => ({
    loaded: !!document.querySelector("main"),
    nan: [...document.querySelectorAll("main *")].filter(el => el.offsetParent !== null && !el.children.length).map(el => el.textContent).join(" ").indexOf("NaN") > -1
  }));
  ok("saitama 資金繰りページ 停止なし・NaNなし", shik.loaded && !shik.nan);
  ok("saitama 資金繰りページ ページエラーなし", pageErrors.length === 0, pageErrors.join(";"));

  // 既存地域が変わらない（沖縄・福島の品目が従来どおり）
  pageErrors = [];
  await setRegion("fukushima");
  await page.goto(BASE + "/tools/hinmoku.html", { waitUntil: "domcontentloaded" });
  await sleep(900);
  const fs = await page.evaluate(() => (window.DATA && DATA.CROPS || []).filter(c => !c.custom).length);
  ok("fukushima 既存6品目のまま", fs === 6, "n=" + fs);
  await setRegion("okinawa");
  await page.goto(BASE + "/tools/hinmoku.html", { waitUntil: "domcontentloaded" });
  await sleep(900);
  const okn = await page.evaluate(() => ({ n: (window.DATA && DATA.CROPS || []).filter(c => !c.custom).length, kibi: !!window.DATA.KIBI }));
  ok("okinawa 既存品目＋さとうきび維持", okn.n >= 5 && okn.kibi, JSON.stringify(okn));

  await browser.close();
  const fails = results.filter(r => !r.pass).length;
  console.log("---- " + (results.length - fails) + "/" + results.length + " PASS ----");
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
