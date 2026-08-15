/* 学校の入口3ページ（農の学校・みらい農業学校・AIC）が、道具ページと同じ形になっているかを確かめる。
   ・左に段の一覧が出る（広い画面）／狭い画面では1行に畳む
   ・一覧の名前と順番が、本文の段の見出しと一致する
   ・スクロールすると「いまここ」の印が動く
   ・上のナビ（トップ・全体の見取り図・この入口）が3ページで同じ形
   2026-08-04 新設（NM指摘「並び順など違うのは気持ち悪い」への対応の一部） */
const puppeteer = require("puppeteer-core");
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const BASE = process.env.BASE || "http://127.0.0.1:8123";
const PAGES = [
  { url: "/sites/nogakko/index.html", name: "農の学校" },
  { url: "/sites/mirai/index.html", name: "みらい農業学校（南相馬）" },
  { url: "/sites/aic/index.html", name: "AIC" },
];
let fail = 0;
function ok(c, m, extra) { console.log((c ? "PASS " : "FAIL ") + m + (extra ? " | " + extra : "")); if (!c) fail++; }

(async () => {
  const b = await puppeteer.launch({ executablePath: EDGE, headless: "new" });
  for (const pg of PAGES) {
    const p = await b.newPage();
    const errs = [];
    p.on("pageerror", e => errs.push(String(e)));
    await p.setViewport({ width: 1500, height: 950 });
    await p.goto(BASE + pg.url, { waitUntil: "networkidle2" });
    await new Promise(r => setTimeout(r, 500));

    const r = await p.evaluate(() => {
      const side = document.getElementById("jnySide");
      const list = side ? [...side.querySelectorAll(".js-step")].map(li => ({
        n: li.querySelector(".js-dot").textContent.trim(),
        name: li.querySelector(".js-name").childNodes[0].textContent.trim(),
        to: li.getAttribute("data-to"),
      })) : [];
      const secs = [...document.querySelectorAll("[data-dankai]")].map(s => ({
        id: s.id, label: s.getAttribute("data-dankai"),
      }));
      const nav = [...document.querySelectorAll(".topbar-nav a")].map(a => a.textContent.trim());
      const fixed = side ? getComputedStyle(side).position : "";
      const shifted = document.body.classList.contains("has-side") &&
        parseInt(getComputedStyle(document.querySelector(".shell")).marginLeft, 10) > 200;
      return { list, secs, nav, fixed, shifted, here: side ? side.querySelectorAll(".js-here").length : 0 };
    });

    ok(r.list.length > 0 && r.list.length === r.secs.length,
      `${pg.name}: 左の一覧の数と段の数が一致`, `一覧${r.list.length} / 段${r.secs.length}`);
    ok(r.list.map(x => x.name).join(" > ") === r.secs.map(x => x.label).join(" > "),
      `${pg.name}: 一覧の名前と順番が本文の段と一致`, r.list.map(x => x.name).join(" > "));
    ok(r.list.map(x => x.to).join(",") === r.secs.map(x => x.id).join(","),
      `${pg.name}: 一覧の行き先が段のidと一致`);
    ok(r.fixed === "fixed" && r.shifted, `${pg.name}: 広い画面で左に貼り付き、本文が右に寄る`, r.fixed);
    ok(r.here === 1, `${pg.name}: 「いまここ」が1つだけ出ている`, "個数=" + r.here);
    ok(r.nav[0] === "トップ" && r.nav[1] === "全体の見取り図" && r.nav.length === 3,
      `${pg.name}: 上のナビが3ページで同じ形`, r.nav.join(" / "));

    /* スクロールすると、いま見ている段に印が移るか */
    await p.evaluate(() => {
      const secs = document.querySelectorAll("[data-dankai]");
      /* app.css で滑らかスクロールが働くため、検査ではその場で飛ばす（動いている途中を読むと判定がぶれる） */
      secs[secs.length - 1].scrollIntoView({ block: "start", behavior: "instant" });
    });
    await new Promise(r2 => setTimeout(r2, 700));
    const last = await p.evaluate(() => {
      const li = document.querySelector("#jnySide .js-step.here");
      return li ? li.getAttribute("data-to") : "";
    });
    const lastId = r.secs[r.secs.length - 1].id;
    ok(last === lastId, `${pg.name}: 下までスクロールすると印が最後の段に移る`, `${last} / 期待 ${lastId}`);

    /* 狭い画面では1行に畳む */
    await p.setViewport({ width: 375, height: 780 });
    await new Promise(r3 => setTimeout(r3, 400));
    const narrow = await p.evaluate(() => {
      const side = document.getElementById("jnySide");
      const body = side.querySelector(".js-body");
      const before = getComputedStyle(body).display;
      side.querySelector(".js-toggle").click();
      return { before, after: getComputedStyle(body).display, x: document.body.scrollWidth - window.innerWidth };
    });
    ok(narrow.before === "none" && narrow.after !== "none", `${pg.name}: スマホ幅では畳まれ、押すと開く`);
    ok(narrow.x <= 5, `${pg.name}: スマホ幅で横にはみ出さない`, "はみ出し=" + narrow.x + "px");
    ok(errs.length === 0, `${pg.name}: JSエラーなし`, errs.join(" / "));
    await p.close();
  }
  /* 入口から道具ページに入ったあと、入口へ戻れるか
     （NM指示 2026-08-04。それまでは配られたURLを開き直すしかなかった） */
  const NS = process.env.NS || "myfarm-agri-compass-aic";
  for (const s of [
    { id: "nogakko", label: "農の学校の入口" },
    { id: "mirai", label: "みらい農業学校の入口" },
    { id: "aic", label: "AICの入口" },
  ]) {
    const p = await b.newPage();
    await p.setViewport({ width: 1500, height: 1000 });
    await p.goto(BASE + "/sites/" + s.id + "/index.html", { waitUntil: "networkidle2" });
    await p.evaluate(() => localStorage.clear());
    await p.goto(BASE + "/sites/" + s.id + "/index.html", { waitUntil: "networkidle2" });
    const href = await p.evaluate(() => {
      const a = [...document.querySelectorAll("main a")].find(x => /tools\//.test(x.getAttribute("href") || ""));
      return a ? a.getAttribute("href") : "";
    });
    ok(/[?&]s=/.test(href), `${s.label}: 道具ページへのリンクに入口の印がある`, href);
    await p.goto(BASE + "/sites/" + s.id + "/" + href, { waitUntil: "networkidle2" });
    await new Promise(r => setTimeout(r, 900));
    const back = await p.evaluate((label) => {
      const side = document.getElementById("jnySide");
      if (!side) return null;
      const row = [...side.querySelectorAll(".js-step")].find(li => (li.textContent || "").indexOf(label) > -1);
      const a = row ? row.querySelector("a") : null;
      return a ? { text: row.textContent.trim(), href: a.getAttribute("href") } : null;
    }, s.label);
    ok(!!back && back.href.indexOf("sites/" + s.id) > -1,
      `${s.label}: 道具ページの一覧から入口に戻れる`, back ? back.href : "行が無い");
    /* 別のページへ移っても覚えているか（印のないURLで開く） */
    await p.goto(BASE + "/tools/keikaku.html", { waitUntil: "networkidle2" });
    await new Promise(r => setTimeout(r, 800));
    const keep = await p.evaluate((label) => {
      const side = document.getElementById("jnySide");
      return side ? (side.textContent || "").indexOf(label) > -1 : false;
    }, s.label);
    ok(keep, `${s.label}: 別のページへ移っても入口を覚えている`);
    await p.close();
  }

  await b.close();
  console.log(fail ? `--- 不合格 ${fail}件 ---` : "--- 全項目 合格 ---");
  process.exit(fail ? 1 : 0);
})();
