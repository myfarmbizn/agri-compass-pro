/* 全ページを一巡して「いま自分がどこにいるか」が出ているかを確かめる。
   NM指示 2026-08-04「農の学校や南相馬も同様に。いけてないUIUXを撲滅して」。
   1ページずつ人が見るのは現実的でないので、次の4点を機械で当てる。
     ① 左の一覧（狭い画面では上の1行）が出ていて、「いまここ」がちょうど1つ
     ② 順路の中なら「いまやること」、順路の外なら「ここは◯◯です」の枠が本文にある
     ③ JSエラーが出ない
     ④ スマホ幅（375px）で横にはみ出さない
   授業モード（?koma=）と指導者は一覧を出さない仕様なので対象外。 */
const puppeteer = require("puppeteer-core");
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const BASE = process.env.BASE || "http://127.0.0.1:8123";
const NS = process.env.NS || "myfarm-agri-compass-aic";

const TOOLS = [
  "check10", "checkup", "hinmoku", "sakutsuke", "simulator", "shikin", "taifu",
  "keikaku", "toushi", "smart", "kyuyo", "gyakusan", "kurabe", "konkyo", "hanro", "kibi", "soudan",
];
const PERSONAS = ["kentou", "junbi", "koyou", "hatten"];
let fail = 0;
function ok(c, m, extra) { console.log((c ? "PASS " : "FAIL ") + m + (extra ? " | " + extra : "")); if (!c) fail++; }

(async () => {
  const b = await puppeteer.launch({ executablePath: EDGE, headless: "new" });

  for (const persona of PERSONAS) {
    for (const t of TOOLS) {
      const p = await b.newPage();
      const errs = [];
      p.on("pageerror", e => errs.push(String(e).slice(0, 120)));
      await p.setViewport({ width: 1500, height: 1000 });
      await p.goto(BASE + "/index.html", { waitUntil: "domcontentloaded" });
      await p.evaluate((ns, pid) => { localStorage.clear(); localStorage.setItem(ns + ":mfkPersona", JSON.stringify(pid)); }, NS, persona);
      await p.goto(BASE + "/tools/" + t + ".html", { waitUntil: "domcontentloaded" });
      await new Promise(r => setTimeout(r, 900));
      const r = await p.evaluate(() => {
        const side = document.getElementById("jnySide");
        const card = document.getElementById("jnyCard");
        /* 左の一覧で「いまここ」が付いている行が、順路の中の段か、順路の外の行か */
        const hereRow = side ? side.querySelector(".js-step.here") : null;
        return {
          hasSide: !!side,
          here: side ? side.querySelectorAll(".js-here").length : -1,
          inRoute: hereRow ? !hereRow.classList.contains("off") : false,
          card: !!card,
          cardHead: card ? (card.querySelector("b") || {}).textContent || "" : "",
        };
      });
      ok(r.hasSide && r.here === 1, `[${persona}] ${t}: 一覧に「いまここ」が1つ`, "一覧" + (r.hasSide ? "あり" : "なし") + " 印" + r.here + "個");
      ok(r.card, `[${persona}] ${t}: 本文にいまの位置づけの枠がある`, r.cardHead.slice(0, 40));
      /* 左の一覧と本文の言うことが食い違わないこと（順路の中なのに「順路の外」と出ていた不具合の再発防止） */
      const saysOff = r.cardHead.indexOf("順路の外") > -1;
      ok(r.inRoute !== saysOff, `[${persona}] ${t}: 一覧と本文の言うことが一致`,
        (r.inRoute ? "一覧=順路の中" : "一覧=順路の外") + " / 本文=" + (saysOff ? "順路の外" : "順路の中"));
      ok(errs.length === 0, `[${persona}] ${t}: JSエラーなし`, errs.join(" / "));
      await p.close();
    }
  }

  /* スマホ幅で横にはみ出さないか（立場は1つで足りる。幅の問題は立場に依らない） */
  for (const t of TOOLS) {
    const p = await b.newPage();
    await p.setViewport({ width: 375, height: 780 });
    await p.goto(BASE + "/index.html", { waitUntil: "domcontentloaded" });
    await p.evaluate((ns) => { localStorage.clear(); localStorage.setItem(ns + ":mfkPersona", JSON.stringify("junbi")); }, NS);
    await p.goto(BASE + "/tools/" + t + ".html", { waitUntil: "domcontentloaded" });
    await new Promise(r => setTimeout(r, 800));
    const over = await p.evaluate(() => document.body.scrollWidth - window.innerWidth);
    ok(over <= 5, `[スマホ375px] ${t}: 横にはみ出さない`, "はみ出し" + over + "px");
    await p.close();
  }

  await b.close();
  console.log(fail ? `--- 不合格 ${fail}件 ---` : "--- 全項目 合格 ---");
  process.exit(fail ? 1 : 0);
})();
