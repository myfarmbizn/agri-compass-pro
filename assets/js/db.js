/* ============================================================
   サーバに預ける層。

   これまでコンパスは、入れた数字を端末のブラウザ（localStorage）にだけ置いていた。
   端末を替えると消えるうえ、当社には何も残らなかった。
   NM指示（2026-08-16）「端末にしか保存しないのは誤り。DBに保存してこちらで管理する。
   それがマイファームの知見になる」に沿って、ここでサーバへ預ける。

   作りの決まり。

     一 画面は1枚も直さない。
       CORE.store.save をここでくるむので、各ページはこれまでどおり保存を呼ぶだけでよい。

     二 端末の保存はやめない。
       サーバが落ちても、電波が無くても、農家の手元では動き続ける。
       端末が正本で、サーバは預かり先という関係にする。

     三 合言葉が無いときは、これまでとまったく同じに動く。
       登録なしで手応えを渡すところを崩さない。

     四 送るのはまとめて、少し待ってから。
       画面は入力のたびに保存するので、そのたびに送ると回数が増えすぎる。

     五 開いたときは、新しいほうを採る。
       端末とサーバの両方に中身があるときは、保存した時刻の新しいほうを残す。
       時刻が分からないときは端末を残す（手元の作業を消さないため）。
   ============================================================ */
