/* 実画面の見た目を撮る（目視確認用）。node tests/_tmp/shot.js */
const puppeteer = require("puppeteer-core");
const path = require("path");
const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const OUT = process.argv[2] || ".";
/* 既定はローカル配信。公開後の実物を撮るときは
   BASE=https://myfarmbizn.github.io/agri-compass-aic node tests/screenshots.js <出力先> */
const BASE = process.env.BASE || "http://127.0.0.1:8123";

(async () => {
  const b = await puppeteer.launch({ executablePath: EDGE, headless: "new", args: ["--no-sandbox"] });

  async function shot(name, url, w, h, before) {
    const p = await b.newPage();
    await p.setViewport({ width: w, height: h, deviceScaleFactor: 1 });
    await p.goto(BASE + url, { waitUntil: "networkidle2" });
    await new Promise(r => setTimeout(r, 1000));
    if (before) { await before(p); await new Promise(r => setTimeout(r, 900)); }
    await p.screenshot({ path: path.join(OUT, name + ".png") });
    console.log("撮影:", name, w + "x" + h, url);
    await p.close();
  }

  if (process.env.SIDEONLY) {
    await shot("side_wide", "/tools/simulator.html?p=junbi", 1600, 1000);
    await shot("side_mid", "/tools/simulator.html?p=junbi", 1280, 900);
    await shot("side_mid_open", "/tools/simulator.html?p=junbi", 1280, 900, async p => {
      const t = await p.$("#jnySideToggle"); if (t) await t.click();
    });
    await shot("side_mobile_open", "/tools/simulator.html?p=junbi", 390, 800, async p => {
      const t = await p.$("#jnySideToggle"); if (t) await t.click();
    });
    await b.close();
    return;
  }
  /* 学校の入口3ページ（農の学校・みらい農業学校・AIC）の見た目。左の段一覧つき */
  if (process.env.IRIGUCHI) {
    for (const s of [["nogakko", "農の学校"], ["mirai", "みらい農業学校"], ["aic", "AIC"]]) {
      await shot("iri_" + s[0] + "_wide", "/sites/" + s[0] + "/index.html", 1500, 1050);
      await shot("iri_" + s[0] + "_mobile", "/sites/" + s[0] + "/index.html", 375, 800);
    }
    await b.close();
    return;
  }
  if (process.env.CHECKONLY) {
    await shot("check_kentou", "/tools/check10.html?p=kentou", 1440, 1050);
    await shot("check_keiei", "/tools/check10.html?p=junbi", 1440, 1050);
    await shot("nav_open", "/tools/check10.html?p=kentou", 1440, 700, async p => {
      const sum = await p.$(".nav-more summary"); if (sum) await sum.click();
    });
    await b.close();
    return;
  }
  if (process.env.SIMONLY) {
    await shot("sim_desktop", "/tools/simulator.html?p=junbi&preset=engei", 1440, 1200);
    await shot("sim_scrolled", "/tools/simulator.html", 1440, 1200, async p => { await p.evaluate(() => window.scrollTo(0, 620)); });
    await shot("sim_mobile", "/tools/simulator.html", 390, 860);
    /* ページの末尾（進む道が1本になっているか） */
    await shot("sim_bottom", "/tools/simulator.html?p=junbi", 1440, 900, async p => {
      await p.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    });
    await b.close();
    return;
  }
  await shot("01_top_desktop", "/index.html", 1440, 1000, async p => {
    await p.evaluate(() => localStorage.clear());
    await p.reload({ waitUntil: "networkidle2" });
  });
  await shot("02_top_selected", "/index.html", 1440, 1400, async p => {
    await p.click('.p-card[data-pid="junbi"]');
    await p.evaluate(() => window.scrollTo(0, 900));
  });
  await shot("03_top_mobile", "/index.html", 375, 780, async p => {
    await p.evaluate(() => localStorage.clear());
    await p.reload({ waitUntil: "networkidle2" });
  });
  await shot("04_simulator", "/tools/simulator.html?p=junbi&preset=engei", 1440, 1100);
  await shot("05_aic_stages", "/sites/aic/index.html", 1440, 1100);
  await shot("06_gyakusan", "/tools/gyakusan.html?p=kentou", 1440, 1000);

  await b.close();
})();
