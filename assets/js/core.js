/* ============================================================
   マイファーム農業経営コンパス — 共通コア
   ・農場プロフィール（全ツール共有・localStorage）
   ・数値書式
   ・共通ナビゲーション描画
   ============================================================ */
(function () {
  "use strict";

  /* AIC版は既存版（agri-compass-edu）と同じホストで公開されるため localStorage を共有する。
     試作版の不具合で運用中の受講生データを壊さないよう、保存の名前空間を分ける（2026-08-04） */
  const NS = "myfarm-agri-compass-pro";

  /* ---------- 保存 ---------- */
  const store = {
    load(key, fallback) {
      try {
        const raw = localStorage.getItem(NS + ":" + key);
        return raw ? JSON.parse(raw) : (fallback ?? null);
      } catch (e) { return fallback ?? null; }
    },
    save(key, value) {
      try {
        localStorage.setItem(NS + ":" + key, JSON.stringify(value));
        /* 入力データの保存があったら、ヘッダーの保存表示を更新する（操作ログ等の裏方キーは除く） */
        try {
          if (window.__mfkStamp && ["oplog", "oplogSent", "did", "journey", "journeySideClosed", "visited"].indexOf(key) === -1) window.__mfkStamp();
        } catch (e2) {}
        return true;
      }
      catch (e) { return false; }
    },
    remove(key) { try { localStorage.removeItem(NS + ":" + key); } catch (e) {} },
  };

  /* ---------- 匿名の端末ID ----------
     氏名ではなくランダムな文字列。あとから「どの端末が・いつ・何を操作したか」を
     事務局が追えるようにするためだけに使う。データ消去で消え、次回は別IDになる。 */
  let DID = store.load("did", null);
  if (!DID) {
    DID = Math.random().toString(16).slice(2, 10) + Math.random().toString(16).slice(2, 6);
    store.save("did", DID);
  }

  /* ---------- 操作ログ（この端末内だけ。書き出しは手動） ---------- */
  const PAGE_ID = (location.pathname.split("/").pop() || "index.html").replace(".html", "") || "index";
  const OPLOG_MAX = 3000;
  function opLog(ev, label, val) {
    try {
      const log = store.load("oplog", []) || [];
      log.push({
        t: new Date().toISOString(),
        s: store.load("mfkPersona", "") || "",
        p: PAGE_ID,
        e: ev,
        l: (label == null ? "" : String(label)).trim().replace(/\s+/g, " ").slice(0, 60),
        v: (val == null ? "" : String(val)).slice(0, 80)
      });
      if (log.length > OPLOG_MAX) log.splice(0, log.length - OPLOG_MAX);
      store.save("oplog", log);
    } catch (e) { /* ログ失敗でツールは止めない */ }
  }
  function exportLog() {
    try {
      const log = store.load("oplog", []) || [];
      const site = store.load("mfkPersona", "") || "common";
      const d = new Date();
      function pad(n) { return (n < 10 ? "0" : "") + n; }
      const payload = { site: site, exported: d.toISOString(), count: log.length, log: log };
      const blob = new Blob([JSON.stringify(payload, null, 1)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "操作ログ_" + site + "_" + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + ".json";
      document.body.appendChild(a); a.click(); a.remove();
      opLog("export", "操作ログ書き出し", String(log.length));
      return log.length;
    } catch (e) { alert("書き出しに失敗しました。"); return -1; }
  }
  document.addEventListener("click", function (ev) {
    const el = ev.target && ev.target.closest ? ev.target.closest("button, a, summary, [role=button]") : null;
    if (!el) return;
    const label = (el.textContent || el.getAttribute("aria-label") || el.id || el.tagName || "").trim().replace(/\s+/g, " ").slice(0, 60);
    opLog("click", label, el.id || "");
  }, true);
  document.addEventListener("change", function (ev) {
    const el = ev.target;
    if (!el || !/^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName)) return;
    let label = el.id || el.name || "";
    const f = el.closest ? el.closest(".field") : null;
    const lb = f ? f.querySelector("label") : null;
    if (lb && lb.textContent) label = lb.textContent.trim();
    /* 入力した値そのものは記録・送信しない（2026-07-19改定）。
       氏名・住所・経営数値などが操作ログに乗る経路を塞ぐため、
       「どの項目を操作したか」（項目名）だけを残す。 */
    opLog("input", label, "");
  }, true);
  /* 操作の記録の送り先。
     現役農家版はまだ自分の送り先を持たないため、外へは送らない（null）。
     AIC版の送り先へ送ると、別の版の記録が混ざって数えられなくなるため。
     送り先ができたらここに入れる。記録そのものは端末に残り、下の「書き出す」で取り出せる。 */
  const LOG_ENDPOINT = null;
  function sendLogs(useBeacon) {
    try {
      const log = store.load("oplog", []) || [];
      let sent = store.load("oplogSent", 0) || 0;
      if (sent > log.length) sent = 0;
      const batch = log.slice(sent);
      if (!batch.length) return;
      if (!LOG_ENDPOINT) return;   // 送り先が無いときは何もしない
      const payload = JSON.stringify({
        did: DID,
        persona: store.load("mfkPersona", "") || "",
        region: store.load("mfkRegion", "") || "",
        page: PAGE_ID, count: batch.length, log: batch
      });
      if (useBeacon && navigator.sendBeacon) {
        if (navigator.sendBeacon(LOG_ENDPOINT, payload)) store.save("oplogSent", log.length);
      } else {
        fetch(LOG_ENDPOINT, { method: "POST", headers: { "Content-Type": "text/plain" }, body: payload, keepalive: true })
          .then(function (r) { if (r && r.ok) store.save("oplogSent", log.length); })
          .catch(function () { /* 通信できない環境でも何もしない */ });
      }
    } catch (e) {}
  }
  setInterval(function () { sendLogs(false); }, 60000);
  window.addEventListener("pagehide", function () { sendLogs(true); });
  /* ---------- 立場（ペルソナ）設定・コマモード・事例プリセット（教育版） ---------- */
  const _qs = new URLSearchParams(location.search);
  const OLD_SITE_MAP = { aic: "kentou", tanba: "junbi", minamisoma: "koyou", fukuoka: "hatten", okinawa: "hatten", nodai: "shidou" };
  if (_qs.get("site")) {
    const mapped = OLD_SITE_MAP[_qs.get("site")];
    if (mapped) store.save("mfkPersona", mapped);
    if (_qs.get("site") === "okinawa") store.save("mfkRegion", "okinawa");
  }
  /* 学校の入口（農の学校・みらい農業学校・AIC）から来た人は、そこが自分の出発点になる。
     どの入口から来たかを覚えておき、道具ページの一覧から入口へ戻れるようにする
     （NM指示 2026-08-04。それまでは入口に戻る道が無く、配られたURLを開き直すしかなかった） */
  const IRIGUCHI_NAMES = { nogakko: "農の学校の入口", mirai: "みらい農業学校の入口", aic: "AICの入口" };
  if (_qs.get("s") && IRIGUCHI_NAMES[_qs.get("s")]) store.save("iriguchi", _qs.get("s"));
  const IRIGUCHI_ID = store.load("iriguchi", "") || "";
  const IRIGUCHI = IRIGUCHI_ID && IRIGUCHI_NAMES[IRIGUCHI_ID]
    ? { id: IRIGUCHI_ID, label: IRIGUCHI_NAMES[IRIGUCHI_ID] } : null;
  if (_qs.get("p")) store.save("mfkPersona", _qs.get("p"));
  if (_qs.get("r")) store.save("mfkRegion", _qs.get("r"));
  const PERSONA_ID = store.load("mfkPersona", null);
  const PERSONA = (typeof window !== "undefined" && window.MFK_PERSONAS && PERSONA_ID && window.MFK_PERSONAS[PERSONA_ID]) || null;
  const REGION = store.load("mfkRegion", null);
  const KOMA = (_qs.get("koma") || "").split(",").filter(Boolean);
  (function applyPreset() {
    const pref = _qs.get("preset");
    if (!pref || !window.MFK_PERSONAS) return;
    try {
      let ppersona = PERSONA_ID, pid = pref;
      if (pref.indexOf(":") > -1) { ppersona = pref.split(":")[0]; pid = pref.split(":")[1]; }
      let pdef = null;
      const pdefs = window.MFK_PERSONAS || {};
      const own = pdefs[ppersona];
      if (own) pdef = (own.presets || []).filter(function (p) { return p.id === pid; })[0] || null;
      if (!pdef) {
        Object.keys(pdefs).forEach(function (k) {
          if (pdef || k.charAt(0) === "_") return;
          pdef = ((pdefs[k] || {}).presets || []).filter(function (p) { return p.id === pid; })[0] || null;
        });
      }
      if (!pdef) return;
      /* 共有端末対策: 既に保存がある場合は、演習例で上書きしてよいか確認する */
      if ((pdef.cropCustom && store.load("cropCustom", null)) || (pdef.simPlan && store.load("simPlan", null))) {
        if (!confirm("演習例を読み込むと、この端末に保存されている品目の変更や計画を上書きします。続けてよいですか？")) return;
      }
      if (pdef.profile) store.save("profile", Object.assign({}, store.load("profile", {}) || {}, pdef.profile));
      if (pdef.cropCustom) store.save("cropCustom", pdef.cropCustom);
      if (pdef.simPlan) store.save("simPlan", pdef.simPlan);
      opLog("preset", pdef.label || pid, ppersona || "");
    } catch (e) { /* プリセット適用に失敗しても既定値で動く */ }
  })();
  opLog("view", document.title, location.search);

  /* ---------- 見たページの記録（2026-08-04） ----------
     1つの段が2ページで1組になっている所（収支と資金繰り＝シミュレーターと資金繰りカレンダー）で、
     まだ見ていない方だけを案内するために使う。進み方を1本にするための判定であり、
     進行の完了判定（journey.js）には使わない。 */
  (function () {
    try {
      const v = store.load("visited", {}) || {};
      if (!v[PAGE_ID]) { v[PAGE_ID] = new Date().toISOString(); store.save("visited", v); }
    } catch (e) {}
  })();

  /* ---------- 農場プロフィール（1回入力→全ツール共有） ---------- */
  const defaultProfile = {
    name: "",
    region: "本島南部",       // 本島北部/本島中部/本島南部/宮古/八重山/久米島/その他離島
    crops: [],                 // [{cropId, area10a}] 面積は10a単位
    laborFamily: 2,            // 家族労働力（人）
    laborHired: 0,             // 常時雇用（人）
    startYear: null,           // 就農年
    updatedAt: null,
  };
  function getProfile() {
    return Object.assign({}, defaultProfile, store.load("profile", {}));
  }
  function saveProfile(p) {
    p.updatedAt = new Date().toISOString();
    store.save("profile", p);
  }

  /* ---------- 書式 ---------- */
  const fmt = {
    // 円 → 「1,234万」/「1.2億」表示
    man(yen, opt) {
      if (yen == null || isNaN(yen)) return "―";
      const man = yen / 10000;
      const sign = man < 0 ? "-" : "";
      const a = Math.abs(man);
      if (a >= 10000) return sign + (a / 10000).toFixed(a / 10000 >= 100 ? 0 : 1) + "億";
      if (a >= 1000) return sign + Math.round(a).toLocaleString() + "万";
      if (a >= 100) return sign + Math.round(a).toLocaleString() + "万";
      if (a >= 10) return sign + (opt === "int" ? Math.round(a) : a.toFixed(1)) + "万";
      return sign + (opt === "int" ? Math.round(a) : a.toFixed(1)) + "万";
    },
    manUnit(yen) { return fmt.man(yen) + "円"; },
    yen(v) { return v == null || isNaN(v) ? "―" : Math.round(v).toLocaleString() + "円"; },
    num(v, d) { return v == null || isNaN(v) ? "―" : Number(v).toLocaleString(undefined, { maximumFractionDigits: d ?? 0, minimumFractionDigits: 0 }); },
    pct(v, d) { return v == null || isNaN(v) ? "―" : (v * 100).toFixed(d ?? 0) + "%"; },
    signMan(yen) { return (yen >= 0 ? "+" : "") + fmt.man(yen) + "円"; },
  };

  /* ---------- 数値カウントアップ演出 ---------- */
  function countUp(el, target, format, dur) {
    const d = dur || 700;
    const t0 = performance.now();
    const from = 0;
    function tick(t) {
      const p = Math.min(1, (t - t0) / d);
      const e = 1 - Math.pow(1 - p, 3);
      el.textContent = format(from + (target - from) * e);
      if (p < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  /* ---------- 共通トップバー ----------
     ページ名は進行帯のステップ名と同じ言葉に統一する（1ページ1名）。
     STEP_LABELS が正典で、帯・ナビ・誘導文の全部がここから引く。 */
  const STEP_LABELS = {
    hinmoku: "品目と単価",
    kiroku: "記録を入れる",
    checkup: "実績の診断",
    sakutsuke: "作付けの決定",
    simulator: "経営シミュレーター",
    shikin: "資金繰り",
    taifu: "災害への備え",
    keikaku: "計画書にまとめる",
    nozomi: "なりたい姿",
    teian: "計画の直しどころ",
    toushi: "投資・雇用",
    smart: "スマート農業申請",
    kibi: "さとうきび配分",
    hanro: "出荷先比較",
    gyakusan: "目標から逆算",
    konkyo: "数字の根拠しらべ",
  };
  /* 現役農家版の並び。入口は品目と単価（段1）。ホーム・経営力チェック・
     独立と雇用の比較・給与の手取り換算は、この版では置かない。 */
  const TOOLS = [
    { id: "hinmoku",   href: "tools/hinmoku.html",     label: STEP_LABELS.hinmoku },
    { id: "kiroku",    href: "tools/kiroku.html",      label: STEP_LABELS.kiroku },
    { id: "checkup",   href: "tools/checkup.html",     label: STEP_LABELS.checkup },
    { id: "sakutsuke", href: "tools/sakutsuke.html",   label: STEP_LABELS.sakutsuke },
    { id: "simulator", href: "tools/simulator.html",   label: STEP_LABELS.simulator },
    { id: "shikin",    href: "tools/shikin.html",      label: STEP_LABELS.shikin },
    { id: "taifu",     href: "tools/taifu.html",       label: STEP_LABELS.taifu },
    { id: "nozomi",    href: "tools/nozomi.html",      label: STEP_LABELS.nozomi },
    { id: "teian",     href: "tools/teian.html",       label: STEP_LABELS.teian },
    { id: "keikaku",   href: "tools/keikaku.html",     label: STEP_LABELS.keikaku },
    { id: "toushi",    href: "tools/toushi.html",      label: STEP_LABELS.toushi, hidden: true },
    { id: "smart",     href: "tools/smart.html",       label: STEP_LABELS.smart, hidden: true },
    { id: "kibi",      href: "tools/kibi.html",        label: STEP_LABELS.kibi, hidden: true },
    { id: "hanro",     href: "tools/hanro.html",       label: STEP_LABELS.hanro, hidden: true },
    { id: "gyakusan",  href: "tools/gyakusan.html",    label: STEP_LABELS.gyakusan, hidden: true },
    { id: "konkyo",    href: "tools/konkyo.html",      label: STEP_LABELS.konkyo, hidden: true },
  ];
  function renderTopbar(activeId, rel) {
    const r = rel || "";  // tools/ 配下からは "../"
    let _list = TOOLS.filter(t => !t.hidden || t.id === activeId);
    /* 現役農家版は対象が1つなので、立場でナビを絞らない。
       ?koma= の授業モードだけは、指定されたページに絞る作りを残す。 */
    if (false && PERSONA && PERSONA.tools) {
      let allow = PERSONA.tools.slice();
      _list = TOOLS.filter(t => (allow.indexOf(t.id) > -1 || t.id === activeId) && t.id !== "index");
    }
    if (KOMA.length) _list = _list.filter(t => KOMA.indexOf(t.id) > -1 || t.id === activeId);
    const nav = _list.map(t => {
      const href = r + t.href;
      return `<a href="${href}" class="${t.id === activeId ? "active" : ""}">${t.label}</a>`;
    }).join("");
    const el = document.createElement("header");
    el.className = "topbar no-print";
    el.innerHTML = `
      <div class="topbar-in">
        <a class="brand" href="${r}index.html">
          <img class="brand-logo" src="${r}assets/img/mf_logo.png" alt="マイファーム" width="32" height="32" style="width:32px;height:32px;flex:0 0 32px;border-radius:50%;">
          <span class="brand-name">農業経営コンパス<small>現役農家版</small></span>
        </a>
        <nav class="topbar-nav">${nav}</nav>
        <a class="ai-consult no-print" href="${r}tools/teian.html" title="いまの計画となりたい姿から、計画の直しどころをAIが出します">計画の直しどころ</a>
      </div>`;
    document.body.prepend(el);
  }

  /* ---------- スライダーの塗り更新 ---------- */
  function bindRange(input, onChange) {
    function paint() {
      const min = +input.min || 0, max = +input.max || 100;
      const p = ((+input.value - min) / (max - min)) * 100;
      input.style.setProperty("--fill", p + "%");
    }
    input.addEventListener("input", () => { paint(); if (onChange) onChange(+input.value); });
    paint();
  }

  /* ---------- セグメント切替 ---------- */
  function bindSeg(segEl, onChange) {
    segEl.querySelectorAll("button").forEach(btn => {
      btn.addEventListener("click", () => {
        segEl.querySelectorAll("button").forEach(b => b.classList.remove("on"));
        btn.classList.add("on");
        if (onChange) onChange(btn.dataset.v);
      });
    });
  }

  /* ---------- 入場アニメーションの保険 ----------
     環境によってCSSアニメーションが開始されず opacity:0 のまま
     固まることがあるため、1.2秒後に全要素を強制的に表示状態へ倒す */
  setTimeout(function () {
    document.querySelectorAll(".fade-up").forEach(function (el) {
      el.style.animation = "none";
      el.style.opacity = "1";
      el.style.transform = "none";
    });
  }, 1200);

  /* ---------- 利用者が実際に触ったかどうか ----------
     開いただけで自動保存が走り、進行表が「完了」になる誤判定を防ぐための共通判定。
     信頼できる実操作（クリック・キー入力）があって初めて true になる。 */
  let USER_ACTED = false;
  ["pointerdown", "keydown"].forEach(function (evName) {
    document.addEventListener(evName, function (e) { if (e.isTrusted) USER_ACTED = true; }, true);
  });
  function userActed() { return USER_ACTED; }

  /* ---------- フルバージョン切替（詳細機能の段階開放の枠） ----------
     ?full=1 でこの端末に記録。data-full 属性を付けた節だけ表示される。 */
  if (_qs.get("full") === "1") store.save("mfkFullMode", true);
  if (_qs.get("full") === "0") store.remove("mfkFullMode");
  const FULL_MODE = !!store.load("mfkFullMode", false);
  if (FULL_MODE) document.documentElement.classList.add("fullmode");

  /* ---------- ヘッダーの保存表示（保存ボタンが無い不安への回答） ---------- */
  function initSaveStamp() {
    try {
      const bar = document.querySelector(".topbar-in");
      if (!bar) return;
      const el = document.createElement("span");
      el.id = "saveStamp";
      el.className = "no-print";
      el.title = "保存ボタンはありません。入力するたびに自動でこの端末（ブラウザ）に保存されます。";
      el.style.cssText = "margin-left:10px;font-size:11px;color:var(--ink-3);white-space:nowrap;flex-shrink:0;";
      el.textContent = "";
      bar.appendChild(el);
      window.__mfkStamp = function () {
        try {
          const d = new Date();
          function pad(n) { return (n < 10 ? "0" : "") + n; }
          el.textContent = "✓ この端末に保存済み " + pad(d.getHours()) + ":" + pad(d.getMinutes());
        } catch (e) {}
      };
    } catch (e) {}
  }

  /* ---------- 出所バッジ（この数字はどこから来たか＋直しに行くリンク） ----------
     sourceBadge(挿入先要素, 説明文, [{label, href}]) */
  function sourceBadge(hostEl, text, links) {
    try {
      if (!hostEl) return null;
      const b = document.createElement("div");
      b.className = "src-badge no-print";
      b.style.cssText = "display:inline-flex;flex-wrap:wrap;gap:8px;align-items:center;font-size:11.5px;color:var(--accent-deep);background:var(--accent-softer);border:1px solid var(--accent-line);border-radius:999px;padding:6px 13px;margin:6px 0;line-height:1.7;";
      const t = document.createElement("span");
      t.textContent = text;
      b.appendChild(t);
      (links || []).forEach(function (l) {
        const a = document.createElement("a");
        a.href = l.href;
        a.textContent = l.label;
        a.style.cssText = "color:var(--accent);font-weight:700;";
        b.appendChild(a);
      });
      hostEl.insertAdjacentElement("afterbegin", b);
      return b;
    } catch (e) { return null; }
  }

  /* ---------- 品目追加への誘導（一覧に無い品目で行き止まりにならないため） ----------
     cropAddLink(挿入先要素, 戻り先ページID) */
  function cropAddLink(hostEl, backId) {
    try {
      if (!hostEl) return null;
      const rel = location.pathname.indexOf("/tools/") > -1 ? "" : "tools/";
      const b = document.createElement("p");
      b.className = "small no-print";
      b.style.cssText = "margin:6px 0;color:var(--ink-3);";
      const a = document.createElement("a");
      a.href = rel + "hinmoku.html?back=" + (backId || "");
      a.textContent = "→ 品目を追加する";
      a.style.cssText = "color:var(--accent);font-weight:700;";
      b.appendChild(document.createTextNode("作りたい品目が一覧に無いときは、品目と単価のページで追加できます（追加した品目はすべてのページで使えます）。"));
      b.appendChild(a);
      hostEl.insertAdjacentElement("beforeend", b);
      return b;
    } catch (e) { return null; }
  }

  /* ---------- 保存・決定の直後に出す「次の一歩」 ----------
     nextHint(ボタン要素, [{label, href, page?, onclick?}], メッセージ)
     保存した事実（時刻つき）と行き先ボタンを、押したボタンのすぐ下に常設表示する。
     授業モード（?koma=）中は、授業で使うページへの行き先だけに絞る。 */
  function nextHint(anchorEl, links, msg) {
    try {
      if (!anchorEl) return null;
      var hid = "next-hint-" + (anchorEl.id || "btn");
      var old = document.getElementById(hid);
      if (old) old.remove();
      var box = document.createElement("div");
      box.id = hid;
      box.className = "next-hint no-print";
      var d = new Date();
      function pad(n) { return (n < 10 ? "0" : "") + n; }
      var msgEl = document.createElement("div");
      msgEl.className = "nh-msg";
      msgEl.textContent = "✓ " + (msg || "保存しました") + "（この端末に残ります・" + pad(d.getHours()) + ":" + pad(d.getMinutes()) + "）";
      box.appendChild(msgEl);
      (links || []).filter(function (l) {
        if (!KOMA.length || !l.page) return true;
        return KOMA.indexOf(l.page) > -1;
      }).forEach(function (l) {
        var b;
        if (l.onclick) {
          b = document.createElement("button");
          b.type = "button";
          b.addEventListener("click", l.onclick);
        } else {
          b = document.createElement("a");
          b.href = l.href;
        }
        b.className = "nh-btn";
        b.textContent = l.label;
        box.appendChild(b);
      });
      var row = (anchorEl.closest && anchorEl.closest(".flex")) || anchorEl;
      row.insertAdjacentElement("afterend", box);
      return box;
    } catch (e) { return null; }
  }

  /* ---------- 経営力チェックから来た人への帯。
       この版に経営力チェックは無いので、下の受け手は動かない（?from=check10 が来ないため）。
       授業用URLの互換のため、処理そのものは残してある ---------- */
  function renderFromCheck10() {
    try {
      if (PAGE_ID === "check10") return;
      if (_qs.get("from") !== "check10") return;
      var qn = parseInt(_qs.get("q"), 10);
      var qlist = window.MFK_CHECK10_QS || [];
      var qtext = (qn >= 1 && qlist[qn - 1]) ? qlist[qn - 1].q : "";
      var rel = location.pathname.indexOf("/tools/") > -1 ? "" : "tools/";
      var band = document.createElement("div");
      band.className = "fromq-band no-print";
      var back = document.createElement("a");
      back.href = rel + "check10.html";
      back.textContent = "チェックの結果に戻る";
      band.textContent = "経営力チェック" + (qn ? "の質問" + qn : "") + (qtext ? "「" + qtext + "」" : "") + "から来ました。ここで数字にできたら、チェックに戻って変化を確かめられます。　";
      band.appendChild(back);
      var main = document.querySelector("main") || document.body;
      var h1 = main.querySelector("h1");
      if (h1) h1.insertAdjacentElement("afterend", band);
      else main.insertAdjacentElement("afterbegin", band);
    } catch (e) {}
  }

  /* ---------- 印刷の先頭に出す手書き欄（画面には出ない） ---------- */
  function renderPrintHead() {
    try {
      var ph = document.createElement("div");
      ph.className = "print-head";
      var t = (document.title || "").split(/[|｜]/)[0].trim();
      var b = document.createElement("b");
      b.textContent = "マイファーム農業経営コンパス";
      ph.appendChild(b);
      ph.appendChild(document.createTextNode("　" + t));
      var f = document.createElement("div");
      f.className = "ph-fields";
      f.textContent = "作成日：　　　　　　　名前：　　　　　　　相談先：　　　　　　　";
      ph.appendChild(f);
      document.body.insertAdjacentElement("afterbegin", ph);
    } catch (e) {}
  }
  /* ---------- 旧URLで開いた人への移転案内（2026-07-19に正を myfarmbizn へ移転） ----------
     旧URLは端末内データが残っているため止めずに残す。新しい共有はすべて新URLで行う。 */
  function renderMovedNotice() {
    try {
      if (location.hostname !== "nami5573b.github.io") return;
      var bar = document.createElement("div");
      bar.id = "movedBar";
      bar.className = "no-print";
      bar.style.cssText = "background:var(--sand-soft);border-bottom:1px solid var(--sand-line);color:#6b5122;font-size:12.5px;padding:9px 16px;line-height:1.7;";
      var link = document.createElement("a");
      link.href = "https://myfarmbizn.github.io/agri-compass-edu/";
      link.textContent = "https://myfarmbizn.github.io/agri-compass-edu/";
      link.style.cssText = "color:#8a6414;font-weight:700;";
      bar.appendChild(document.createTextNode("このサイトの住所が変わりました。新しい住所は "));
      bar.appendChild(link);
      bar.appendChild(document.createTextNode(" です。今後の共有・しおり（ブックマーク）は新しい住所をお使いください。この端末に保存した入力データは、いま開いているこの住所側に残っています。"));
      document.body.insertAdjacentElement("afterbegin", bar);
    } catch (e) {}
  }
  /* ---------- ページ冒頭の説明カードを畳む（2026-08-04・AIC版） ----------
     どの道具ページも「できること／使う場面／他のページとのつながり」の3列カードで始まるため、
     最初の画面が説明で埋まり、肝心の入力まで毎回スクロールが要る状態だった。
     初めての人には要る説明なので消さずに畳み、見出しを押したときだけ開く。印刷時は開く。 */
  function foldIntro() {
    try {
      const main = document.querySelector("main");
      if (!main) return;
      const cards = main.querySelectorAll(".card");
      for (let i = 0; i < cards.length && i < 3; i++) {
        const c = cards[i];
        if (!c.textContent || c.textContent.indexOf("できること") === -1) continue;
        if (c.closest("details")) return;
        const det = document.createElement("details");
        det.className = "intro-fold";
        det.id = "introFold";
        const sum = document.createElement("summary");
        sum.textContent = "このページでできること・使う場面を読む";
        det.appendChild(sum);
        c.parentNode.insertBefore(det, c);
        det.appendChild(c);
        window.addEventListener("beforeprint", function () { det.open = true; });
        return;
      }
    } catch (e) {}
  }

  document.addEventListener("DOMContentLoaded", function () {
    /* 画面下に貼り付く結果パネルがあるページでは、最後の要素が隠れないよう下に余白を足す */
    if (document.querySelector(".sim-out")) document.body.classList.add("has-sim-out");
    foldIntro();
    renderMovedNotice();
    renderFromCheck10();
    renderPrintHead();
    initSaveStamp();
  });

  /* ---------- 共有パソコン対策：入力データの消去（授業終了時用） ---------- */
  function wipeAll() {
    if (!confirm("この端末に保存された入力データ（プロフィール・計画・品目の変更・操作ログ）をすべて消します。よろしいですか？\n操作ログが必要な場合は、先に「操作ログを書き出す」を押してください。")) return;
    try {
      const keys = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.indexOf(NS + ":") === 0 && k !== NS + ":mfkPersona" && k !== NS + ":mfkRegion" && k !== NS + ":theme") keys.push(k);
      }
      keys.forEach(function (k) { localStorage.removeItem(k); });
      opLog("wipe", "入力データの消去", String(keys.length));
      alert("消去しました（" + keys.length + "件）。");
      location.reload();
    } catch (e) { alert("消去に失敗しました。ブラウザの設定から履歴・サイトデータを削除してください。"); }
  }
  document.addEventListener("DOMContentLoaded", function () {
    const bar = document.createElement("div");
    bar.className = "wipe-bar no-print";
    const bstyle = "";
    const bl = document.createElement("button");
    bl.textContent = "操作ログを書き出す（授業の振り返り・改良用）";
    bl.addEventListener("click", exportLog);
    bar.appendChild(bl);
    const b = document.createElement("button");
    b.textContent = "この端末の入力データをすべて消す（共有パソコンでの授業終了時）";
    b.addEventListener("click", wipeAll);
    bar.appendChild(b);
    const note = document.createElement("div");
    note.textContent = "操作の記録（どのボタンを押したか・どの項目を操作したか）は、この端末の中にだけ残ります。外へは送っていません。入力した数値・文字そのもの（氏名・住所・経営の数字など）も、もちろん送っていません。記録は下の「書き出す」で取り出せます。";
    note.style.cssText = "font-size:11px;color:var(--ink-4);margin-top:10px;max-width:640px;margin-left:auto;margin-right:auto;line-height:1.75;";
    bar.appendChild(note);
    const op = document.createElement("div");
    op.innerHTML = '運営: <a href="https://myfarm.co.jp/" target="_blank" rel="noopener" style="color:inherit;">株式会社マイファーム</a>（お問い合わせは会社サイトの窓口から）';
    op.style.cssText = "font-size:11px;color:var(--ink-4);margin-top:6px;";
    bar.appendChild(op);
    document.body.appendChild(bar);
  });

  window.CORE = { store, IRIGUCHI, getProfile, saveProfile, fmt, countUp, renderTopbar, bindRange, bindSeg, nextHint, sourceBadge, cropAddLink, userActed, TOOLS, STEP_LABELS, FULL_MODE, PERSONA_ID, PERSONA, REGION, KOMA, wipeAll, opLog, exportLog, sendLogs };

  /* ---------- 道筋の層（journey.js）を全ページで読み込む ----------
     ページ側の改修なしで「いまどこ・ここで何を・次はどこ」を重ねる。詳細は journey.js 冒頭。
     パスは core.js 自身の場所から解決する（どの階層のページからでも壊れない） */
  try {
    var js = document.createElement("script");
    var self = document.currentScript && document.currentScript.src ? document.currentScript.src : null;
    js.src = self ? self.replace(/core\.js([?#].*)?$/, "journey.js")
                  : (location.pathname.indexOf("/tools/") > -1 ? "../" : "") + "assets/js/journey.js";
    document.head.appendChild(js);
  } catch (e) { /* 道筋が読めなくてもツールは動く */ }
})();
