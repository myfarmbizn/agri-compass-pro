/* ============================================================
   WAGRI（農業データ連携基盤）を呼ぶ口。この1本だけがWAGRIを知っている。
   使うページ: tools/hinmoku.html（段1・圃場を選んで面積を取る）

   ⚠まだ一度も本物を呼んでいない。
   WAGRI運営事務局から届く利用者ID（クライアントID）とクライアントシークレットが
   手元に無いため、下の hontouWoYobu は書いてあるだけで、動かして確かめていない。
   鍵が空のあいだは、必ず見本の返しを返す（返りに dami: true が付く）。

   出どころ。
     「新WAGRI お試しサービス利用手順書」1.0版（2025年4月23日・WAGRI運営事務局）
     ・鍵の受け取り口   POST https://api.wagri2.net/Token
       本文は x-www-form-urlencoded で grant_type=client_credentials・client_id・client_secret
     ・鍵の持ち時間     1時間
     ・APIの呼び方      見出し X-Authorization に鍵を入れて GET する
       例 https://api.wagri2.net/basic/weather/jma/Forecast
     ・使えるAPIの一覧に「ID付与済み筆ポリゴン取得API v3」があり、
       その受け口の名は Get・GetDistance・GetArea・GetByLocalGovernmentCd の4つ

   （未確定）手順書に載っているのは受け口の名だけで、次の2つは載っていない。
     一 筆ポリゴンAPIの道（/basic/… の先の並び）
     二 返ってくる項目の名（筆ポリゴンのID・面積・市区町村コード・緯度経度の呼び名）
   どちらも、鍵と一緒に届く仕様ページを見て、この下の SETTEI の michi と kou を直す。
   直す場所はこの2か所だけで、画面側（tools/hinmoku.html）は触らなくてよい。
   ============================================================ */
