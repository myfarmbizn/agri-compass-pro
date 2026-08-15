/* 3校フィードバック対応（2026-07-31）の実ブラウザ検証:
   guide.html（全体の見取り図）と学校版3入口（sites/aic・nogakko・mirai）、
   例題プリセットの読み込み、kentou順路の並び替えを通しで確かめる */
const puppeteer = require("puppeteer-core");
const BASE = "http://127.0.0.1:8123";
const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const results = [];
let errs = [];
function ok(name, cond, detail) { results.push({ name, pass: !!cond, detail: detail || "" }); console.log((cond ? "PASS" : "FAIL") + " | " + name + (detail ? " | " + detail : "")); }

(async () => {
  const browser = await puppeteer.launch({ executablePath: EDGE, headless: "new", args: ["--no-first-run"] });
  const page = await browser.newPage();
  page.on("pageerror", e => errs.push(String(e).slice(0, 200)));
  page.on("console", m => { if (m.type() === "error") errs.push(m.text().slice(0, 200)); });
  page.on("dialog", d => d.accept());  // 例題上書きの確認は「はい」で進める

  /* ---------- guide.html ---------- */
  await page.goto(BASE + "/guide.html", { waitUntil: "domcontentloaded" });
  await new Promise(r => setTimeout(r, 400));
  const g = await page.evaluate(() => ({
    personaBlocks: document.querySelectorAll("#personaBlocks .p-block").length,
    toolCards: document.querySelectorAll("#toolGrid .t-card").length,
    presets: Array.from(document.querySelectorAll("#presetList .preset-btn")).map(a => a.getAttribute("href")),
    kentouFirst: (document.getElementById("personaBlocks").textContent.indexOf("農業を始めるか考えている人向け") > -1)
  }));
  ok("guide: 立場ブロックが5つ", g.personaBlocks === 5, "count=" + g.personaBlocks);
  ok("guide: ページ一覧が15枚（逆算・くらべる・根拠しらべ追加後）", g.toolCards === 15, "count=" + g.toolCards);
  ok("guide: 例題が8件（engei+A+B+営農モデル5）", g.presets.length === 8, "count=" + g.presets.length);
  ok("guide: kentou立場が載っている", g.kentouFirst);

  // guide内リンクの全数到達確認（href収集→fetchで200確認）
  const hrefs = await page.evaluate(() =>
    Array.from(new Set(Array.from(document.querySelectorAll("a[href]"))
      .map(a => a.getAttribute("href"))
      .filter(h => h && !h.startsWith("http") && !h.startsWith("#"))
      .map(h => h.split("?")[0])))
  );
  let broken = [];
  for (const h of hrefs) {
    const st = await page.evaluate(async (u) => { const r = await fetch(u, { method: "GET" }); return r.status; }, h);
    if (st !== 200) broken.push(h + "=" + st);
  }
  ok("guide: 内部リンク全数が200（" + hrefs.length + "本）", broken.length === 0, broken.join(" / "));

  /* ---------- 学校版3入口 ---------- */
  for (const site of ["aic", "nogakko", "mirai"]) {
    await page.goto(BASE + "/sites/" + site + "/index.html", { waitUntil: "domcontentloaded" });
    await new Promise(r => setTimeout(r, 250));
    const s = await page.evaluate(() => ({
      title: document.title,
      links: Array.from(new Set(Array.from(document.querySelectorAll("a[href]"))
        .map(a => a.getAttribute("href")).filter(h => h && !h.startsWith("http"))
        .map(h => h.split("?")[0])))
    }));
    ok(site + ": ページが開きタイトルにコンパスの名前", s.title.includes("マイファーム農業経営コンパス"), s.title);
    let b2 = [];
    for (const h of s.links) {
      const st = await page.evaluate(async (u) => { const r = await fetch(u, { method: "GET" }); return r.status; }, h);
      if (st !== 200) b2.push(h + "=" + st);
    }
    ok(site + ": 内部リンク全数が200（" + s.links.length + "本）", b2.length === 0, b2.join(" / "));
  }

  /* ---------- 入口からの通し: 農の学校の営農モデル①を読み込む
       （2026-07-31の作り替えで、リンクから「予想→読み込んで確かめる」ボタンに変更） ---------- */
  await page.goto(BASE + "/sites/nogakko/index.html", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "domcontentloaded" });
  await new Promise(r => setTimeout(r, 400));
  await page.click('.yb[data-id="ng_tahinmoku"][data-g="良い"]');
  await page.click('.ng-go[data-go="ng_tahinmoku"]');
  await page.waitForFunction(() => location.pathname.endsWith("simulator.html"), { timeout: 8000 });
  /* 初回描画が遅れることがあるため、固定待ちでなく howToRead の中身が出るまで待つ */
  await page.waitForFunction(() => {
    const e = document.getElementById("howToRead");
    return e && e.textContent.length > 20;
  }, { timeout: 8000 }).catch(() => {});
  const sim = await page.evaluate(() => {
    const plan = JSON.parse(localStorage.getItem("myfarm-agri-compass-aic:simPlan") || "null");
    const persona = JSON.parse(localStorage.getItem("myfarm-agri-compass-aic:mfkPersona") || "null");
    return { crops: plan ? plan.items.map(i => i.cropId).join(",") : "", persona: persona, howto: (document.getElementById("howToRead") || {}).textContent || "" };
  });
  ok("nogakko→simulator: 営農モデル①の3品目が計画に入る", sim.crops === "ex_hamono,ex_konsai,ex_kasai", sim.crops);
  ok("nogakko→simulator: 立場が junbi になる", sim.persona === "junbi", String(sim.persona));
  ok("simulator: 「この数字はこう見る」に判定と最低点が出る", /先に「資金の最低点」/.test(sim.howto) && /(良い|注意|危ない)/.test(sim.howto), sim.howto.slice(0, 60));

  /* ---------- 入口からの通し: AICの例題経営者Aで kentou 立場になる ---------- */
  await page.goto(BASE + "/sites/aic/index.html", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => localStorage.clear());
  await page.click('a[href*="preset=exA"]');
  await page.waitForFunction(() => location.pathname.endsWith("simulator.html"), { timeout: 8000 });
  await new Promise(r => setTimeout(r, 900));
  const aic = await page.evaluate(() => ({
    persona: JSON.parse(localStorage.getItem("myfarm-agri-compass-aic:mfkPersona") || "null"),
    area: (JSON.parse(localStorage.getItem("myfarm-agri-compass-aic:simPlan") || "{}").items || [])[0]
  }));
  ok("aic→simulator: 立場が kentou・例題Aの露地60が入る", aic.persona === "kentou" && aic.area && aic.area.cropId === "ex_yasai_a" && aic.area.area === 60,
    String(aic.persona) + " " + JSON.stringify(aic.area || {}));

  /* ---------- kentou 順路の並び替え（トップの進め方が例題先行になっている） ---------- */
  await page.goto(BASE + "/index.html?p=kentou", { waitUntil: "domcontentloaded" });
  await new Promise(r => setTimeout(r, 400));
  const k = await page.evaluate(() => {
    const steps = Array.from(document.querySelectorAll("#pvPath li")).map(li => li.textContent);
    const presets = Array.from(document.querySelectorAll("#pvPreset a")).map(a => a.textContent);
    return { first: steps[0] || "", last: steps[steps.length - 1] || "", presets: presets.join("|") };
  });
  /* 2026-08-04: 段ごとの説明は段の定義（journey.js の STEPS）から作るようにしたため、
     1段目は「収支と資金繰り」＝経営シミュレーターのページになる。例題A・Bはその上の
     「まず例題を動かしてみる」のボタンで読み込む（下の3つ目の検査で確認）。
     この立場が例題から始まり、経営力チェックが最後に来るという順番は変えていない。 */
  ok("kentou: 進め方の1段目が経営シミュレーター（例題を動かすページ）", k.first.includes("収支と資金繰り"), k.first.slice(0, 40));
  ok("kentou: 進め方の最後が経営力チェック", k.last.includes("経営力チェック"), k.last.slice(0, 40));
  ok("kentou: 例題A・Bのボタンが2つ出る", k.presets.includes("例題経営者A") && k.presets.includes("例題経営者B"), k.presets.slice(0, 80));

  /* ---------- check10 の kentou 向け位置づけ表示 ---------- */
  await page.goto(BASE + "/tools/check10.html", { waitUntil: "domcontentloaded" });
  await new Promise(r => setTimeout(r, 400));
  /* AIC版: kentou の既定は「学びはじめ（12問）」側。位置づけ文は経営力チェック側の説明なので、
     そちらに切り替えたときに出る */
  const kindDefault = await page.evaluate(() => document.getElementById("paneManabi").style.display !== "none");
  ok("check10: kentou の既定は学びはじめ側", kindDefault === true);
  await page.click('#segCheck button[data-v="keiei"]');
  await new Promise(r => setTimeout(r, 300));
  const c10 = await page.evaluate(() => {
    const n = document.getElementById("kentouNote");
    return n && n.style.display !== "none" && n.offsetParent !== null;
  });
  ok("check10: 経営力チェックに切り替えると kentou 向けの位置づけ文が出る", c10 === true);

  ok("JSエラー0", errs.length === 0, errs.join(" / "));

  await browser.close();
  const failed = results.filter(r => !r.pass);
  console.log("\n--- " + (results.length - failed.length) + "/" + results.length + " PASS ---");
  process.exit(failed.length ? 1 : 0);
})();
