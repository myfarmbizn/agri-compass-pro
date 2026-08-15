/* UI改善v2の検証（Edge実ブラウザ・ローカルhttp 8123） */
const puppeteer = require("puppeteer-core");
const BASE = "http://127.0.0.1:8123";
const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const results = [];
let browser, page;
const errs = [];
function ok(name, cond, detail) {
  results.push({ name, pass: !!cond });
  console.log((cond ? "PASS" : "FAIL") + " | " + name + (detail ? " | " + String(detail).slice(0, 200) : ""));
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  browser = await puppeteer.launch({ executablePath: EDGE, headless: "new" });
  page = await browser.newPage();
  page.on("pageerror", e => errs.push(String(e).slice(0, 150)));
  page.on("console", m => { if (m.type() === "error" && m.text().indexOf("favicon") === -1 && m.text().indexOf("Failed to load") === -1) errs.push(m.text().slice(0, 150)); });
  page.on("dialog", async d => { await d.accept(); });
  await page.setViewport({ width: 1280, height: 900 });

  // 立場=経営発展・地域=千葉 で新規利用者を再現
  await page.goto(BASE + "/index.html", { waitUntil: "networkidle2" });
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem("myfarm-agri-compass-aic:mfkPersona", JSON.stringify("hatten"));
    localStorage.setItem("myfarm-agri-compass-aic:mfkRegion", JSON.stringify("chiba"));
  });

  // ---- 1. 指摘24: 開いただけでは保存されない（5ページ） ----
  for (const [url, key] of [["/tools/shikin.html", "cashflow"], ["/tools/simulator.html", "simPlan"], ["/tools/checkup.html", "annual"], ["/tools/taifu.html", "taifuLocal"], ["/tools/keikaku.html", "keikakuDraft"]]) {
    await page.goto(BASE + url, { waitUntil: "domcontentloaded", timeout: 60000 });
    await sleep(1600);
    const v = await page.evaluate(k => localStorage.getItem("myfarm-agri-compass-aic:" + k), key);
    ok("1 開いただけで保存されない " + url, v === null, v ? "saved!" : "");
  }

  // ---- 2. 触ると保存される（shikinで代表確認） ----
  await page.goto(BASE + "/tools/shikin.html", { waitUntil: "networkidle2" });
  await sleep(900);
  await page.click("#inCash", { clickCount: 3 });
  await page.type("#inCash", "150");
  await page.keyboard.press("Tab");
  await sleep(800);
  const savedAfter = await page.evaluate(() => localStorage.getItem("myfarm-agri-compass-aic:cashflow") !== null);
  ok("2 触ったら保存される（資金繰り）", savedAfter);
  const stamp = await page.evaluate(() => (document.getElementById("saveStamp") || {}).textContent || "");
  ok("2 ヘッダーに保存済み表示", stamp.indexOf("保存済み") > -1, stamp);

  // ---- 3. ナビと進め方の一覧の一本化（2026-07-31改修: 順路は帯だけ・ナビは「その他のページ」開閉メニュー） ----
  const nav = await page.evaluate(() => (document.querySelector(".topbar-nav") || {}).textContent || "");
  const band3 = await page.evaluate(() => (document.querySelector(".jny-side") || {}).textContent || "");
  ok("3 ナビに番号バッジの二重表示なし", nav.indexOf("①") === -1, nav.slice(0, 160));
  /* AIC版（2026-08-04）: ナビは「トップ」と「ページ一覧」の2つだけ。一覧の中に全ページを
     「進め方の順路」「必要なときに使うページ」に分けて入れる（上から全ページへ行けるように） */
  ok("3 ナビにトップへの道がある", nav.indexOf("トップ") > -1, nav.slice(0, 160));
  ok("3 ナビにページ一覧メニュー", nav.indexOf("ページ一覧") > -1, nav.slice(0, 160));
  ok("3 一覧が順路とそのほかに分かれている", nav.indexOf("進め方の順路") > -1 && nav.indexOf("必要なときに使うページ") > -1, nav.slice(0, 200));
  ok("3 名称統一（旧名なし）", (nav + band3).indexOf("融資用計画書") === -1 && (nav + band3).indexOf("経営診断") === -1 && (nav + band3).indexOf("作付け比較") === -1, nav);
  ok("3 帯に新名称あり", band3.indexOf("実績の診断") > -1 && band3.indexOf("作付けの決定") > -1 && band3.indexOf("計画書にまとめる") > -1, band3.slice(0, 160));

  // ---- 4. 消える通知の廃止（トーストが存在しない） ----
  const toast = await page.evaluate(() => !!document.querySelector(".jny-toast"));
  ok("4 消える通知なし", !toast);

  // ---- 5. 品目追加の誘導と往復（shikin→hinmoku→戻る） ----
  const addLink = await page.evaluate(() => {
    const a = [...document.querySelectorAll("a")].find(x => (x.getAttribute("href") || "").indexOf("hinmoku.html?back=shikin") > -1);
    return a ? a.getAttribute("href") : null;
  });
  ok("5 資金繰りに品目追加の誘導", !!addLink, addLink);
  await page.goto(BASE + "/tools/hinmoku.html?back=shikin", { waitUntil: "networkidle2" });
  await sleep(900);
  const backBand = await page.evaluate(() => document.body.textContent.indexOf("から品目の追加に来ています") > -1);
  ok("5 品目と単価に戻り案内の帯", backBand);

  // ---- 6. 経営力チェック: 行動証拠形＋「できる」確認欄 ----
  await page.goto(BASE + "/tools/check10.html", { waitUntil: "networkidle2" });
  await sleep(700);
  /* 2026-07-31: 学びはじめチェック追加後は従来10問の枠 #qs に絞る */
  const q1 = await page.evaluate(() => (document.querySelector("#qs .q-item .q-text") || {}).textContent || "");
  ok("6 設問が行動証拠形", q1.indexOf("いまこの場で") > -1, q1.slice(0, 80));
  await page.evaluate(() => { document.querySelector('.q-btn[data-i="0"][data-v="2"]').click(); });
  await sleep(400);
  const confirmBox = await page.evaluate(() => document.body.textContent.indexOf("その数字をひとつ書いてみてください") > -1);
  ok("6 できる選択で確認欄", confirmBox);

  // ---- 7. 実績の診断: 年の文言 ----
  await page.goto(BASE + "/tools/checkup.html", { waitUntil: "networkidle2" });
  await sleep(700);
  const yearLbl = await page.evaluate(() => {
    const vis = [...document.querySelectorAll("label, option, h1, h2, h3, p, .src, .sub, .hint, button")]
      .filter(el => el.closest("script") === null).map(el => el.textContent).join(" ");
    return vis;
  });
  ok("7 年選択の新文言", yearLbl.indexOf("どの年の数字を入れますか") > -1 && yearLbl.indexOf("ふつうは去年") > -1);
  ok("7 「年分」が画面文言に出ない", yearLbl.indexOf("年分") === -1);

  // ---- 8. 計画書: 位置づけ文言 ----
  await page.goto(BASE + "/tools/keikaku.html", { waitUntil: "networkidle2" });
  await sleep(900);
  const kk = await page.evaluate(() => ({
    h1: (document.querySelector("h1") || {}).textContent || "",
    lede: (document.querySelector(".lede") || {}).textContent || "",
    hasNote: document.body.textContent.indexOf("ここから下が、そのまま印刷されます") > -1,
    kingu: document.body.textContent.indexOf("使うお金と、その用意のしかた") > -1,
  }));
  ok("8 計画書h1が営農計画の位置づけ", kk.h1.indexOf("融資") === -1, kk.h1);
  ok("8 印刷範囲の案内が移設", kk.hasNote);
  ok("8 資金計画の新見出し", kk.kingu);

  // ---- 9. 作付けの決定（千葉）: 沖縄の残り香なし・仮決め文言 ----
  await page.goto(BASE + "/tools/sakutsuke.html", { waitUntil: "networkidle2" });
  await sleep(1100);
  const sk = await page.evaluate(() => {
    const vis = [...document.querySelectorAll("main *")].filter(el => el.offsetParent !== null).map(el => el.childNodes.length && el.textContent).join(" ");
    return {
      mango: vis.indexOf("マンゴー") > -1,
      taifuCard: vis.indexOf("台風時期") > -1,
      kari: vis.indexOf("今日の仮決め") > -1,
    };
  });
  ok("9 千葉でマンゴー例示なし", !sk.mango);
  ok("9 千葉で台風時期カードなし", !sk.taifuCard);
  ok("9 仮決めの明示", sk.kari);

  // ---- 10. 資金繰り: 生活費の説明・その他の支出行 ----
  await page.goto(BASE + "/tools/shikin.html", { waitUntil: "networkidle2" });
  await sleep(900);
  const sh = await page.evaluate(() => ({
    living: document.body.textContent.indexOf("自分・家族への給与") > -1 && document.body.textContent.indexOf("事業主貸") > -1,
    extra: !!document.getElementById("addExtraBtn"),
  }));
  ok("10 給与（家計へ渡すお金）の説明", sh.living);
  ok("10 その他の支出行", sh.extra);

  // ---- 11. 全ページJSエラーなし ----
  errs.length = 0;
  for (const p2 of ["index.html", "tools/check10.html", "tools/checkup.html", "tools/hinmoku.html", "tools/sakutsuke.html", "tools/simulator.html", "tools/shikin.html", "tools/keikaku.html", "tools/toushi.html", "tools/taifu.html", "tools/smart.html", "tools/kyuyo.html"]) {
    await page.goto(BASE + "/" + p2, { waitUntil: "networkidle2" });
    await sleep(400);
  }
  ok("11 全12ページJSエラーなし", errs.length === 0, errs.join(" / "));

  await browser.close();
  const fails = results.filter(r => !r.pass);
  console.log("\n==== 合計 " + results.length + " / 不合格 " + fails.length + " ====");
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error("HARNESS ERROR", e); process.exit(2); });