(function () {
  "use strict";

  if (!window.CORE || !CORE.store) return;
  var store = CORE.store;

  /* 端末の側で、鍵ごとに「いつ保存したか」を持つ。サーバと比べるために要る */
  var TOKI_KAGI = "hozonToki";

  /* サーバの設定。URLは受け口の根（例 https://xxxx.execute-api.../）。合言葉は8文字 */
  var SETTEI_KAGI = "sabaSetting";

  /* 預ける鍵。サーバ側（api/src/compass.mjs の AZUKARU_KAGI）と同じものを並べる。
     ここに無い鍵は端末にだけ残る（操作の記録や、画面の一時的な状態） */
  var AZUKARU = [
    "profile", "cropCustom", "simPlan", "nozomi", "annual", "laborForce",
    "plan", "cashflow", "keikakuDraft", "konkyo", "taifuLocal", "insurance",
    "damageLog", "kiroku", "teian", "toushiMemo", "hanroLast", "kibiSettings",
    "sakutsukeDraft", "smartDraft", "gyakusan",
  ];

  function azukaruKagi(k) { return AZUKARU.indexOf(k) > -1; }

  /* ---------- 設定 ---------- */
  function settei() {
    var s = store.load(SETTEI_KAGI, null);
    if (!s || !s.url || !s.aikotoba) return null;
    return s;
  }
  function setteiWoKaku(url, aikotoba) {
    if (!url || !aikotoba) { store.remove(SETTEI_KAGI); shirase(); return false; }
    store.save(SETTEI_KAGI, {
      url: String(url).trim().replace(/\/+$/, ""),
      aikotoba: String(aikotoba).trim(),
    });
    shirase();
    /* つないだ直後に、いちど取り合わせる */
    hikiawaseru();
    return true;
  }
  function tsunagatteiru() { return !!settei(); }

  /* ---------- サーバを呼ぶ ---------- */
  function yobu(michi, opt) {
    var st = settei();
    if (!st) return Promise.reject(new Error("サーバの設定がありません"));
    opt = opt || {};
    var ctl = (typeof AbortController !== "undefined") ? new AbortController() : null;
    var toki = setTimeout(function () { if (ctl) ctl.abort(); }, opt.byou ? opt.byou * 1000 : 30000);
    return fetch(st.url + michi, {
      method: opt.method || "GET",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Aikotoba " + st.aikotoba,
      },
      body: opt.body ? JSON.stringify(opt.body) : undefined,
      signal: ctl ? ctl.signal : undefined,
    }).then(function (r) {
      clearTimeout(toki);
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok) {
          var e = new Error(j && j.message ? j.message : ("サーバが " + r.status + " を返しました"));
          e.status = r.status;
          throw e;
        }
        return j;
      });
    });
  }

  /* ---------- 保存した時刻を覚える ---------- */
  function tokiWoYomu() { return store.load(TOKI_KAGI, {}) || {}; }
  function tokiWoKaku(kagi) {
    var t = tokiWoYomu();
    t[kagi] = new Date().toISOString();
    store.save(TOKI_KAGI, t);
    return t[kagi];
  }

  /* ---------- 送る待ち行列 ----------
     入力のたびに送らず、少し待ってからまとめて送る */
  var matsu = {};
  var tokei = null;
  var MATSU_BYOU = 3;

  var jotai = { okutteiru: false, saigo: null, shippai: null, machi: 0 };

  function tsumu(kagi) {
    if (!azukaruKagi(kagi)) return;
    matsu[kagi] = true;
    jotai.machi = Object.keys(matsu).length;
    shirase();
    if (tokei) clearTimeout(tokei);
    tokei = setTimeout(okuru, MATSU_BYOU * 1000);
  }

  function okuru() {
    if (!tsunagatteiru()) { matsu = {}; jotai.machi = 0; shirase(); return Promise.resolve(); }
    var kagira = Object.keys(matsu);
    if (!kagira.length) return Promise.resolve();
    matsu = {};
    jotai.okutteiru = true;
    jotai.machi = 0;
    shirase();

    var toki = tokiWoYomu();
    var shigoto = kagira.map(function (k) {
      var nakami = store.load(k, null);
      if (nakami === null || nakami === undefined) return Promise.resolve();
      return yobu("/compass/hikae", {
        method: "POST",
        body: { kagi: k, nakami: nakami, hozonAt: toki[k] || null },
      });
    });

    return Promise.all(shigoto).then(function () {
      jotai.okutteiru = false;
      jotai.saigo = new Date();
      jotai.shippai = null;
      shirase();
    }).catch(function (e) {
      jotai.okutteiru = false;
      jotai.shippai = e.message;
      /* 送れなかった鍵は次の機会にもう一度送る */
      kagira.forEach(function (k) { matsu[k] = true; });
      jotai.machi = Object.keys(matsu).length;
      shirase();
    });
  }

  /* ---------- CORE.store をくるむ ---------- */
  var motoSave = store.save;
  var motoRemove = store.remove;

  store.save = function (kagi, atai) {
    var r = motoSave.call(store, kagi, atai);
    if (azukaruKagi(kagi)) {
      tokiWoKaku(kagi);
      tsumu(kagi);
    }
    return r;
  };

  store.remove = function (kagi) {
    var r = motoRemove.call(store, kagi);
    if (azukaruKagi(kagi)) {
      /* 消したことも預ける（空で上書きする）。
         サーバに古い中身が残ったままだと、別の端末で開いたときに戻ってしまう */
      tokiWoKaku(kagi);
      if (tsunagatteiru()) {
        yobu("/compass/hikae", { method: "POST", body: { kagi: kagi, nakami: null } })
          .catch(function () { /* 送れなくても端末では消えている */ });
      }
    }
    return r;
  };

  /* ページを離れるときに、待っているものを送り切る */
  window.addEventListener("pagehide", function () {
    if (Object.keys(matsu).length) okuru();
  });

  /* ---------- 開いたときに取り合わせる ---------- */
  var hikiawaseta = false;

  function hikiawaseru() {
    if (!tsunagatteiru()) return Promise.resolve({ tsunagatteinai: true });
    return yobu("/compass").then(function (r) {
      var azukari = (r && r.azukari) || {};
      var sabaToki = (r && r.koushin) || {};
      var toki = tokiWoYomu();
      var totta = [];
      var nokoshita = [];

      Object.keys(azukari).forEach(function (k) {
        if (!azukaruKagi(k)) return;
        var saba = azukari[k];
        if (saba === null || saba === undefined) return;
        var temoto = store.load(k, null);

        if (temoto === null || temoto === undefined) {
          motoSave.call(store, k, saba);      // 端末に無ければ、そのまま入れる
          toki[k] = sabaToki[k] || new Date().toISOString();
          totta.push(k);
          return;
        }
        /* 両方にあるときは、保存した時刻の新しいほうを残す。
           時刻が分からないときは端末を残す（手元の作業を消さないため） */
        var t1 = Date.parse(toki[k] || "");
        var t2 = Date.parse(sabaToki[k] || "");
        if (isFinite(t1) && isFinite(t2) && t2 > t1) {
          motoSave.call(store, k, saba);
          toki[k] = sabaToki[k];
          totta.push(k);
        } else {
          nokoshita.push(k);
          tsumu(k);                            // 端末のほうが新しいので、送り直す
        }
      });

      store.save(TOKI_KAGI, toki);
      hikiawaseta = true;
      jotai.saigo = new Date();
      shirase();

      /* サーバから中身を取ったときは、画面を1度だけ開き直す。
         画面は読み込みのときに保存を読んで描いてしまっているので、
         あとから入れても出てこない。各ページに描き直しの仕掛けを入れると
         18枚すべてに手を入れることになるため、ここで1度だけ開き直す。
         同じ回に何度も開き直さないよう、その回の印を置く */
      if (totta.length && typeof sessionStorage !== "undefined") {
        var shirushi = "mfkModoshita";
        if (!sessionStorage.getItem(shirushi)) {
          sessionStorage.setItem(shirushi, "1");
          location.reload();
        }
      }
      return { totta: totta, nokoshita: nokoshita };
    }).catch(function (e) {
      jotai.shippai = e.message;
      shirase();
      return { shippai: e.message };
    });
  }

  /* ---------- 上の帯に、いまの預かり具合を出す ----------
     見え方は変えない。もともとある「この端末に保存済み」の文字を書き替えるだけ */
  function shirase() {
    var el = document.querySelector(".saved-note, #savedNote, [data-saved-note]");
    if (!el) return;
    if (!tsunagatteiru()) {
      el.textContent = "✓ この端末に保存";
      el.title = "サーバには預けていません。記録の画面の設定で合言葉を入れると、預けられます";
      return;
    }
    if (jotai.shippai) {
      el.textContent = "！ 預けられていません";
      el.title = "端末には保存できています。サーバへ預けられませんでした：" + jotai.shippai;
      return;
    }
    if (jotai.okutteiru || jotai.machi) {
      el.textContent = "… 預けています";
      el.title = "サーバへ預けているところです";
      return;
    }
    el.textContent = "✓ サーバに預け済み";
    el.title = jotai.saigo ? ("最後に預けた時刻 " + jotai.saigo.toLocaleTimeString()) : "";
  }

  /* 帯はあとから描かれるので、少し待ってから1回、そのあと時々書き替える */
  setTimeout(shirase, 300);
  setInterval(shirase, 5000);

  /* 開いたら取り合わせる（合言葉が無ければ何もしない） */
  setTimeout(function () { if (!hikiawaseta) hikiawaseru(); }, 200);

  window.MFK_DB = {
    settei: settei,
    setteiWoKaku: setteiWoKaku,
    tsunagatteiru: tsunagatteiru,
    yobu: yobu,
    hikiawaseru: hikiawaseru,
    okuru: okuru,
    jotai: function () {
      return {
        tsunagatteiru: tsunagatteiru(),
        okutteiru: jotai.okutteiru,
        machi: jotai.machi,
        shippai: jotai.shippai,
        saigo: jotai.saigo,
      };
    },
    AZUKARU: AZUKARU.slice(),
  };
})();
