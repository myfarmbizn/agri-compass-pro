/* 農業経営コンパス（教育版）v1 E2E検証（Edge実ブラウザ・ローカルhttp） */
const puppeteer = require("puppeteer-core");

const BASE = "http://127.0.0.1:8123";
const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const results = [];
let page, browser;
const consoleErrors = [];

function ok(name, cond, detail) {
  results.push({ name, pass: !!cond, detail: detail || "" });
  console.log((cond ? "PASS" : "FAIL") + " | " + name + (detail ? " | " + detail : ""));
}

async function newPage() {
  const p = await browser.newPage();
  p.on("pageerror", e => consoleErrors.push({ url: p.url(), msg: String(e).slice(0, 200) }));
  p.on("console", m => { if (m.type() === "error") consoleErrors.push({ url: p.url(), msg: m.text().slice(0, 200) }); });
  p.on("dialog", async d => { await d.accept(); });
  return p;
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  browser = await puppeteer.launch({ executablePath: EDGE, headless: "new", args: ["--no-first-run"] });
  page = await newPage();

  // ---- 1. ライト固定（旧 theme=dark 保存 + ?theme=dark 指定でも白背景） ----
  await page.goto(BASE + "/index.html", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => localStorage.setItem("myfarm-agri-compass-aic:theme", JSON.stringify("dark")));
  await page.goto(BASE + "/index.html?theme=dark", { waitUntil: "domcontentloaded" });
  const lightInfo = await page.evaluate(() => ({
    hasLight: document.documentElement.classList.contains("light"),
    toggle: !!document.getElementById("theme-toggle"),
    bg: getComputedStyle(document.body).backgroundColor,
  }));
  ok("1 ライト固定（class=light）", lightInfo.hasLight, JSON.stringify(lightInfo));
  ok("1 切替ボタン無し", !lightInfo.toggle);

  // ---- 2. 立場=経営発展 + 地域=沖縄（UI操作） ----
  await page.click('.p-card[data-pid="hatten"]');
  await sleep(600);
  await Promise.all([
    page.waitForNavigation({ waitUntil: "domcontentloaded" }),
    page.select("#rSel", "okinawa"),
  ]);
  const sel = await page.evaluate(() => ({
    p: JSON.parse(localStorage.getItem("myfarm-agri-compass-aic:mfkPersona")),
    r: JSON.parse(localStorage.getItem("myfarm-agri-compass-aic:mfkRegion")),
  }));
  ok("2 立場・地域が保存される", sel.p === "hatten" && sel.r === "okinawa", JSON.stringify(sel));

  // ---- 3. はじめの3問 → profile 旧キーで保存 ----
  /* AIC版: 畑の3問は折りたたみの中にある（段階的に開く設計）ので先に開く */
  await page.evaluate(() => { const d = document.getElementById("foldFarm"); if (d) d.open = true; });
  await page.waitForSelector("#obPlace");
  await page.type("#obPlace", "沖縄県南城市");
  await page.click("#obAddCrop");
  await sleep(200);
  await page.click("#obSave");
  await sleep(300);
  const prof = await page.evaluate(() => JSON.parse(localStorage.getItem("myfarm-agri-compass-aic:profile")));
  ok("3 3問保存（place/crops/laborFamily）", prof && prof.place === "沖縄県南城市" && prof.crops.length >= 1 && prof.laborFamily >= 1, JSON.stringify(prof).slice(0, 120));

  // ---- 進め方の一覧がトップにも出る（経営発展のルート・作付けの決定を含む） ----
  /* 2026-08-04: トップだけ横並びのナビ、次のページから左の一覧という二本立てをやめ、
     トップにも同じ左の一覧を出すようにした（NM指摘）。一覧の先頭はトップページ自身。 */
  const bandTop = await page.evaluate(() => {
    const b = document.querySelector(".jny-side");
    return {
      txt: b ? b.textContent : "",
      first: b ? (b.querySelector(".js-step .js-name") || {}).textContent || "" : "",
      hereOnHome: b ? !!b.querySelector(".js-step.here .js-name") : false,
    };
  });
  ok("2b トップの左の一覧に作付けの決定がある", bandTop.txt.indexOf("作付けの決定") > -1, bandTop.txt.slice(0, 120));
  ok("2c トップの一覧の1行目がトップページで「いまここ」", bandTop.first.indexOf("はじめに（トップ）") === 0 && bandTop.hereOnHome, bandTop.first);

  // ---- 4. 経営力チェック: 質問3を「まだ」で回答 → 弱点リンクが出る ----
  await page.goto(BASE + "/tools/check10.html", { waitUntil: "domcontentloaded" });
  /* 2026-07-31: 学びはじめチェック（12問・#mQs）追加後は、従来10問の枠 #qs に絞って数える */
  const qcount = await page.evaluate(() => document.querySelectorAll("#qs .q-item").length);
  ok("4 設問10問", qcount === 10, "n=" + qcount);
  await page.evaluate(() => {
    document.querySelectorAll("#qs .q-item").forEach((item, i) => {
      const btns = item.querySelectorAll(".q-btn");
      (i === 2 ? btns[2] : btns[0]).click(); // 質問3だけ「まだ」
    });
  });
  await page.click("#btnDone");
  await sleep(500);
  const weak = await page.evaluate(() => {
    const a = document.querySelector('#resWeak a[href*="sakutsuke.html?from=check10&q=3"]');
    return { link: !!a, txt: (document.getElementById("resWeak") || {}).textContent || "" };
  });
  ok("4 弱点リンク（作付け比較・from付き）", weak.link, weak.txt.slice(0, 100));

  // ---- 5. 弱点リンクで作付け比較へ → 帯・由来の帯・積み上げ棒・タブ ----
  await page.goto(BASE + "/tools/sakutsuke.html?from=check10&q=3", { waitUntil: "domcontentloaded" });
  await sleep(800);
  const sak = await page.evaluate(() => ({
    fromband: !!document.querySelector(".fromq-band"),
    band: (document.querySelector(".jny-side") || {}).textContent || "",
    chartDsvg: !!document.querySelector("#chartD svg"),
    tabs: (document.getElementById("segIncome") || document.querySelector("#chartD-tabs") || {}).textContent || document.body.innerHTML.indexOf("3案を並べる") > -1,
    heatDetails: !!document.querySelector("details"),
  }));
  ok("5 チェック由来の帯が出る", sak.fromband);
  ok("5 進め方の一覧あり・作付けの決定にいまここ", sak.band.indexOf("作付けの決定") > -1 && sak.band.indexOf("いまここ") > -1, sak.band.slice(0, 140));
  ok("5 入金がある月にSVG（積み上げ棒）", sak.chartDsvg);
  ok("5 3案を並べるタブがある", !!sak.tabs);

  // ---- 5b. この計画で決める → 次の一歩が常設される ----
  await page.click("#btnSave");
  await sleep(600);
  const hint = await page.evaluate(() => {
    const h = document.querySelector(".next-hint");
    return h ? h.textContent : "";
  });
  ok("5b 決定後に次の一歩（資金繰り・シミュレーター・印刷）", hint.indexOf("資金繰り") > -1 && hint.indexOf("シミュレーター") > -1, hint.slice(0, 160));

  // ---- 6. 橋: この案をシミュレーターに読み込む ----
  const bridgeBtn = await page.evaluateHandle(() => {
    return [...document.querySelectorAll(".next-hint .nh-btn")].find(b => b.textContent.indexOf("シミュレーター") > -1);
  });
  if (bridgeBtn) {
    await Promise.all([
      page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 15000 }).catch(() => {}),
      bridgeBtn.asElement().click(),
    ]);
    await sleep(800);
    const sim = await page.evaluate(() => ({
      url: location.pathname,
      simPlan: JSON.parse(localStorage.getItem("myfarm-agri-compass-aic:simPlan") || "null"),
    }));
    ok("6 橋→シミュレーターへ移動＋simPlan保存", sim.url.indexOf("simulator") > -1 && sim.simPlan && sim.simPlan.items && sim.simPlan.items.length > 0,
      sim.url + " items=" + (sim.simPlan && sim.simPlan.items ? sim.simPlan.items.length : 0));
  } else {
    ok("6 橋ボタン", false, "見つからない");
  }

  // ---- 7. 資金繰り: 決めた計画を読む ----
  await page.goto(BASE + "/tools/shikin.html", { waitUntil: "domcontentloaded" });
  await sleep(800);
  const shikinSrc = await page.evaluate(() => document.body.textContent.indexOf("作付け比較") > -1 || document.body.textContent.indexOf("確定案") > -1);
  ok("7 資金繰りが計画を読み込む", shikinSrc);

  // ---- 8. 印刷: 進め方の一覧・カード・操作が消え、印刷ヘッダーが出る ----
  await page.goto(BASE + "/tools/sakutsuke.html", { waitUntil: "domcontentloaded" });
  await sleep(600);
  await page.emulateMediaType("print");
  const pr = await page.evaluate(() => {
    const gc = el => el ? getComputedStyle(el).display : "(none)";
    return {
      band: gc(document.querySelector(".jny-side")),
      topbar: gc(document.querySelector(".topbar")),
      head: gc(document.querySelector(".print-head")),
      card: gc(document.getElementById("jnyCard")),
      bottom: gc(document.getElementById("jnyBottom")),
    };
  });
  await page.emulateMediaType("screen");
  ok("8 印刷で進め方の一覧・ナビ・カードが消える", pr.band === "none" && pr.topbar === "none" && (pr.card === "none" || pr.card === "(none)") && (pr.bottom === "none" || pr.bottom === "(none)"), JSON.stringify(pr));
  ok("8 印刷ヘッダー（手書き欄）が出る", pr.head === "block", pr.head);

  // ---- 9. 災害への備え（沖縄・台風初期選択・接近数グラフあり） ----
  await page.goto(BASE + "/tools/taifu.html", { waitUntil: "domcontentloaded" });
  await sleep(900);
  /* 固定待ちだけだと初期選択の描画前に読んでしまうことがある（2026-07-31に3件の空振りFAILを確認）。
     災害名の表示が出るまで待ってから読み取る */
  await page.waitForFunction(() => {
    const el = document.getElementById("hzState");
    return el && el.textContent.trim().length > 0;
  }, { timeout: 8000 }).catch(() => {});
  const bcpOki = await page.evaluate(() => {
    const vis = el => !!(el && el.offsetParent !== null);
    const okiCard = document.getElementById("okiCard");
    return {
      title: document.title,
      hazardUI: !!document.getElementById("hzBtns"),
      monthsUI: !!document.getElementById("monBtns"),
      hzState: (document.getElementById("hzState") || {}).textContent || "",
      okiVisible: vis(okiCard),
      contact: (document.getElementById("contactBody") || {}).textContent || "",
    };
  });
  ok("9 災害への備え（タイトル一般化）", bcpOki.title.indexOf("災害") > -1, bcpOki.title);
  ok("9 災害の種類の選択UIがある", bcpOki.hazardUI);
  ok("9 月の選択UIがある", bcpOki.monthsUI);
  ok("9 沖縄は台風が初期選択", bcpOki.hzState.indexOf("台風") > -1, bcpOki.hzState);
  ok("9 沖縄では台風統計カードが見える", bcpOki.okiVisible);
  ok("9 沖縄の最終確認先はNOSAI沖縄", bcpOki.contact.indexOf("NOSAI沖縄") > -1, bcpOki.contact.slice(0, 80));

  // ---- 10. 地域=福島に切替 → 沖縄カード非表示・災害未選択で試算保留・大雪選択で月空 ----
  await page.evaluate(() => {
    localStorage.setItem("myfarm-agri-compass-aic:mfkRegion", JSON.stringify("fukushima"));
    localStorage.removeItem("myfarm-agri-compass-aic:taifuLocal");  // 新規利用者を再現
  });
  await page.goto(BASE + "/tools/taifu.html", { waitUntil: "domcontentloaded" });
  await sleep(900);
  const bcpFuk = await page.evaluate(() => {
    const vis = el => !!(el && el.offsetParent !== null);
    return {
      okiVisible: vis(document.getElementById("okiCard")),
      hzState: (document.getElementById("hzState") || {}).textContent || "",
      contact: (document.getElementById("contactBody") || {}).textContent || "",
    };
  });
  ok("10 福島では沖縄カードが見えない", !bcpFuk.okiVisible);
  ok("10 福島は災害が未選択で始まる", bcpFuk.hzState.indexOf("まだ選んでいません") > -1, bcpFuk.hzState);
  ok("10 福島の最終確認先は一般文", bcpFuk.contact.indexOf("お住まいの県のNOSAI") > -1, bcpFuk.contact.slice(0, 80));
  // 大雪を選ぶ → 月は空・試算は案内表示
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("#hzBtns button, #hzBtns .hz-btn")].find(x => x.textContent.indexOf("大雪") > -1);
    if (b) b.click();
  });
  await sleep(500);
  const fukYuki = await page.evaluate(() => ({
    monState: (document.getElementById("monState") || {}).textContent || "",
    coreSvg: !!document.querySelector("#vizCore svg"),
  }));
  ok("10 大雪は月空欄＋在圃グラフは常時表示", fukYuki.monState.indexOf("まだ月を選んでいません") > -1 && fukYuki.coreSvg, fukYuki.monState.slice(0, 60));
  await page.evaluate(() => localStorage.setItem("myfarm-agri-compass-aic:mfkRegion", JSON.stringify("okinawa")));

  // ---- 11. 旧URL互換: 沖縄ホーム → index?r=okinawa へ転送 ----
  await page.goto(BASE + "/sites/okinawa/home.html?p=junbi", { waitUntil: "domcontentloaded" });
  await sleep(700);
  const redir = await page.evaluate(() => location.pathname + location.search);
  ok("11 沖縄ホームが転送される", redir.indexOf("index.html") > -1 && redir.indexOf("r=okinawa") > -1, redir);

  // ---- 12. 授業モード: 進め方の一覧なし ----
  await page.goto(BASE + "/tools/sakutsuke.html?koma=sakutsuke,shikin", { waitUntil: "domcontentloaded" });
  await sleep(700);
  const komaBand = await page.evaluate(() => !!document.querySelector(".jny-side"));
  ok("12 授業モードで進め方の一覧が出ない", !komaBand);

  // ---- 13. スマホ幅: 帯が横スクロールし本文がはみ出さない ----
  await page.setViewport({ width: 375, height: 700 });
  await page.goto(BASE + "/tools/sakutsuke.html", { waitUntil: "domcontentloaded" });
  await sleep(700);
  const mob = await page.evaluate(() => ({
    bodyScrollX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    bandScroll: (() => { const s = document.querySelector(".jb-steps"); return s ? s.scrollWidth > s.clientWidth : null; })(),
  }));
  ok("13 スマホ幅で横はみ出しなし（許容5px）", mob.bodyScrollX <= 5, JSON.stringify(mob));
  await page.setViewport({ width: 1280, height: 900 });

  // ---- 14. 主要ページ一巡でJSエラーゼロ ----
  const pages = ["index.html", "tools/check10.html", "tools/checkup.html", "tools/hinmoku.html", "tools/sakutsuke.html",
    "tools/simulator.html", "tools/shikin.html", "tools/keikaku.html", "tools/toushi.html", "tools/taifu.html",
    "tools/smart.html", "tools/kyuyo.html", "tools/kibi.html", "tools/hanro.html", "jimukyoku/index.html"];
  consoleErrors.length = 0;
  for (const p of pages) {
    await page.goto(BASE + "/" + p, { waitUntil: "domcontentloaded" });
    await sleep(500);
  }
  const errs = consoleErrors.filter(e => e.msg.indexOf("favicon") === -1 && e.msg.indexOf("net::ERR") === -1 && e.msg.indexOf("Failed to load resource") === -1);
  ok("14 全ページJSエラーなし", errs.length === 0, errs.map(e => e.url.split("/").pop() + ":" + e.msg).join(" | ").slice(0, 400));

  // 資源404の検出（journey.js等の読み込み失敗）
  const res404 = consoleErrors.filter(e => e.msg.indexOf("404") > -1);
  ok("14b 資源404なし", res404.length === 0, res404.map(e => e.msg).join("|").slice(0, 200));

  await browser.close();
  const fails = results.filter(r => !r.pass);
  console.log("\n==== 合計 " + results.length + " 件 / 不合格 " + fails.length + " 件 ====");
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error("HARNESS ERROR", e); process.exit(2); });
