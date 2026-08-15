/* 画面に実際に出る文言を、表示順にすべて書き出す（人の目で読み直すため）。
   HTMLの直読みではJSが作る文言が落ちるので、実ブラウザで描画してから取る。
   使い方: node tests/serve.js を起動しておいて node tests/dump_kotoba.js [パス] */
const puppeteer = require("puppeteer-core");
const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const BASE = process.env.BASE || "http://127.0.0.1:8123";
const PAGES = process.argv.slice(2);
const TARGETS = PAGES.length ? PAGES : ["/index.html", "/sites/aic/index.html"];

(async () => {
  const b = await puppeteer.launch({ executablePath: EDGE, headless: "new", args: ["--no-sandbox"] });
  for (const t of TARGETS) {
    const p = await b.newPage();
    await p.setViewport({ width: 1280, height: 900 });
    await p.goto(BASE + t, { waitUntil: "networkidle2" });
    await p.evaluate(() => localStorage.clear());
    await p.reload({ waitUntil: "networkidle2" });
    await new Promise(r => setTimeout(r, 800));
    /* 立場を選んだ後の画面も見たいので、junbi を選んだ状態も出す */
    const dump = async label => {
      const lines = await p.evaluate(() => {
        const out = [];
        const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        let n;
        while ((n = walk.nextNode())) {
          const s = (n.textContent || "").replace(/\s+/g, " ").trim();
          if (!s) continue;
          const el = n.parentElement;
          if (!el || el.offsetParent === null) continue;
          if (["SCRIPT", "STYLE"].indexOf(el.tagName) > -1) continue;
          out.push(el.tagName.toLowerCase() + " | " + s);
        }
        return out;
      });
      console.log("\n==== " + t + " " + label + " ====");
      lines.forEach(l => console.log(l));
    };
    await dump("（立場未選択）");
    const has = await p.$('.p-card[data-pid="junbi"]');
    if (has) {
      await p.click('.p-card[data-pid="junbi"]');
      await new Promise(r => setTimeout(r, 900));
      await dump("（就農準備を選んだあと）");
    }
    await p.close();
  }
  await b.close();
})();
