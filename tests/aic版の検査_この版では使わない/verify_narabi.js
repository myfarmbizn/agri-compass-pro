/* 左の縦一覧と、上の「ページ一覧」の並びが一致するかを実ブラウザで確かめる */
const puppeteer = require("puppeteer-core");
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const BASE = process.env.BASE || "http://127.0.0.1:8123";
const NS = process.env.NS || "myfarm-agri-compass-aic";
let fail = 0;
function ok(c, m, extra) { console.log((c ? "PASS " : "FAIL ") + m + (extra ? " | " + extra : "")); if (!c) fail++; }

(async () => {
  const b = await puppeteer.launch({ executablePath: EDGE, headless: "new", args: ["--window-size=1500,1000"] });
  const p = await b.newPage();
  await p.setViewport({ width: 1500, height: 1000 });
  /* 2026-08-04: 左の一覧の先頭は「はじめに（トップ）」。上の一覧にも同じ行を置いたので、
     両方をそのまま突き合わせる（先頭行を除外しない） */
  for (const persona of ["kentou", "junbi", "koyou", "hatten"]) {
    await p.goto(BASE + "/index.html", { waitUntil: "networkidle2" });
    await p.evaluate((ns, pid) => { localStorage.setItem(ns + ":mfkPersona", JSON.stringify(pid)); }, NS, persona);
    await p.goto(BASE + "/tools/simulator.html", { waitUntil: "networkidle2" });
    await new Promise(r => setTimeout(r, 700));
    const r = await p.evaluate(() => {
      const side = [...document.querySelectorAll("#jnySide .js-list > li.js-step")]
        /* fin=仕上げの行、off=順路の外のページの行は、順路の並びの比較から外す */
        .filter(li => !li.classList.contains("fin") && !li.classList.contains("off"))
        .map(li => ({
          name: li.querySelector(".js-name") ? li.querySelector(".js-name").childNodes[0].textContent.trim() : "",
          num: li.querySelector(".js-dot") ? li.querySelector(".js-dot").textContent.trim() : "",
          subs: [...li.querySelectorAll(".js-sub a")].map(a => a.textContent.trim()),
        }));
      const det = document.querySelector(".nav-more");
      if (det) det.open = true;
      const menu = [...document.querySelectorAll(".nav-more-menu > *")].map(el => ({
        cls: el.className, txt: el.textContent.trim(),
        num: el.querySelector && el.querySelector(".nm-num") ? el.querySelector(".nm-num").textContent.trim() : "",
        label: el.querySelector && el.querySelector(".nm-label") ? el.querySelector(".nm-label").childNodes[0].textContent.trim() : "",
      }));
      return { side, menu };
    });
    const steps = r.menu.filter(m => m.cls.indexOf("nm-step") > -1);
    const subs = r.menu.filter(m => m.cls.indexOf("nm-sub") > -1);
    ok(steps.length === r.side.length, `[${persona}] 段の数が一致（左${r.side.length} / 一覧${steps.length}）`);
    const sideNames = r.side.map(s => s.name).join(" > ");
    const menuNames = steps.map(s => s.label).join(" > ");
    ok(sideNames === menuNames, `[${persona}] 並び順が一致`, "左: " + sideNames + " ／ 一覧: " + menuNames);
    const sideNums = r.side.map(s => s.num).join(",");
    const menuNums = steps.map(s => s.num).join(",");
    ok(sideNums === menuNums, `[${persona}] 番号・完了印が一致`, "左: " + sideNums + " ／ 一覧: " + menuNums);
    const sideSubs = r.side.flatMap(s => s.subs).join(",");
    const menuSubs = subs.map(s => s.txt).join(",");
    ok(sideSubs === menuSubs, `[${persona}] 段の中のページが一覧にも同じ順で出る`, "左: " + (sideSubs || "なし") + " ／ 一覧: " + (menuSubs || "なし"));
  }
  /* トップページも道具ページと同じ形か（NM指摘 2026-08-04「最初は上部に選択肢、次のページから左にある」） */
  for (const persona of ["", "junbi"]) {
    await p.goto(BASE + "/index.html", { waitUntil: "networkidle2" });
    await p.evaluate((ns, pid) => {
      localStorage.clear();
      if (pid) localStorage.setItem(ns + ":mfkPersona", JSON.stringify(pid));
    }, NS, persona);
    await p.reload({ waitUntil: "networkidle2" });
    await new Promise(r => setTimeout(r, 900));
    const t = await p.evaluate(() => {
      const side = document.getElementById("jnySide");
      const first = side ? side.querySelector(".js-step .js-name") : null;
      const names = side ? [...side.querySelectorAll(".js-step")]
        .filter(li => !li.classList.contains("fin"))
        .map(li => li.querySelector(".js-name").childNodes[0].textContent.trim()) : [];
      const navTxt = [...document.querySelectorAll(".topbar-nav > *")].map(el => el.textContent.trim().split("\n")[0]);
      const pathRows = [...document.querySelectorAll("#pvPath li b")].map(bb => bb.textContent.replace(/^\d+\s*/, "").trim());
      const fold = document.getElementById("foldPath");
      return {
        hasSide: !!side,
        firstName: first ? first.textContent.trim() : "",
        hereFirst: side ? !!(side.querySelector(".js-step") || {}).classList?.contains("here") : false,
        names, navTxt, pathRows,
        foldOpen: fold ? fold.open : null,
      };
    });
    const label = persona ? "立場を選んだあと" : "立場を選ぶ前";
    ok(t.hasSide, `[トップ・${label}] 左に一覧が出る`);
    ok(t.firstName.indexOf("はじめに") === 0 && t.hereFirst,
      `[トップ・${label}] 一覧の1行目がトップページで「いまここ」`, t.firstName);
    ok(t.navTxt.length === 2 && t.navTxt[0] === "トップ" && t.navTxt[1].indexOf("ページ一覧") === 0,
      `[トップ・${label}] 上のナビが道具ページと同じ形`, t.navTxt.join(" / "));
    if (persona) {
      const sideSteps = t.names.slice(1);
      ok(t.pathRows.length === sideSteps.length && t.pathRows.join(">") === sideSteps.join(">"),
        `[トップ・${label}] 本文の説明が左の一覧と同じ段・同じ順`, "本文: " + t.pathRows.join(" > "));
      ok(t.foldOpen === true, `[トップ・${label}] 段ごとの説明が最初から開いている`);
    }
  }

  /* 順路の外のページでも、いまどこにいるかが分かるか
     （NM指摘 2026-08-04「目標から逆算に飛んだ瞬間、自分がどこにいるか分からなくなった」） */
  for (const t of [
    { persona: "kentou", url: "/tools/gyakusan.html", name: "目標から逆算" },
    { persona: "kentou", url: "/tools/kurabe.html", name: "独立と雇用をくらべる" },
    { persona: "junbi", url: "/tools/toushi.html", name: "投資・雇用" },
  ]) {
    await p.goto(BASE + "/index.html", { waitUntil: "networkidle2" });
    await p.evaluate((ns, pid) => { localStorage.clear(); localStorage.setItem(ns + ":mfkPersona", JSON.stringify(pid)); }, NS, t.persona);
    await p.goto(BASE + t.url, { waitUntil: "networkidle2" });
    await new Promise(r => setTimeout(r, 900));
    const r2 = await p.evaluate(() => {
      const side = document.getElementById("jnySide");
      const off = side ? side.querySelector(".js-step.off") : null;
      const card = document.getElementById("jnyCard");
      const back = card ? card.querySelector(".jny-next") : null;
      return {
        hereCount: side ? side.querySelectorAll(".js-here").length : -1,
        offName: off ? off.querySelector(".js-name").childNodes[0].textContent.trim() : "",
        cardHead: card ? (card.querySelector("b") || {}).textContent || "" : "",
        backText: back ? back.textContent.trim() : "",
        backHref: back ? back.getAttribute("href") : "",
      };
    });
    ok(r2.offName === t.name && r2.hereCount === 1,
      `[順路の外・${t.name}] 一覧の先頭に「いまここ」が1つ出る`, r2.offName + " / 印" + r2.hereCount + "個");
    ok(r2.cardHead.indexOf(t.name) > -1 && r2.cardHead.indexOf("順路の外") > -1,
      `[順路の外・${t.name}] 本文にも、どのページかと順路の外である旨が出る`, r2.cardHead);
    ok(/^順路に戻る：/.test(r2.backText) && /\.html$/.test(r2.backHref),
      `[順路の外・${t.name}] 順路に戻る行き先が出る`, r2.backText + " → " + r2.backHref);
  }

  await b.close();
  console.log(fail ? `NG ${fail}件` : "全項目 合格");
  process.exit(fail ? 1 : 0);
})();
