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

  /* ---------- 設定（この端末にだけ保存する） ----------
     url      … AWS側の受け口。例 https://xxxx.execute-api.ap-northeast-1.amazonaws.com/ai
     aikotoba … 8文字の合言葉。Authorization: Aikotoba XXXXXXXX として送る */
  function settei() {
    var s = store ? store.load("aiSetting", null) : null;
    if (!s || !s.url || !s.aikotoba) return null;
    return s;
  }
  function setteiWoKaku(url, aikotoba) {
    if (!store) return false;
    if (!url || !aikotoba) { store.remove("aiSetting"); return false; }
    store.save("aiSetting", { url: String(url).trim(), aikotoba: String(aikotoba).trim() });
    return true;
  }
  function tsunagatteiru() { return !!settei(); }

  /* ---------- AWSを呼ぶ ----------
     shurui: "yomitori" | "naoshidokoro" | "yomiawase"
     返すのは必ずオブジェクト。中身の検証は呼んだ側の関数で行う。 */
  function awsWoYobu(shurui, zairyou) {
    var st = settei();
    if (!st) return Promise.reject(new Error("設定がありません"));
    var t = setTimeout(function () {}, 0); clearTimeout(t);
    var ctl = (typeof AbortController !== "undefined") ? new AbortController() : null;
    var toki = setTimeout(function () { if (ctl) ctl.abort(); }, 60000);
    return fetch(st.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Aikotoba " + st.aikotoba,
      },
      body: JSON.stringify({ shurui: shurui, zairyou: zairyou }),
      signal: ctl ? ctl.signal : undefined,
    }).then(function (r) {
      clearTimeout(toki);
      if (!r.ok) throw new Error("AWSが " + r.status + " を返しました");
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
    if (!tsunagatteiru()) return Promise.resolve(mihonYomitori(files));
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
    if (!tsunagatteiru()) return Promise.resolve(mihonNaoshidokoro(zairyou));
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
    if (!tsunagatteiru()) return Promise.resolve(mihonYomiawase(keikaku));
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
    naoshidokoro: naoshidokoro,
    yomiawase: yomiawase,
    kiteiNoAn: kiteiNoAn,
    UCHITE: UCHITE,
    SHITEKI_KATA: SHITEKI_KATA,
    /* 検証だけ外から使えるようにしておく（試験のため） */
    _tashikameru: {
      yomitori: yomitoriWoTashikameru,
      naoshidokoro: naoshidokoroWoTashikameru,
      yomiawase: yomiawaseWoTashikameru,
    },
  };
})();
