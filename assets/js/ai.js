/* ============================================================
   AIを呼ぶ口。この1本だけがAWSを知っている。
   使うページ: tools/kiroku.html（記録の読み取り）
             tools/teian.html（計画の直しどころ）
             tools/keikaku.html（計画書の読み合わせ）

   守る決まり（のうきろくの取り込みから引き継ぐ）
   ・AIは抽出と選択だけ。ツール実行・外部取得の権限を与えない
   ・利用者の書類の中身は資料として渡し、指示として扱わせない
   ・出力はJSONで受け取り、機械で検証してから後段へ渡す
   ・金額はAIに作らせない。AIは打ち手の型と強さを選ぶだけで、
     いくらになるかは必ず sim_engine.js が計算する

   つながっていないとき（設定が無い・AWSが落ちた）は「見本の受け答え」で動く。
   そのときは画面に必ず見本と出す。本物と見分けが付かない状態にしない。
   ============================================================ */
(function () {
  "use strict";

  var store = (window.CORE && window.CORE.store) || null;

  /* ---------- 設定と呼び出し ----------
     サーバの設定（受け口のURLと8文字の合言葉）は db.js が1つだけ持つ。
     ここはそれを借りる。db.js はあとから読み込まれるので、
     まだ読めていないときは同じ保存を直接見る（画面の描き出しが先に走るため）。 */
  var SETTEI_KAGI = "sabaSetting";

  function settei() {
    if (window.MFK_DB) return MFK_DB.settei();
    var s = store ? store.load(SETTEI_KAGI, null) : null;
    if (!s || !s.url || !s.aikotoba) return null;
    return s;
  }
  function setteiWoKaku(url, aikotoba) {
    if (window.MFK_DB) return MFK_DB.setteiWoKaku(url, aikotoba);
    if (!store) return false;
    if (!url || !aikotoba) { store.remove(SETTEI_KAGI); return false; }
    store.save(SETTEI_KAGI, {
      url: String(url).trim().replace(/\/+$/, ""),
      aikotoba: String(aikotoba).trim(),
    });
    return true;
  }
  function tsunagatteiru() { return !!settei(); }

  /* AIに頼む前に、まだ迎え入れられていなければ迎え入れる。
     記録の画面から入った人は、まだ何も保存していないので迎え入れが済んでいない。
     そのままだと本物のAIにつながらず、見本の受け答えが返ってしまう
     （2026-08-16に公開先で実測）。ファイルを送るのは十分に意味のある行いなので、
     ここで迎え入れてよい。住所が決まっていなければ何もしない。 */
  function mazuTsunagu() {
    if (settei()) return Promise.resolve(true);
    if (!window.MFK_DB || !MFK_DB.kiteiNoUrl || !MFK_DB.kiteiNoUrl()) return Promise.resolve(false);
    return MFK_DB.mukaeireru().then(function (st) { return !!st; }).catch(function () { return false; });
  }

  /* AWSのAIを呼ぶ。呼び先は受け口の /compass/ai。
     返すのは必ずオブジェクト。中身の検証は下の各関数で行う。 */
  function awsWoYobu(shurui, zairyou) {
    if (window.MFK_DB) {
      return MFK_DB.yobu("/compass/ai", {
        method: "POST", body: { shurui: shurui, zairyou: zairyou }, byou: 60,
      });
    }
    var st = settei();
    if (!st) return Promise.reject(new Error("設定がありません"));
    return fetch(st.url + "/compass/ai", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Aikotoba " + st.aikotoba },
      body: JSON.stringify({ shurui: shurui, zairyou: zairyou }),
    }).then(function (r) {
      if (!r.ok) throw new Error("サーバが " + r.status + " を返しました");
      return r.json();
    });
  }

  /* ============================================================
     1. 記録の読み取り（段2）
     ============================================================ */
  /* AIが返すべき並び。ここに合わないものは受け取らない。 */
  function yomitoriWoTashikameru(o) {
    if (!o || !Array.isArray(o.records)) throw new Error("読み取りの結果がありません");
    var ok = [];
    o.records.forEach(function (r) {
      if (!r || typeof r !== "object") return;
      var hi = String(r.hizuke || "");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(hi)) return;          // 日付が無いものは捨てる
      var su = Number(r.suryo);
      var kin = Number(r.kingaku);
      ok.push({
        hizuke: hi,
        hinmoku: String(r.hinmoku || "").slice(0, 40),
        shurui: (["収穫", "販売", "出荷", "経費", "その他"].indexOf(r.shurui) > -1) ? r.shurui : "その他",
        suryo: isFinite(su) ? su : null,
        tani: String(r.tani || "").slice(0, 10),
        kingaku: isFinite(kin) ? kin : null,
        moto: String(r.moto || "").slice(0, 60),            // どのファイルの何行目か
      });
    });
    return { records: ok, kensu: ok.length, mihon: !!o.mihon };
  }

  function yomitori(files) {
    return mazuTsunagu().then(function (tsuita) {
      if (!tsuita) return mihonYomitori(files);
      return yomitoriWoOkuru(files);
    });
  }

  function yomitoriWoOkuru(files) {
    var nakami = files.map(function (f) {
      return { namae: f.namae, shurui: f.shurui, moji: f.moji || null, data: f.data || null };
    });
    return awsWoYobu("yomitori", { files: nakami })
      .then(yomitoriWoTashikameru)
      .catch(function (e) {
        var r = mihonYomitori(files);
        r.shippai = e.message;
        return r;
      });
  }

  /* ============================================================
     1-2. 決算書の読み取り（段2・段3）
     ============================================================ */
  /* 決算書には日付の付いた行が無いので、記録としては読み取れない。
     1年ぶんの数字（収入・経費8分類・所得・品目の面積と収穫量）として読み取り、
     実績の診断へ渡す。 */
  var KEIHI_MIDASHI = ["種苗", "肥料", "農薬", "資材", "動力光熱", "出荷運賃手数料", "雇人費", "その他"];

  function kazu(v) {
    var n = Number(v);
    return isFinite(n) ? n : null;
  }

  function kessanshoWoTashikameru(o) {
    if (!o || typeof o !== "object") throw new Error("決算書の読み取りの結果がありません");
    var keihi = {};
    KEIHI_MIDASHI.forEach(function (k) {
      var v = kazu(o.keihi && o.keihi[k]);
      if (v != null && v >= 0) keihi[k] = v;
    });
    var hinmoku = [];
    (Array.isArray(o.hinmoku) ? o.hinmoku : []).slice(0, 20).forEach(function (x) {
      var na = String((x && x.na) || "").slice(0, 40);
      if (!na) return;
      hinmoku.push({
        na: na, mensekiA: kazu(x.mensekiA), shuukakuKg: kazu(x.shuukakuKg), uriage: kazu(x.uriage),
      });
    });
    var nen = kazu(o.nen);
    return {
      nen: (nen && nen >= 1990 && nen <= 2100) ? Math.round(nen) : null,
      shuunyuu: {
        hanbai: kazu(o.shuunyuu && o.shuunyuu.hanbai),
        zatsu: kazu(o.shuunyuu && o.shuunyuu.zatsu),
      },
      keihi: keihi,
      shotoku: kazu(o.shotoku),
      hinmoku: hinmoku,
      mihon: !!o.mihon,
    };
  }

  function kessansho(files) {
    return mazuTsunagu().then(function (tsuita) {
      if (!tsuita) return mihonKessansho(files);
      return kessanshoWoOkuru(files);
    });
  }

  function kessanshoWoOkuru(files) {
    var nakami = files.map(function (f) {
      return { namae: f.namae, shurui: f.shurui, moji: f.moji || null, data: f.data || null };
    });
    return awsWoYobu("kessansho", { files: nakami })
      .then(kessanshoWoTashikameru)
      .catch(function (e) {
        var r = mihonKessansho(files);
        r.shippai = e.message;
        return r;
      });
  }

  function mihonKessansho(files) {
    return {
      nen: null, shuunyuu: { hanbai: null, zatsu: null }, keihi: {}, shotoku: null,
      hinmoku: [], mihon: true,
      shirase: "サーバがまだ設定されていないため、読み取りは行っていません。"
             + "ファイル " + (files ? files.length : 0) + "件は送られていません。",
    };
  }

  /* ============================================================
     2. 計画の直しどころ（段6）
     ============================================================ */
  /* 打ち手の型。AIはこの中からしか選べない。
     どれもエンジンのどの値を動かすかが決まっている。 */
  var UCHITE = {
    menseki:   { na: "面積を変える",           hitsuyou: ["cropId", "bairitsu"] },
    tanka:     { na: "単価を上げる",           hitsuyou: ["cropId", "bairitsu"] },
    keihiritsu:{ na: "経費率を下げる",         hitsuyou: ["cropId", "sagenPt"] },
    hinmokuKae:{ na: "品目の面積を入れ替える", hitsuyou: ["derucropId", "hairucropId", "area"] },
    shoryoku:  { na: "投資して手間を減らす",   hitsuyou: ["amountMan", "laborSagenPct"] },
    kariire:   { na: "借入の条件を変える",     hitsuyou: ["amountMan"] },
    nensuu:    { na: "目標の年次を延ばす",     hitsuyou: ["years"] },
  };

  /* AIの返しを検証する。金額が混じっていても採らない（機械が計算するため）。 */
  function naoshidokoroWoTashikameru(o) {
    if (!o || !Array.isArray(o.an)) throw new Error("案がありません");
    var ok = [];
    o.an.slice(0, 6).forEach(function (a) {
      if (!a || !Array.isArray(a.teate) || !a.teate.length) return;
      var teate = [];
      a.teate.slice(0, 4).forEach(function (t) {
        var kata = UCHITE[t && t.kata] ? t.kata : null;
        if (!kata) return;
        var d = { kata: kata };
        UCHITE[kata].hitsuyou.forEach(function (k) {
          var v = t[k];
          if (typeof v === "number" && isFinite(v)) d[k] = v;
          else if (typeof v === "string") d[k] = v.slice(0, 40);
        });
        // 足りない項目があれば、その打ち手は採らない
        var tarinai = UCHITE[kata].hitsuyou.some(function (k) { return d[k] == null; });
        if (!tarinai) teate.push(d);
      });
      if (!teate.length) return;
      ok.push({
        namae: String(a.namae || "").slice(0, 30) || "案",
        riyuu: String(a.riyuu || "").slice(0, 160),
        teate: teate,
      });
    });
    if (!ok.length) throw new Error("採れる案がありませんでした");
    return { an: ok, mihon: !!o.mihon };
  }

  function naoshidokoro(zairyou) {
    return mazuTsunagu().then(function (tsuita) {
      if (!tsuita) return mihonNaoshidokoro(zairyou);
      return naoshidokoroWoOkuru(zairyou);
    });
  }

  function naoshidokoroWoOkuru(zairyou) {
    return awsWoYobu("naoshidokoro", zairyou)
      .then(naoshidokoroWoTashikameru)
      .catch(function (e) {
        var r = mihonNaoshidokoro(zairyou);
        r.shippai = e.message;
        return r;
      });
  }

  /* ============================================================
     3. 計画書の読み合わせ（段7）
     ============================================================ */
  var SHITEKI_KATA = ["数字が合っていない", "手間が現実的でない", "根拠が無い", "窓口で聞かれる"];

  function yomiawaseWoTashikameru(o) {
    if (!o || !Array.isArray(o.shiteki)) throw new Error("指摘がありません");
    var ok = [];
    o.shiteki.slice(0, 20).forEach(function (x) {
      if (!x) return;
      var kata = (SHITEKI_KATA.indexOf(x.kata) > -1) ? x.kata : "窓口で聞かれる";
      var naiyou = String(x.naiyou || "").slice(0, 200);
      if (!naiyou) return;
      ok.push({ kata: kata, basho: String(x.basho || "").slice(0, 40), naiyou: naiyou });
    });
    return { shiteki: ok, mihon: !!o.mihon };
  }

  function yomiawase(keikaku) {
    return mazuTsunagu().then(function (tsuita) {
      if (!tsuita) return mihonYomiawase(keikaku);
      return yomiawaseWoOkuru(keikaku);
    });
  }

  function yomiawaseWoOkuru(keikaku) {
    return awsWoYobu("yomiawase", keikaku)
      .then(yomiawaseWoTashikameru)
      .catch(function (e) {
        var r = mihonYomiawase(keikaku);
        r.shippai = e.message;
        return r;
      });
  }

  /* ============================================================
     見本の受け答え（AWSにつながっていないとき）
     画面には必ず「見本」と出す。機械で決めた当たり前の内容だけを返し、
     利用者の中身を読んだふりをしない。
     ============================================================ */
  function mihonYomitori(files) {
    return { records: [], kensu: 0, mihon: true,
      shirase: "AIの受け口がまだ設定されていないため、読み取りは行っていません。"
             + "ファイル " + (files ? files.length : 0) + "件は送られていません。" };
  }

  /* 既定の3案。AIが落ちてもここは必ず出る（設計の受け入れ条件）。
     どれも機械が決めた当たり前の打ち手で、AIの判断ではない。 */
  function kiteiNoAn(zairyou) {
    var id = (zairyou && zairyou.items && zairyou.items[0] && zairyou.items[0].cropId) || null;
    if (!id) return [];
    return [
      { namae: "面積を1割ふやす", riyuu: "いちばん作っている品目の面積を増やしたときの効き方を見ます。",
        teate: [{ kata: "menseki", cropId: id, bairitsu: 1.1 }] },
      { namae: "単価を1割上げる", riyuu: "出し先や出荷の時期を変えて単価が上がったときの効き方を見ます。",
        teate: [{ kata: "tanka", cropId: id, bairitsu: 1.1 }] },
      { namae: "経費率を5ポイント下げる", riyuu: "資材や委託の見直しで経費が減ったときの効き方を見ます。",
        teate: [{ kata: "keihiritsu", cropId: id, sagenPt: 5 }] },
    ];
  }

  function mihonNaoshidokoro(zairyou) {
    return { an: kiteiNoAn(zairyou), mihon: true,
      shirase: "AIの受け口がまだ設定されていないため、機械が決めた既定の3案だけを出しています。"
             + "金額はどれも計算し直したものです。" };
  }

  function mihonYomiawase() {
    return { shiteki: [], mihon: true,
      shirase: "AIの受け口がまだ設定されていないため、読み合わせは行っていません。" };
  }

  window.MFK_AI = {
    settei: settei,
    setteiWoKaku: setteiWoKaku,
    tsunagatteiru: tsunagatteiru,
    yomitori: yomitori,
    kessansho: kessansho,
    KEIHI_MIDASHI: KEIHI_MIDASHI.slice(),
    naoshidokoro: naoshidokoro,
    yomiawase: yomiawase,
    kiteiNoAn: kiteiNoAn,
    UCHITE: UCHITE,
    SHITEKI_KATA: SHITEKI_KATA,
    /* 検証だけ外から使えるようにしておく（試験のため） */
    _tashikameru: {
      yomitori: yomitoriWoTashikameru,
      kessansho: kessanshoWoTashikameru,
      naoshidokoro: naoshidokoroWoTashikameru,
      yomiawase: yomiawaseWoTashikameru,
    },
  };
})();