(function () {
  "use strict";

  /* ---------- 決め。ここ1か所だけで持つ ----------
     riyousha と himitsu の両方が入ったときだけ、本物を呼びに行く。
     どちらかが空なら見本を返す。 */
  var SETTEI = window.MFK_WAGRI_SETTEI || {
    /* WAGRI運営事務局から別途送られてくる2つ。届いたらここに入れる */
    riyousha: "",
    himitsu: "",

    /* 鍵の受け取り口とAPIの根。手順書に載っている住所 */
    tokenUrl: "https://api.wagri2.net/Token",
    moto: "https://api.wagri2.net",

    /* （未確定）ID付与済み筆ポリゴン取得API v3 の道。仕様ページを見て直す。
       受け口の名は手順書のとおり4つある。ここでは市区町村コードで取る道と、
       いまいる場所からの距離で取る道の2本を使う */
    michi: {
      shikuchoson: "",   /* 例: /basic/… /GetByLocalGovernmentCd */
      kyori: "",         /* 例: /basic/… /GetDistance */
    },

    /* （未確定）返ってくる項目の名。仕様ページを見て左辺に合わせる */
    kou: {
      id: "",            /* 筆ポリゴンのID */
      menseki: "",       /* 面積（平方メートル） */
      shikuchoson: "",   /* 市区町村コード */
      ido: "",           /* 緯度 */
      keido: "",         /* 経度 */
    },
  };
  window.MFK_WAGRI_SETTEI = SETTEI;

  function tsukaeru() {
    return !!(String(SETTEI.riyousha || "").trim() && String(SETTEI.himitsu || "").trim());
  }

  /* ---------- 見本の圃場 ----------
     並びは本物と同じ5つ（筆ポリゴンのID・面積・市区町村コード・緯度・経度）にしてある。
     数字はどれも見本で、実在の農地ではない。市区町村コードの 99999 は実在しない番号 */
  var MIHON = [
    { id: "見本-1", mensekiM2: 1234, shikuchosonCd: "99999", ido: 26.2124, keido: 127.6809 },
    { id: "見本-2", mensekiM2: 2810, shikuchosonCd: "99999", ido: 26.2131, keido: 127.6822 },
    { id: "見本-3", mensekiM2: 705, shikuchosonCd: "99999", ido: 26.2118, keido: 127.6841 },
    { id: "見本-4", mensekiM2: 3348, shikuchosonCd: "99999", ido: 26.2149, keido: 127.6795 },
  ];

  function mihonWoKaesu() {
    return {
      dami: true,
      riyuu: "WAGRIの利用者IDとクライアントシークレットがまだ無いので、見本の圃場を返しています。",
      hojou: MIHON.map(function (x) {
        return { id: x.id, mensekiM2: x.mensekiM2, shikuchosonCd: x.shikuchosonCd, ido: x.ido, keido: x.keido };
      }),
    };
  }

  /* ---------- ここから下は本物を呼ぶ道 ----------
     ⚠鍵が無いので、一度も動かして確かめていない。 */

  var kagi = null;   /* { token: "…", kigen: ミリ秒 } */

  function tokenWoToru() {
    if (kagi && kagi.kigen > Date.now() + 60000) return Promise.resolve(kagi.token);
    var honbun = new URLSearchParams();
    honbun.set("grant_type", "client_credentials");
    honbun.set("client_id", String(SETTEI.riyousha).trim());
    honbun.set("client_secret", String(SETTEI.himitsu).trim());
    return fetch(SETTEI.tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: honbun.toString(),
    }).then(function (r) {
      if (!r.ok) throw new Error("鍵を受け取れませんでした（" + r.status + "）");
      return r.json();
    }).then(function (o) {
      var t = o && (o.access_token || o.accessToken);
      if (!t) throw new Error("返りに access_token がありません。");
      /* 手順書に「有効時間は1時間」とある。念のため55分で取り直す */
      kagi = { token: String(t), kigen: Date.now() + 55 * 60 * 1000 };
      return kagi.token;
    });
  }

  /* 返ってきた1件を、画面が使う並びへ写す。
     項目の名は SETTEI.kou で決める（未確定なので、鍵が来たら仕様ページを見て入れる） */
  function yomikaeru(rec) {
    var k = SETTEI.kou || {};
    if (!k.id || !k.menseki) throw new Error("返ってくる項目の名（SETTEI.kou）がまだ入っていません。");
    var m = Number(rec[k.menseki]);
    return {
      id: String(rec[k.id]),
      mensekiM2: isFinite(m) ? m : 0,
      shikuchosonCd: k.shikuchoson ? String(rec[k.shikuchoson] == null ? "" : rec[k.shikuchoson]) : "",
      ido: k.ido ? Number(rec[k.ido]) : null,
      keido: k.keido ? Number(rec[k.keido]) : null,
    };
  }

  function hontouWoYobu(joken) {
    var michi = SETTEI.michi || {};
    var saki, q = new URLSearchParams();
    if (joken && joken.shikuchosonCd) {
      saki = michi.shikuchoson;
      q.set("LocalGovernmentCd", String(joken.shikuchosonCd));
    } else if (joken && joken.ido != null && joken.keido != null) {
      saki = michi.kyori;
      q.set("Latitude", String(joken.ido));
      q.set("Longitude", String(joken.keido));
      q.set("Distance", String(joken.kyori || 500));
    } else {
      return Promise.reject(new Error("市区町村コードか、緯度経度のどちらかを渡してください。"));
    }
    if (!saki) return Promise.reject(new Error("筆ポリゴンAPIの道（SETTEI.michi）がまだ入っていません。"));
    return tokenWoToru().then(function (token) {
      var url = String(SETTEI.moto).replace(/\/+$/, "") + saki + "?" + q.toString();
      return fetch(url, { headers: { "X-Authorization": token } });
    }).then(function (r) {
      if (!r.ok) throw new Error("筆ポリゴンを取れませんでした（" + r.status + "）");
      return r.json();
    }).then(function (o) {
      var list = Array.isArray(o) ? o : (o && Array.isArray(o.Result) ? o.Result : []);
      return { dami: false, riyuu: "", hojou: list.map(yomikaeru) };
    });
  }

  /* ---------- 画面から呼ぶのはこの1本だけ ----------
     joken は { shikuchosonCd } か { ido, keido, kyori }。省略してもよい。
     返りは必ず { hojou: [...], dami: 真偽, riyuu: 一文 }。
     dami が真のときは、呼んだ側が画面に見本だと出すこと。 */
  function hojouIchiran(joken) {
    if (!tsukaeru()) return Promise.resolve(mihonWoKaesu());
    return hontouWoYobu(joken).catch(function (e) {
      var r = mihonWoKaesu();
      r.riyuu = "WAGRIを呼べなかったので、見本の圃場を返しています。（" + e.message + "）";
      return r;
    });
  }

  /* 平方メートルをアールに直す。1a＝100平方メートル。小数第1位まで */
  function aNiNaosu(m2) {
    var n = Number(m2);
    if (!isFinite(n) || n < 0) return 0;
    return Math.round(n / 100 * 10) / 10;
  }

  window.MFK_WAGRI = {
    tsukaeru: tsukaeru,
    hojouIchiran: hojouIchiran,
    aNiNaosu: aNiNaosu,
    settei: function () { return SETTEI; },
  };
})();
