/* ============================================================
   マイファーム農業経営コンパス — 事業計画づくりの進行表（journey）v1
   目的: ゴールは「県の数字を出発点に、自分の数字で事業計画を作ること」。
   進み具合（完了・未着手・県の値のまま／必須・任意）を上部の進行帯で
   常に見えるようにし、各ページでは「ここでやること」と「次はどこ」を示す。
   ・全ページ共通の1ファイル。既存ページの本文は改修しない（core.jsが動的読込）。
   ・完了判定は「進行表を始めた時点のスナップショットからの、保存データの差分」。
     例外は計画書ページのみ（自動保存のため、印刷・ファイル保存ボタンのIDでも判定）。
   ・順序は推奨。ページ移動は一切ブロックしない。上部ナビは常に併存する。
   ・進み具合はこの端末のブラウザにだけ保存され、「入力データをすべて消す」で
     進行表も振出しに戻る（共有パソコン対応）。
   ・v1（2026-07-19）: 左カラムを廃止し、上部ナビ直下の横帯に一本化。
     ルート外のページでも帯を出し、いまの進め方と戻り先を常に示す。
   ============================================================ */
(function () {
  "use strict";
  if (!window.CORE || !CORE.store) return;
  var store = CORE.store;
  var PAGE = (location.pathname.split("/").pop() || "index.html").replace(".html", "") || "index";
  var qs = new URLSearchParams(location.search);
  if (qs.get("koma")) return;                 // 授業モードは教員が道順を仕切るので出さない
  /* 現役農家版は対象が1つ（現役のプロ農家）なので、立場の選び分けをしない。
     順路は常に1本。保存済みの立場が何であっても、この順路を出す。 */
  var PID = "genneki";

  /* ---------- 保存データの指紋（差分判定用） ---------- */
  function sig(key) {
    try {
      var v = store.load(key, null);
      if (v == null) return "0";
      /* 保存時刻だけが変わる再保存で「完了」に倒れないよう、時刻印は指紋から除く */
      var s = JSON.stringify(v, function (k, val) {
        return (k === "savedAt" || k === "updatedAt") ? undefined : val;
      });
      var h = 0;
      for (var i = 0; i < s.length; i++) { h = (h * 31 + s.charCodeAt(i)) | 0; }
      return s.length + ":" + h;
    } catch (e) { return "0"; }
  }
  var WATCH = ["cropCustom", "plan", "simPlan", "cashflow", "keikakuDraft", "annual",
    "taifuLocal", "insurance", "konkyo", "kiroku", "nozomi", "teian"];
  function changed(key) { return sig(key) !== (META.base[key] || "0"); }
  /* 計画書ページは描画のたびに自動保存されるため、印刷・ファイル保存ボタン（ID）でも完了とみなす。
     opLogのクリック記録は v にボタンIDが入る（core.jsの仕様）。文言では判定しない。 */
  function printedKeikaku() {
    try {
      var log = store.load("oplog", []) || [];
      for (var i = log.length - 1; i >= 0; i--) {
        var e = log[i];
        if (e.p === "keikaku" && e.e === "click" && (e.v === "btnPrint" || e.v === "btnFile")) return true;
      }
    } catch (e) {}
    return false;
  }

  /* ---------- ステップの定義 ----------
     required: 必須（事業計画づくりの本体）／ 任意は「使う場合だけ」 */
  var STEPS = {
    hinmoku: { page: "hinmoku", title: "品目と単価", min: "5分", required: true,
      mission: "いま作っている品目に印を付けて、面積を入れてください。単価か単収に自分の値があれば、その場で直せます。",
      benefit: "ここで決めた数字が、この先の作付け・収支・資金繰り・計画書のすべての計算のもとになります。",
      /* 段1の本体は「品目に印を付けて面積を入れる」ことで、そのとき書かれるのは simPlan。
         cropCustom は単価や単収を直したときにしか変わらないので、これだけで見ていると、
         段1を済ませても未完了のままになる（2026-08-16に実測） */
      done: function () {
        var p = store.load("simPlan", null);
        return !!(p && p.items && p.items.length) || changed("cropCustom");
      },
      evid: function () {
        var p = store.load("simPlan", null);
        var kazu = (p && p.items) ? p.items.length : 0;
        var c = store.load("cropCustom", null);
        var jibun = c ? (Object.keys(c.overrides || {}).length + (c.custom || []).length) : 0;
        var t = [];
        if (kazu) t.push("品目 " + kazu + "件");
        if (jibun) t.push("自分の値 " + jibun + "件");
        return t.join("・");
      } },
    kiroku: { page: "kiroku", title: "記録を入れる", min: "5分", required: false, skippable: true,
      mission: "手元にある出荷伝票・ノートの写真・記録ツールの書き出し・決算書を、そのまま送ってください。1枚からで構いません。",
      benefit: "送った記録から、単価や単収が自分の数字になります。手で打ち直す必要がなくなります。",
      done: function () { return changed("kiroku"); },
      evid: function () { var k = store.load("kiroku", null); return (k && k.kensu) ? "読み取り " + k.kensu + "件" : ""; } },
    kessan: { page: "checkup", title: "実績の診断", min: "10分", required: true,
      mission: "申告書（収支内訳書・青色決算書）の数字を写すと、品目ごとの所得と時給が出ます。そのあと「これからの計算の前提にする」を押せます。",
      benefit: "どの品目が時間の割に稼げていないかが分かり、その実績がこの先の計算の前提になります。",
      done: function () { return changed("annual"); },
      evid: function () { return changed("annual") ? "実績あり" : ""; } },
    keikakuzukuri: { page: "sakutsuke", pages: ["sakutsuke", "simulator", "shikin", "toushi", "taifu"],
      title: "計画を作る", min: "20分", required: true,
      mission: "作付けの案を組み、数年先の収支と資金繰りを確かめます。投資や災害への備えも、必要なら同じ段で見られます。",
      benefit: "計画の弱い前提と、手元のお金が薄くなる時期が先に分かります。",
      /* simPlan は段1（品目と単価）でも書かれるため、ここでは見ない。
         見ると、段1で面積を入れただけでこの段が終わったことになる */
      done: function () { return changed("plan") || changed("cashflow") || changed("taifuLocal"); },
      evid: function () {
        var p = store.load("plan", null);
        if (p && p.name) return "決定: " + String(p.name).slice(0, 14);
        return (changed("cashflow") || changed("taifuLocal")) ? "試算あり" : "";
      } },
    nozomi: { page: "nozomi", title: "なりたい姿", min: "5分", required: true,
      mission: "何年後に、農業所得をいくらにしたいか。1年の働く時間をどれくらいにしたいか。手放したくないものはどれか。この3つを入れてください。",
      benefit: "次の段で、この条件に合う直しどころだけが出ます。",
      done: function () { return changed("nozomi"); },
      evid: function () { var n = store.load("nozomi", null); return (n && n.mokuhyouMan) ? n.nen + "年後 " + n.mokuhyouMan + "万円" : ""; } },
    teian: { page: "teian", title: "計画の直しどころ", min: "5分", required: true,
      mission: "いまの計画・自分の数字・なりたい姿をもとに、計画のどこを変えると届くかを出します。金額はすべて計算し直したものです。",
      benefit: "どの打ち手が、どれだけ効くのかが数字で並びます。",
      done: function () { return changed("teian"); },
      evid: function () { var t = store.load("teian", null); return (t && t.an && t.an.length) ? "案 " + t.an.length + "件" : ""; } },
    katachi: { page: "keikaku", title: "計画書にまとめる", min: "10分", required: false,
      mission: "ここまでの数字をA4の計画書にまとめます。まとめたあと、書きもれと数字の食い違いを読み合わせできます。",
      benefit: "家族・金融機関・市町村に見せられる資料になります。",
      done: function () { return changed("keikakuDraft") || printedKeikaku(); },
      evid: function () { return (changed("keikakuDraft") || printedKeikaku()) ? "下書きあり" : ""; } },
    konkyo: { page: "konkyo", title: "数字の根拠しらべ", min: "10分", required: false,
      mission: "計画に入っている数字の一つひとつに「どこから来た数字か」を付けます。実績や記録から作った数字は、すでに埋まっています。",
      benefit: "根拠が薄い数字の一覧が、相談リストとしてA4で印刷できます。",
      done: function () { return changed("konkyo"); },
      evid: function () { return changed("konkyo") ? "出どころの記入あり" : ""; } },
  };
  /* 現役農家版の順路は1本。設計の段1〜段7に合わせてある。
     根拠しらべ（konkyo）は任意なので順路には入れず、
     ページ一覧の「そのほかの道具」から開ける。 */
  var ROUTES = {
    genneki: ["hinmoku", "kiroku", "kessan", "keikakuzukuri", "nozomi", "teian", "katachi"],
  };
  var REQUIRED_OVERRIDE = {};
  function isRequired(id) {
    var ov = REQUIRED_OVERRIDE[PID];
    if (ov && ov[id] != null) return ov[id];
    return !!STEPS[id].required;
  }
  var route = ROUTES[PID] || null;

  /* 立場の選び分けをやめたので、読み直すものが無い。呼び出し側はそのまま残してある。 */
  function syncPersona() { return false; }

  /* ---------- 進行メタ（開始時スナップショット） ---------- */
  var META = store.load("journey", null);
  function newMeta() {
    var base = {};
    WATCH.forEach(function (k) { base[k] = sig(k); });
    return { p: PID, startedAt: new Date().toISOString(), base: base, kari: {}, manual: {} };
  }
  if (!META || META.p !== PID || !META.base) { META = newMeta(); if (route) store.save("journey", META); }
  /* 監視キーを増やした場合の互換: 既存の進行メタに無いキーは、いまの状態を基準に取り直す
     （改修前から保存があるだけで「完了」に見える誤判定を防ぐ） */
  if (META && META.base && route) {
    var backfilled = false;
    WATCH.forEach(function (k) {
      if (META.base[k] == null) { META.base[k] = sig(k); backfilled = true; }
    });
    if (backfilled) store.save("journey", META);
  }
  /* 演習例(?preset=)は自動でcropCustom/simPlanを保存する。未完了のステップに限り基準を取り直して誤完了を防ぐ */
  if (qs.get("preset") && route) {
    ["cropCustom", "simPlan"].forEach(function (k) {
      var stepId = (k === "cropCustom") ? "jibun" : "sakiyomi";
      if (route.indexOf(stepId) > -1 && !STEPS[stepId].done()) { META.base[k] = sig(k); }
    });
    store.save("journey", META);
  }

  function stateOf(id) {
    if (STEPS[id].done()) return "done";
    if (META.manual && META.manual[id]) return "done";   // 「完了にして次へ」で本人が完了させた
    if (META.kari && META.kari[id]) return "kari";
    return "todo";
  }
  function evidOf(id) {
    var e = STEPS[id].evid();
    if (e) return e;
    if (META.manual && META.manual[id]) return "確認済み";
    return "";
  }
  /* このページが受け持つステップ（進行表に載っているもの） */
  function stepOfPage() {
    if (!route) return null;
    for (var i = 0; i < route.length; i++) {
      var s = STEPS[route[i]];
      if ((s.pages || [s.page]).indexOf(PAGE) > -1) return route[i];
    }
    return null;
  }
  /* いま取り組むステップ＝未完了の必須の先頭。必須が全部済んだら未完了の任意、それも無ければ仕上げ */
  function currentId() {
    if (!route) return null;
    for (var i = 0; i < route.length; i++) if (isRequired(route[i]) && stateOf(route[i]) === "todo") return route[i];
    for (var j = 0; j < route.length; j++) if (!isRequired(route[j]) && stateOf(route[j]) === "todo") return route[j];
    return null; // 全部済み
  }
  function requiredAllDone() {
    if (!route) return false;
    for (var i = 0; i < route.length; i++) {
      if (isRequired(route[i]) && stateOf(route[i]) === "todo") return false;
    }
    return true;
  }

  /* ---------- 見た目（AIC版 v2: app.css のトークンを参照する） ----------
     旧版は色を直に書いていたため、全体の配色を変えても帯だけ取り残された。
     ここでは var(--accent) などの共通トークンだけを使い、app.css 側の変更に追従させる */
  /* 左の縦一覧（.jny-side）の見た目は app.css に置いてある。学校の入口ページの
     段階一覧（dankai.js）と同じ定義を使うため、ここでは書かない（2026-08-04） */
  var css = "" +
    /* ナビの「その他のページ」開閉メニュー（順路外の道具ページ置き場） */
    ".nav-more{position:relative;display:inline-block;flex-shrink:0;}" +
    ".nav-more summary{list-style:none;cursor:pointer;color:var(--ink-2);font-weight:650;font-size:12.5px;padding:7px 11px;border-radius:8px;white-space:nowrap;}" +
    ".nav-more summary:hover{background:var(--wash);}" +
    ".nav-more summary::-webkit-details-marker{display:none;}" +
    ".nav-more[open] summary{background:var(--accent-soft);color:var(--accent);}" +
    ".nav-more .nav-more-menu{position:absolute;right:0;top:calc(100% + 8px);background:var(--card);border:1px solid var(--hairline);" +
      "border-radius:14px;box-shadow:var(--shadow-pop);padding:8px;min-width:240px;z-index:60;display:flex;flex-direction:column;gap:2px;}" +
    ".nav-more .nav-more-menu a{display:block;padding:9px 12px;border-radius:9px;color:var(--ink-2);text-decoration:none;font-size:13px;white-space:nowrap;}" +
    ".nav-more .nav-more-menu a:hover{background:var(--accent-softer);color:var(--accent);}" +
    ".nav-more .nav-more-menu a.active{color:var(--accent);font-weight:700;background:var(--accent-soft);}" +
    ".nav-more .nav-more-menu .nm-head{font-size:11px;font-weight:800;letter-spacing:.08em;color:var(--ink-4);padding:8px 12px 4px;}" +
    /* 順路の中の行（左の縦一覧と同じ番号・同じ完了印を出す） */
    ".nav-more .nav-more-menu a.nm-step{display:flex;align-items:center;gap:9px;}" +
    ".nav-more .nav-more-menu .nm-num{flex:0 0 20px;width:20px;height:20px;border-radius:50%;display:grid;place-items:center;" +
      "background:var(--card);border:1.5px solid var(--hairline-strong);color:var(--ink-3);font-size:11px;font-weight:800;}" +
    ".nav-more .nav-more-menu .nm-num.done{background:var(--accent);border-color:var(--accent);color:#fff;}" +
    ".nav-more .nav-more-menu .nm-opt{font-size:10.5px;font-weight:700;color:var(--ink-4);margin-left:6px;}" +
    ".nav-more .nav-more-menu a.nm-sub{padding-left:41px;font-size:12.5px;color:var(--ink-3);}" +
    ".nav-more .nav-more-menu .nm-guide{border-top:1px solid var(--hairline);margin-top:6px;padding-top:10px;color:var(--accent);font-weight:700;}" +
    ".nav-home{color:var(--ink-2);text-decoration:none;font-size:12.5px;font-weight:650;padding:7px 11px;border-radius:8px;white-space:nowrap;}" +
    ".nav-home:hover{background:var(--wash);color:var(--accent);}" +
    ".jny-band .jb-note{margin-top:7px;color:var(--ink-3);font-size:12px;line-height:1.7;}" +
    ".jny-band .jb-note a{color:var(--accent);font-weight:700;}" +
    /* ページ内カード・ボタン・下部バー・通知 */
    ".jny-card{border:1px solid var(--accent-line);border-radius:var(--r-lg);padding:16px 18px;margin:16px 0 20px;" +
      "background:var(--accent-softer);}" +
    ".jny-card b.jt{color:var(--accent-deep);font-size:15px;letter-spacing:-.01em;}" +
    /* ページ側の「保存する・決める」ボタン（緑の塗り）と見分けがつくよう、順路の案内は枠線にする。
       同じ見た目のボタンが並ぶと、どちらを押せばよいか分からなくなるため（NM指摘 2026-08-04） */
    ".jny-next{display:inline-block;margin-top:10px;padding:9px 18px;border-radius:999px;border:1.5px solid var(--accent);" +
      "color:var(--accent);background:var(--card);text-decoration:none;font-weight:730;transition:background .2s var(--ease),color .2s var(--ease),transform .2s var(--ease);}" +
    ".jny-next:hover{background:var(--accent);color:#fff;transform:translateY(-1px);}" +
    ".jny-next.off{opacity:.55;border-style:dashed;font-weight:400;background:transparent;color:var(--ink-3);border-color:var(--hairline-strong);}" +
    ".jny-skip{display:inline-block;margin:8px 0 0 12px;color:var(--ink-3);text-decoration:underline;cursor:pointer;font-size:12px;}" +
    ".jny-bottom{border:1px solid var(--hairline);border-radius:var(--r-lg);padding:14px 18px;margin:24px 0 8px;" +
      "background:var(--card);box-shadow:var(--shadow-card);display:flex;align-items:center;gap:12px;flex-wrap:wrap;}" +
    ".jny-toast{position:fixed;right:18px;bottom:18px;z-index:99;background:var(--card);border:1px solid var(--accent-line);" +
      "color:var(--accent-deep);padding:13px 17px;border-radius:14px;max-width:340px;font-size:13px;box-shadow:var(--shadow-pop);}" +
    "";
  var styleEl = document.createElement("style");
  styleEl.textContent = css;
  document.head.appendChild(styleEl);

  function relRoot() { return (location.pathname.indexOf("/tools/") > -1) ? "" : "tools/"; }
  function homeHref() { return (location.pathname.indexOf("/tools/") > -1) ? "../index.html" : "index.html"; }
  /* 学校の入口から来た人には、その入口へ戻る道を一覧の先頭に出す（core.js が覚えている） */
  function iriguchi() { return (window.CORE && CORE.IRIGUCHI) || null; }
  function iriguchiHref(id) {
    return ((location.pathname.indexOf("/tools/") > -1) ? "../" : "") + "sites/" + id + "/index.html";
  }
  function iriguchiRow() {
    var ir = iriguchi();
    if (!ir) return "";
    return "<li class='js-step'><a class='js-link' href='" + iriguchiHref(ir.id) + "' " +
      "title='最初に開いた学校の入口ページに戻ります'>" +
      "<span class='js-dot'>↩</span><span class='js-name'>" + ir.label +
      "<span class='js-evid'>最初に開いたページ</span></span></a></li>";
  }
  function hrefOf(id) { return relRoot() + STEPS[id].page + ".html"; }

  /* ---------- 進み具合の一覧（2026-08-04 作り替え） ----------
     旧: 上に横並びのチップを1列。段の中に2ページある所（収支と資金繰り）が1つのチップに
     まとまり、ページが変わるのに表示が変わらないため分かりにくかった（NM指摘）。
     新: 縦に並べ、済んだ段に丸印を付ける。段の中の複数ページは入れ子で1行ずつ出す。
     広い画面では本文の左に貼り付け、狭い画面では「3 / 7 完了」の1行に畳んで開閉する。
     （縦のステッパー＋チェックリストの型。狭い画面では畳んで「n/m完了」を出すのが定石） */
  var sideEl = null;
  function pageLabel(pg) {
    return (window.CORE && CORE.STEP_LABELS && CORE.STEP_LABELS[pg]) || pg;
  }
  /* トップページにも同じ一覧を出す（NM指摘 2026-08-04「最初は上部に選択肢、次のページから左にある。
     気持ち悪い」）。旧はトップだけ横並びのナビ、道具ページは左の一覧という二本立てだった。
     立場を選ぶ前は行き先が決まらないので、一覧の場所だけ出して「まず立場を選ぶ」と伝える。 */
  function renderSideEmpty() {
    if (!sideEl) {
      sideEl = document.createElement("nav");
      sideEl.className = "jny-side no-print";
      sideEl.id = "jnySide";
      sideEl.setAttribute("aria-label", "進め方の一覧");
      var tb0 = document.querySelector(".topbar");
      if (tb0) tb0.insertAdjacentElement("afterend", sideEl);
      else document.body.insertAdjacentElement("afterbegin", sideEl);
      document.body.classList.add("has-side");
    }
    sideEl.innerHTML =
      "<div class='js-head'>" +
        "<button type='button' class='js-toggle' id='jnySideToggle'>" +
          "<span class='js-ttl'>進め方</span>" +
          "<span class='js-count js-nowlabel'>まだ決まっていません</span>" +
        "</button>" +
      "</div>" +
      "<div class='js-body'><ol class='js-list'>" + iriguchiRow() + "</ol>" +
        "<div class='js-note'>進め方の順路がまだ出ていません。品目と単価の画面から始めてください。</div>" +
      "</div>";
    var tg0 = document.getElementById("jnySideToggle");
    if (tg0) tg0.addEventListener("click", function (ev) { ev.stopPropagation(); sideEl.classList.toggle("open"); });
    renderNavCollapse();
  }

  function renderBand() {
    if (!route) {
      if (PAGE === "index") { renderSideEmpty(); return; }
      if (sideEl) { sideEl.remove(); sideEl = null; }
      document.body.classList.remove("has-side");
      renderNavCollapse();
      return;
    }
    if (!sideEl) {
      sideEl = document.createElement("nav");
      sideEl.className = "jny-side no-print";
      sideEl.id = "jnySide";
      sideEl.setAttribute("aria-label", "進め方の一覧");
      var tb = document.querySelector(".topbar");
      if (tb) tb.insertAdjacentElement("afterend", sideEl);
      else document.body.insertAdjacentElement("afterbegin", sideEl);
      document.body.classList.add("has-side");
    }
    var wasOpen = sideEl.classList.contains("open");
    var cur = currentId();
    var doneCount = 0;
    var items = route.map(function (id, i) {
      var st = stateOf(id);
      var step = STEPS[id];
      var pages = step.pages || [step.page];
      var onThisPage = pages.indexOf(PAGE) > -1;
      if (st === "done") doneCount++;
      var cls = "js-step " + st + (onThisPage ? " here" : "") + (id === cur ? " now" : "") + (isRequired(id) ? "" : " opt");
      var mark = st === "done" ? "✓" : (i + 1);
      var sub = "";
      if (pages.length > 1) {
        sub = "<div class='js-subhead'>この段は" + pages.length + "つのページで1組です</div>" +
          "<ul class='js-sub'>" + pages.map(function (pg) {
          var visited = (store.load("visited", {}) || {})[pg];
          var scls = (pg === PAGE ? "here" : "") + (visited ? " seen" : "");
          /* ここの印は「開いたことがある」の意味。段の完了（✓）とは別物なので印を変える */
          return "<li class='" + scls + "'><a href='" + relRoot() + pg + ".html' title='" +
            (visited ? "開いたことがあります" : "まだ開いていません") + "'>" +
            "<span class='js-subdot'></span>" + pageLabel(pg) + "</a></li>";
        }).join("") + "</ul>";
      }
      var evid = evidOf(id);
      return "<li class='" + cls + "'>" +
        "<a class='js-link' href='" + hrefOf(id) + "' title='" +
          (isRequired(id) ? "必須" : "任意（使う場合だけ）") + "・目安" + step.min + "'>" +
          "<span class='js-dot'>" + mark + "</span>" +
          "<span class='js-name'>" + step.title +
            (onThisPage ? "<span class='js-here'>いまここ</span>" : "") +
            (isRequired(id) ? "" : "<span class='js-opt'>任意</span>") +
            (evid ? "<span class='js-evid'>" + evid + "</span>" : "") +
          "</span>" +
        "</a>" + sub + "</li>";
    }).join("");

    var total = route.length;
    var pct = total ? Math.round(doneCount / total * 100) : 0;
    /* 経営力チェックはこの版に置かないので、仕上げは計画書の読み合わせにする */
    var finCls = requiredAllDone() ? "js-step fin ready" : "js-step fin";
    var fin = "<li class='" + finCls + "'><a class='js-link' href='" + relRoot() + "keikaku.html' " +
      "title='計画書にまとめて、書きもれと数字の食い違いを読み合わせます'>" +
      "<span class='js-dot'>◎</span><span class='js-name'>仕上げ：計画書を読み合わせる</span></a></li>";

    /* 順路の外のページ（目標から逆算・独立と雇用をくらべる など）にいるとき、
       一覧に「いまここ」がどこにも出ず、自分の居場所が分からなくなっていた
       （NM指摘 2026-08-04「目標から逆算に飛んだ瞬間、自分がどこにいるか分からなくなった」）。
       いま開いているページの行を一覧の先頭に出し、順路のどこへ戻ればよいかも書く。 */
    var offRow = "", note = "";
    if (!stepOfPage() && PAGE !== "index") {
      var backId = cur || route[route.length - 1];
      offRow = "<li class='js-step off here'>" +
        "<span class='js-link' style='cursor:default'>" +
          "<span class='js-dot'>◇</span>" +
          "<span class='js-name'>" + pageLabel(PAGE) +
            "<span class='js-here'>いまここ</span>" +
            "<span class='js-evid'>順路の外の道具です</span>" +
          "</span>" +
        "</span></li>";
      note = "<div class='js-note'>このページは、下の順路には入っていません。必要なときに使う道具です。" +
        (backId ? "<br><a href='" + hrefOf(backId) + "'>順路に戻る：" + STEPS[backId].title + " →</a>" : "") + "</div>";
    }

    /* 一覧の先頭は必ずトップページ。「トップは何のページで、そこから段が始まる」を
       一続きで見せるため、ヘッダーの ⌂トップ ボタンはやめて一覧の1行目に入れた
       （NM指摘 2026-08-04「表紙と各ステップがわかるようなわからないような」） */
    /* 現役農家版はトップを置かないので、一覧の1行目は段1（品目と単価）そのものになる。
       順路の外のページにいるときに「いまここ」が消えないようにする対応は、各段の側に残してある
       （NM指摘 2026-08-04「目標から逆算に飛んだ瞬間、自分がどこにいるか分からなくなった」）。 */
    var home = "";

    sideEl.innerHTML =
      "<div class='js-head'>" +
        "<button type='button' class='js-toggle' id='jnySideToggle'>" +
          "<span class='js-ttl'>進め方</span>" +
          "<span class='js-count'>" + doneCount + " / " + total + " 完了</span>" +
        "</button>" +
      "</div>" +
      "<div class='meter js-meter'><i style='width:" + pct + "%'></i></div>" +
      "<div class='js-body'>" + (offRow ? "<ol class='js-list js-offlist'>" + offRow + "</ol>" : "") +
      "<ol class='js-list'>" + iriguchiRow() + home + items + fin + "</ol>" + note + "</div>";

    if (wasOpen) sideEl.classList.add("open");
    var tg = document.getElementById("jnySideToggle");
    if (tg) tg.addEventListener("click", function (ev) {
      ev.stopPropagation();
      sideEl.classList.toggle("open");
    });
    renderNavCollapse();
  }

  var _navOrig = null;
  /* ---------- 上のナビ＝ページ一覧（2026-08-04作り替え・同日 並び順を修正） ----------
     旧: 順路のページをナビから消し、残りだけを「その他のページ」に入れていた。
     この作りだと、上から行ける先が数ページしかなく、トップへ戻る道もロゴだけで、
     どこに何があるのか分からない（NM指摘 2026-08-04「その他のページが機能してない」）。
     新: ナビは「トップ」と「ページ一覧」の2つだけにし、一覧の中に全ページを
     「順路の中」「そのほか」に分けて並べる。ここからどのページへも行ける。

     並び順の修正（NM指摘 2026-08-04「ここの並び順など違うのは気持ち悪い」）:
     左の縦一覧は順路（ROUTES）の順、この一覧は core.js の TOOLS の順で作っていたため、
     同じ画面に2つの並びが同時に出ていた。さらに順路にあってもナビに無いページ
     （立場「就農を考えている」の資金繰りなど）は一覧から丸ごと落ちていた。
     ここでは順路の中の並びを ROUTES から直に組み立て、左の縦一覧と同じ順番・同じ番号・
     同じ完了印にする。ナビの元リンクは「必要なときに使うページ」の方だけで使う。 */
  function renderNavCollapse() {
    try {
      var nav = document.querySelector(".topbar-nav");
      if (!nav) return;
      if (_navOrig === null) {
        _navOrig = [];
        for (var i = 0; i < nav.children.length; i++) {
          var el2 = nav.children[i];
          if (el2.tagName === "A") _navOrig.push(el2);
        }
        _navOrig.forEach(function (a) { if (!a.dataset.baseLabel) a.dataset.baseLabel = a.textContent; });
      }
      var wasOpen = !!nav.querySelector(".nav-more[open]");
      nav.innerHTML = "";
      /* 右端をぼかすマスク（app.css）が掛かったままだと、下に開くメニューまで消えてしまう。
         一覧を開ける状態のときはマスクを外す（NM指摘 2026-08-04「その他のページが機能してない」の実体） */
      nav.style.overflow = "visible";
      nav.style.webkitMaskImage = "none";
      nav.style.maskImage = "none";

      /* この版はトップを置かない。最初の段（品目と単価）へ戻る道を文字でも出す */
      var home = document.createElement("a");
      home.href = relRoot() + "hinmoku.html";
      home.className = "nav-home";
      home.textContent = "品目と単価";
      nav.appendChild(home);

      /* 順路が決まっていないとき（立場を選ぶ前）も、ナビの形は同じにする。
         旧はここだけ全ページの横並びで、次のページから「ページ一覧」に変わっていた
         （NM指摘 2026-08-04「上部に選択肢、次のページから左にある。気持ち悪い」） */
      if (!route) {
        var det0 = document.createElement("details");
        det0.className = "nav-more";
        det0.open = wasOpen;
        var sum0 = document.createElement("summary");
        sum0.textContent = "ページ一覧 ▾";
        sum0.title = "この道具の全ページです。立場を選ぶと、進め方の順路つきで並びます";
        det0.appendChild(sum0);
        var menu0 = document.createElement("div");
        menu0.className = "nav-more-menu";
        var h0 = document.createElement("div");
        h0.className = "nm-head";
        h0.textContent = "すべてのページ";
        menu0.appendChild(h0);
        var ir0 = iriguchi();
        if (ir0) {
          var a0 = document.createElement("a");
          a0.href = iriguchiHref(ir0.id);
          a0.className = "nm-step";
          a0.innerHTML = "<span class='nm-num'>↩</span><span class='nm-label'>" + ir0.label + "</span>";
          menu0.appendChild(a0);
        }
        _navOrig.forEach(function (a) { a.textContent = a.dataset.baseLabel; menu0.appendChild(a); });
        var g0 = document.createElement("a");
        g0.href = (location.pathname.indexOf("/tools/") > -1 ? "../" : "") + "guide.html";
        g0.className = "nm-guide";
        g0.textContent = "全体の見取り図を見る";
        menu0.appendChild(g0);
        det0.appendChild(menu0);
        nav.appendChild(det0);
        if (!window.__mfkNavMoreClose) {
          window.__mfkNavMoreClose = true;
          document.addEventListener("click", function (ev) {
            document.querySelectorAll(".nav-more[open]").forEach(function (d) {
              if (!d.contains(ev.target)) d.open = false;
            });
          });
        }
        return;
      }

      /* 順路が受け持つページと、それ以外に分ける */
      var routePages = [];
      route.forEach(function (id) {
        (STEPS[id].pages || [STEPS[id].page]).forEach(function (pg) { routePages.push(pg + ".html"); });
      });
      var rest = [];
      _navOrig.forEach(function (a) {
        var href = a.getAttribute("href") || "";
        var hit = false;
        for (var j = 0; j < routePages.length; j++) if (href.indexOf(routePages[j]) > -1) hit = true;
        if (!hit) rest.push(a);
      });

      var det = document.createElement("details");
      det.className = "nav-more";
      det.open = wasOpen;
      var sum = document.createElement("summary");
      sum.textContent = "ページ一覧 ▾";
      sum.title = "この道具の全ページです。順路の中のページも、そうでないページもここから開けます";
      det.appendChild(sum);
      var menu = document.createElement("div");
      menu.className = "nav-more-menu";

      function head(title) {
        var h = document.createElement("div");
        h.className = "nm-head";
        h.textContent = title;
        menu.appendChild(h);
      }
      /* 順路の中＝左の縦一覧と同じ順番・同じ番号で組み立てる（先頭のトップページも同じ） */
      head("進め方の順路");
      var ir = iriguchi();
      if (ir) {
        var airi = document.createElement("a");
        airi.href = iriguchiHref(ir.id);
        airi.className = "nm-step";
        airi.innerHTML = "<span class='nm-num'>↩</span><span class='nm-label'>" + ir.label + "</span>";
        menu.appendChild(airi);
      }
      /* この版はトップを置かない。上のナビも段1から始まる */
      route.forEach(function (id, i) {
        var step = STEPS[id];
        var pages = step.pages || [step.page];
        var st = stateOf(id);
        var a = document.createElement("a");
        a.href = hrefOf(id);
        a.className = "nm-step" + (pages.indexOf(PAGE) > -1 ? " active" : "");
        var mark = (st === "done") ? "✓" : String(i + 1);
        a.innerHTML = "<span class='nm-num" + (st === "done" ? " done" : "") + "'>" + mark + "</span>" +
          "<span class='nm-label'>" + step.title +
          (isRequired(id) ? "" : "<span class='nm-opt'>任意</span>") + "</span>";
        menu.appendChild(a);
        /* 1つの段が2ページで1組の所（収支と資金繰りなど）は、中のページも1行ずつ出す。
           左の縦一覧に出ていて、この一覧に出てこないページがあると探せなくなるため */
        if (pages.length > 1) {
          pages.forEach(function (pg) {
            /* 段の見出し行が、その段の代表ページを指している。同じ行き先を2回並べない */
            if (pg === step.page) return;
            var sa = document.createElement("a");
            sa.href = relRoot() + pg + ".html";
            sa.className = "nm-sub" + (pg === PAGE ? " active" : "");
            sa.textContent = pageLabel(pg);
            menu.appendChild(sa);
          });
        }
      });
      if (rest.length) {
        head("必要なときに使うページ");
        rest.forEach(function (a) { a.textContent = a.dataset.baseLabel; menu.appendChild(a); });
      }

      /* 上のナビに出ないページ（core.js の TOOLS で hidden にしてあるもの）も、
         ここからは開けるようにする。順路にも上のナビにも出ないと、
         見取り図を経由しないと辿り着けなくなる（2026-08-16に実測） */
      var hoka = [];
      ((window.CORE && CORE.TOOLS) || []).forEach(function (t) {
        if (!t.hidden) return;
        var pg = String(t.href || "").split("/").pop().replace(".html", "");
        if (!pg || routePages.indexOf(pg + ".html") > -1) return;
        for (var k = 0; k < rest.length; k++) {
          if ((rest[k].getAttribute("href") || "").indexOf(pg + ".html") > -1) return;
        }
        hoka.push({ pg: pg, label: t.label || pageLabel(pg) });
      });
      if (hoka.length) {
        head("そのほかの道具");
        hoka.forEach(function (x) {
          var a = document.createElement("a");
          a.href = relRoot() + x.pg + ".html";
          a.className = "nm-sub" + (x.pg === PAGE ? " active" : "");
          a.textContent = x.label;
          menu.appendChild(a);
        });
      }

      var g = document.createElement("a");
      g.href = (location.pathname.indexOf("/tools/") > -1 ? "../" : "") + "guide.html";
      g.className = "nm-guide";
      g.textContent = "全体の見取り図を見る";
      menu.appendChild(g);

      det.appendChild(menu);
      nav.appendChild(det);
      if (!window.__mfkNavMoreClose) {
        window.__mfkNavMoreClose = true;
        document.addEventListener("click", function (ev) {
          document.querySelectorAll(".nav-more[open]").forEach(function (d) {
            if (!d.contains(ev.target)) d.open = false;
          });
        });
      }
    } catch (e) {}
  }

  /* ---------- ここでやることカード ----------
     いま取り組むステップのページ＝任務カード／完了済みステップのページ＝「次へ」カード */
  function renderCard() {
    if (!route) return;
    var old = document.getElementById("jnyCard");
    if (old) old.remove();
    var cur = currentId();
    var id = null;
    if (cur) {
      var curStep = STEPS[cur];
      if ((curStep.pages || [curStep.page]).indexOf(PAGE) > -1) id = cur;
    }
    if (!id) {
      for (var i = 0; i < route.length; i++) {
        var s = STEPS[route[i]];
        if ((s.pages || [s.page]).indexOf(PAGE) > -1 && stateOf(route[i]) === "done") { id = route[i]; break; }
      }
    }
    if (!id) {
      /* 順路の中の段だが、いま取り組む段ではないページ（先の段を先に開いた場合など）。
         ここを「順路の外」と同じ扱いにしていたため、左の一覧では順路の5番目にいるのに
         本文には「順路の外」と出る食い違いが起きていた（2026-08-04に画面で発見して修正） */
      var sid = stepOfPage();
      if (sid) renderAheadCard(sid); else renderOffCard();
      return;
    }
    var step = STEPS[id];
    var isDone = stateOf(id) === "done";
    var host = document.querySelector("main") || document.body;
    var anchor = host.querySelector("h1");
    var card = document.createElement("div");
    card.className = "jny-card no-print";
    card.id = "jnyCard";
    card.setAttribute("data-step", id);
    var body = isDone
      ? "<div><b class='jt'>✓ 「" + step.title + "」は完了しています</b>" +
        (evidOf(id) ? "　<span class='small' style='opacity:.8'>" + evidOf(id) + "</span>" : "") + "</div>"
      : "<div><b class='jt'>いまやること：" + step.title + "</b>　<span class='small' style='opacity:.75'>（" + (isRequired(id) ? "必須" : "任意") + "・目安" + step.min + "）</span></div>" +
        "<div style='margin-top:6px;line-height:1.65'>" + step.mission + "</div>" +
        "<div class='small' style='margin-top:6px;opacity:.8'>これをやると：" + step.benefit + "</div>";
    card.innerHTML = body + "<div id='jnyNextWrap'></div>";
    if (anchor) anchor.insertAdjacentElement("afterend", card);
    else host.insertAdjacentElement("afterbegin", card);
    renderNext();
  }
  /* 順路の外のページ用の見出し下の一言。
     何のページを開いていて、順路のどこへ戻ればよいかを本文側にも出す
     （左の一覧を見ない人・狭い画面で一覧を畳んでいる人のため） */
  function renderOffCard() {
    if (!route || PAGE === "index") return;
    var host = document.querySelector("main") || document.body;
    var anchor = host.querySelector("h1");
    if (!anchor) return;
    var backId = currentId() || route[route.length - 1];
    var card = document.createElement("div");
    card.className = "jny-card no-print";
    card.id = "jnyCard";
    card.innerHTML =
      "<div><b class='jt'>ここは「" + pageLabel(PAGE) + "」です（進め方の順路の外）</b></div>" +
      "<div class='small' style='margin-top:5px;line-height:1.75'>必要なときに使う道具のページです。" +
      "使い終わったら、順路の続きに戻れます。</div>" +
      (backId ? "<a class='jny-next' href='" + hrefOf(backId) + "'>順路に戻る：" + STEPS[backId].title + " →</a>" : "");
    anchor.insertAdjacentElement("afterend", card);
  }

  /* 順路の中の段で、いま取り組む段ではないページの見出し下の一言 */
  function renderAheadCard(sid) {
    var host = document.querySelector("main") || document.body;
    var anchor = host.querySelector("h1");
    if (!anchor) return;
    var step = STEPS[sid];
    var no = route.indexOf(sid) + 1;
    var cur = currentId();
    var card = document.createElement("div");
    card.className = "jny-card no-print";
    card.id = "jnyCard";
    card.setAttribute("data-step", sid);
    card.innerHTML =
      "<div><b class='jt'>ここは進め方の" + no + "番目「" + step.title + "」です</b>" +
      "<span class='small' style='opacity:.75'>　（" + (isRequired(sid) ? "必須" : "任意") + "・目安" + step.min + "）</span></div>" +
      "<div style='margin-top:6px;line-height:1.65'>" + step.mission + "</div>" +
      "<div class='small' style='margin-top:6px;opacity:.8'>これをやると：" + step.benefit + "</div>" +
      (cur && cur !== sid
        ? "<div class='small' style='margin-top:8px'>順番どおりに進めるなら、先に" +
          "<a href='" + hrefOf(cur) + "'>" + STEPS[cur].title + "</a>から。この段を先にやっても構いません。</div>"
        : "");
    anchor.insertAdjacentElement("afterend", card);
  }

  function nextAfter(id) {
    var idx = route.indexOf(id);
    for (var i = idx + 1; i < route.length; i++) if (stateOf(route[i]) === "todo") return route[i];
    var cur = currentId();
    return (cur && cur !== id) ? cur : null;
  }
  function renderNext() {
    if (!route) return;
    var wrap = document.getElementById("jnyNextWrap");
    var card = document.getElementById("jnyCard");
    if (!wrap || !card) return;
    var id = card.getAttribute("data-step");
    if (!id) return;
    var step = STEPS[id];
    var nid = nextAfter(id);
    var st = stateOf(id);
    var h = "";
    if (st === "done") {
      h = nid
        ? "<a class='jny-next' href='" + hrefOf(nid) + "'>次へ進む：" + STEPS[nid].title + " →</a>"
        : "<a class='jny-next' href='" + relRoot() + "keikaku.html'>仕上げ：計画書を読み合わせる →</a>";
    } else {
      h = "<span class='jny-next off'>このページで保存すると、進行表が「完了」に変わります</span>";
      if (step.skippable && nid) {
        h += "<span class='jny-skip' id='jnySkip'>県の値のまま次へ進む（あとで自分の値に直せます）</span>";
      }
    }
    wrap.innerHTML = h;
    var sk = document.getElementById("jnySkip");
    if (sk) sk.addEventListener("click", function () {
      META.kari[id] = true;
      store.save("journey", META);
      var nid2 = nextAfter(id);
      if (nid2) location.href = hrefOf(nid2);
    });
  }

  /* ---------- ページ下部の「完了にして次へ」 ----------
     保存の差分だけに頼らず、内容を確かめただけでも本人の操作で完了にして先へ進める */
  function renderBottom() {
    if (!route) return;
    var old = document.getElementById("jnyBottom");
    if (old) old.remove();
    var id = stepOfPage();
    if (!id) return;
    var step = STEPS[id];
    var st = stateOf(id);
    var nid = nextAfter(id);
    var host = document.querySelector("main") || document.body;
    var bar = document.createElement("div");
    bar.className = "jny-bottom no-print";
    bar.id = "jnyBottom";

    /* ---------- 進む道は必ず1本にする（NM指摘 2026-08-04「2こ進む道がある」） ----------
       1つの段が2ページで1組の所（収支と資金繰り＝シミュレーターと資金繰りカレンダー）では、
       ページ側の「次に◯◯へ進む」と、この帯の「次の段へ進む」が並んで2本の道に見えていた。
       まだ見ていない相方のページがあるうちは、そちらだけを大きく出し、
       次の段へは小さい文字で添えるだけにする。 */
    var pages = step.pages || [step.page];
    var visited = store.load("visited", {}) || {};
    var pending = pages.filter(function (pg) { return pg !== PAGE && !visited[pg]; });
    if (pending.length) {
      var og = pending[0];
      var oname = (window.CORE && CORE.STEP_LABELS && CORE.STEP_LABELS[og]) || og;
      bar.innerHTML =
        "<div><b class='jt'>「" + step.title + "」は、このページと「" + oname + "」の2つで1組です</b>" +
        "<div class='small' style='margin-top:2px;color:var(--ink-3)'>先に" + oname + "を見てから、次へ進んでください。</div></div>" +
        "<a class='jny-next' style='margin:0 0 0 auto' href='" + relRoot() + og + ".html'>" + oname + "を見る →</a>" +
        (nid ? "<a class='jny-skip' style='margin:0' href='" + hrefOf(nid) + "'>飛ばして「" + STEPS[nid].title + "」へ</a>" : "");
      host.appendChild(bar);
      return;
    }

    if (st === "done") {
      bar.innerHTML =
        "<div><b style='color:#1f6f52'>✓ 「" + step.title + "」は完了しています</b>" +
        (evidOf(id) ? "　<span class='small' style='opacity:.75'>" + evidOf(id) + "</span>" : "") + "</div>" +
        (nid
          ? "<a class='jny-next' style='margin:0 0 0 auto' href='" + hrefOf(nid) + "'>次へ進む：" + STEPS[nid].title + " →</a>"
          : "<a class='jny-next' style='margin:0 0 0 auto' href='" + relRoot() + "keikaku.html'>仕上げ：計画書を読み合わせる →</a>");
    } else {
      var label = (id === "hinmoku") ? "県の値のまま完了にして次へ" : "完了にして次へ";
      bar.innerHTML =
        "<div><b style='color:#1f6f52'>ここまで確かめたら、完了にして進めます</b>" +
        "<div class='small' style='opacity:.75;margin-top:2px'>保存をしていなくても、内容をひと通り見たらこのボタンで先へ進めます。</div></div>" +
        "<a class='jny-next' style='margin:0 0 0 auto;cursor:pointer' id='jnyManual'>" + label +
        (nid ? "：" + STEPS[nid].title : "") + " →</a>";
    }
    host.appendChild(bar);
    var mb = document.getElementById("jnyManual");
    if (mb) mb.addEventListener("click", function () {
      if (!META.manual) META.manual = {};
      if (!META.kari) META.kari = {};
      if (id === "jibun" && !STEPS.jibun.done()) META.kari[id] = true;
      else META.manual[id] = true;
      store.save("journey", META);
      var n2 = nextAfter(id);
      location.href = n2 ? hrefOf(n2) : relRoot() + "keikaku.html";
    });
  }

  /* 消える通知（トースト）は廃止した（指摘11: しばらくすると消えて混乱するため）。
     完了の伝達は、消えない「次の一歩」枠・下部バー・進行帯の✓で行う。 */

  /* ---------- トップページのカード ---------- */
  function renderIndexCard() {
    if (PAGE !== "index" || !route) return;
    var pv = document.getElementById("personaView");
    if (!pv) return;
    var old = document.getElementById("jnyIndex");
    if (old) old.remove();
    /* 順路そのものは左の一覧が受け持つ。ここに同じ並びを繰り返すと二重表示になるため
       （NM指摘 2026-07-31）、ここは「このページは何をする場所か」と「次にどこへ行くか」だけを書く。
       段の数と次の行き先は左の一覧と同じ出どころ（route）から作る。 */
    var cur = currentId();
    var doneN = 0;
    route.forEach(function (id) { if (stateOf(id) === "done") doneN++; });
    var firstId = route[0];
    var cta = cur
      ? "<a class='jny-next' href='tools/" + STEPS[cur].page + ".html'>" +
        (doneN ? "つづきから：" : "はじめる：") + STEPS[cur].title + " →</a>"
      : "<a class='jny-next' href='tools/keikaku.html'>仕上げ：計画書を読み合わせる →</a>";
    var card = document.createElement("div");
    card.className = "jny-card no-print";
    card.id = "jnyIndex";
    card.innerHTML =
      "<div><b class='jt'>このページは、進め方を決める場所です</b></div>" +
      "<div class='small' style='margin-top:6px;line-height:1.75'>ここで立場と目標を決めると、" +
        "全" + route.length + "段の順路が決まります。順路は左の一覧（画面が狭いときは上の1行）に出ていて、" +
        "どのページを開いても同じ場所に同じ順で出ます。いまは" + doneN + " / " + route.length + "段が完了です。" +
        "最初の段は「" + STEPS[firstId].title + "」です。</div>" +
      "<div class='small' style='margin-top:4px;opacity:.85'>ゴールは、県の数字を出発点に、自分の数字で事業計画を作ることです。作った計画書は窓口相談にそのまま持参できます（正式な申込みは各機関の様式に転記します）。</div>" +
      "<div>" + cta + "</div>" +
      "<div class='small' style='margin-top:8px;opacity:.8'>共有パソコンで前の人の記録が残っている場合は、" +
      "<a href='#' id='jnyWipe' style='color:#c02f2f;'>入力データをすべて消す</a>（確認画面が出ます）を押してから始めてください。</div>";
    pv.insertAdjacentElement("afterbegin", card);
    var wl = card.querySelector("#jnyWipe");
    if (wl) wl.addEventListener("click", function (ev) { ev.preventDefault(); if (CORE.wipeAll) CORE.wipeAll(); });
    renderPathDetail();
  }

  /* ---------- トップページ：段ごとに何をするかを出す（2026-08-04） ----------
     NM指摘「表紙と各ステップが、わかるようなわからないような、いまいちピンと来ない」。
     左の一覧は段の名前だけなので、名前を見ても中身が想像できなかった。
     トップページでは、左の一覧と同じ番号・同じ名前で「ここでやること／これをやると」を開いて出す。
     立場ごとの説明文（packs.js の path）は段と数が合わず食い違いのもとだったので、
     段の定義（STEPS）から作る。 */
  function renderPathDetail() {
    var ol = document.getElementById("pvPath");
    if (!ol || !route) return;
    ol.innerHTML = route.map(function (id, i) {
      var s = STEPS[id];
      var st = stateOf(id);
      return "<li>" +
        "<b>" + (i + 1) + "　" + s.title + "</b>" +
        "<span class='small muted' style='margin-left:8px'>" +
          (isRequired(id) ? "必須" : "任意") + "・目安" + s.min +
          (st === "done" ? "・完了" : "") + "</span>" +
        "<div class='small' style='margin-top:3px;line-height:1.75'>" + s.mission + "</div>" +
        "<div class='small' style='margin-top:2px;color:var(--ink-3)'>これをやると：" + s.benefit + "</div>" +
        "</li>";
    }).join("");
    var fold = document.getElementById("foldPath");
    if (fold) {
      var sm = fold.querySelector("summary");
      if (sm) sm.childNodes[0].textContent = "この順路（全" + route.length + "段）で、それぞれ何をするか";
      if (!fold.dataset.mfkOpened) { fold.open = true; fold.dataset.mfkOpened = "1"; }
    }
  }

  /* ---------- 再評価の配線 ---------- */
  var deb = null;
  function reEval() {
    clearTimeout(deb);
    deb = setTimeout(function () {
      var personaChanged = syncPersona();
      renderBand();
      if (personaChanged) renderCard(); else renderNext();
      renderBottom();
      renderIndexCard();
    }, 400);
  }
  function init() {
    renderBand();
    renderCard();
    renderBottom();
    renderIndexCard();
    document.addEventListener("click", reEval, true);
    document.addEventListener("change", reEval, true);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();

  window.MFK_JOURNEY = { reEval: reEval };
})();
