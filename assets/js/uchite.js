/* ============================================================
   打ち手を計画に当てて、結果を計算し直す機械。
   使うページ: tools/teian.html（計画の直しどころ）

   ここがこの道具の要になる。AIは「どの打ち手を、どれだけ動かすか」を選ぶだけで、
   いくらになるかは全部この機械が sim_engine.js に計算させる。
   だから画面に出る金額に、AIの作り話が混じらない。

   純関数だけ。DOMに触れない。node で単体の検算ができる。
   ============================================================ */
(function (root, factory) {
  var m = factory();
  if (typeof module === "object" && module.exports) module.exports = m;
  else root.MFK_UCHITE = m;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  /* 現役の農家はもう満作なので、立ち上がりの割合は初年から100%を既定にする。
     新しく始める品目を足すときだけ、画面の側で下げてもらう。 */
  function gennekiCurve() {
    var a = [];
    for (var i = 0; i < 10; i++) a.push(100);
    return a;
  }

  function utsusu(o) { return JSON.parse(JSON.stringify(o)); }

  function kazu(v, kitei) {
    var n = Number(v);
    return isFinite(n) ? n : (kitei || 0);
  }

  /* ---------- 打ち手を1つ当てる ----------
     計画（simPlan と同じ並び）を写してから当てるので、元の計画は変わらない。 */
  function hitotsuAteru(plan, t) {
    var p = plan;
    var it, i;
    switch (t.kata) {
      case "menseki":
        for (i = 0; i < p.items.length; i++) {
          if (p.items[i].cropId === t.cropId) p.items[i].area = kazu(p.items[i].area) * kazu(t.bairitsu, 1);
        }
        break;
      case "tanka":
        for (i = 0; i < p.items.length; i++) {
          if (p.items[i].cropId === t.cropId) p.items[i].priceV = kazu(p.items[i].priceV) * kazu(t.bairitsu, 1);
        }
        break;
      case "keihiritsu":
        for (i = 0; i < p.items.length; i++) {
          if (p.items[i].cropId === t.cropId) {
            var atarashii = kazu(p.items[i].costRate) - kazu(t.sagenPt) / 100;
            /* 経費率が0を割ると売上がまるごと利益になってしまう。下限を置く */
            p.items[i].costRate = Math.max(0.05, atarashii);
          }
        }
        break;
      case "hinmokuKae":
        var deru = null;
        for (i = 0; i < p.items.length; i++) if (p.items[i].cropId === t.derucropId) deru = p.items[i];
        if (!deru) break;
        var utsusuMenseki = Math.min(kazu(t.area), kazu(deru.area));
        if (utsusuMenseki <= 0) break;
        deru.area = kazu(deru.area) - utsusuMenseki;
        var hairu = null;
        for (i = 0; i < p.items.length; i++) if (p.items[i].cropId === t.hairucropId) hairu = p.items[i];
        if (hairu) hairu.area = kazu(hairu.area) + utsusuMenseki;
        /* 入れる品目が計画に無いときは、この打ち手は当てない。
           単収・単価・経費率が分からないまま数字を作らないため */
        break;
      case "shoryoku":
        p.invests = p.invests || [];
        p.invests.push({
          label: "手間を減らす投資", amountMan: kazu(t.amountMan), year: 1,
          kind: "new", life: kazu(t.life, 7), leaseMan: 0, leaseYears: 0,
        });
        var sageru = kazu(t.laborSagenPct) / 100;
        for (i = 0; i < p.items.length; i++) {
          p.items[i].laborH10a = kazu(p.items[i].laborH10a) * (1 - Math.min(0.9, Math.max(0, sageru)));
        }
        break;
      case "kariire":
        p.loan = p.loan || { amountMan: 0, ratePct: 0, termY: 1, graceY: 0 };
        p.loan.amountMan = kazu(t.amountMan);
        if (t.ratePct != null) p.loan.ratePct = kazu(t.ratePct);
        if (t.termY != null) p.loan.termY = Math.max(1, Math.round(kazu(t.termY, 1)));
        if (t.graceY != null) p.loan.graceY = Math.max(0, Math.round(kazu(t.graceY)));
        break;
      case "nensuu":
        p.years = Math.max(1, Math.min(10, Math.round(kazu(t.years, p.years))));
        for (i = 0; i < p.items.length; i++) {
          if (!p.items[i].curve || p.items[i].curve.length !== 10) p.items[i].curve = gennekiCurve();
        }
        break;
      default:
        break;
    }
    return p;
  }

  /* ---------- 打ち手をまとめて当てる ---------- */
  function ateru(plan, teate) {
    var p = utsusu(plan);
    p.items = p.items || [];
    p.invests = p.invests || [];
    for (var i = 0; i < p.items.length; i++) {
      if (!p.items[i].curve || p.items[i].curve.length !== 10) p.items[i].curve = gennekiCurve();
      if (p.items[i].typhoonExp == null) p.items[i].typhoonExp = 0;
    }
    (teate || []).forEach(function (t) { if (t && t.kata) hitotsuAteru(p, t); });
    /* 面積が0以下になった品目は外す（0の行を計算に残すと表が読みにくくなる） */
    p.items = p.items.filter(function (it) { return kazu(it.area) > 0; });
    return p;
  }

  /* ---------- 年間の働く時間 ----------
     満作年の見込み。品目ごとに 面積÷10 × 10a当たりの時間 を足す。
     sim_engine.js の simMonthlyLabor と同じ数え方（あちらは月に配るだけ）。 */
  function roudouNen(plan) {
    var g = 0;
    (plan.items || []).forEach(function (it) {
      g += kazu(it.area) / 10 * kazu(it.laborH10a);
    });
    return g;
  }

  /* ---------- 結果を出す ----------
     simCompute は sim_engine.js の関数。ここでは受け取って呼ぶだけで、
     計算式には一切触れない。 */
  function kekka(plan, simCompute, regById) {
    var r = simCompute(plan, regById || function () { return null; }, {});
    return {
      finalIncome: r.finalIncome,
      minCash: r.minCash,
      minYear: r.minYear,
      targetYear: r.targetYear,
      roudou: roudouNen(plan),
      years: r.years,
    };
  }

  /* ---------- なりたい姿に照らして判定する ----------
     良し悪しは書かない。届くか・収まるか・底を割らないかの3つを、そのまま返す。 */
  function mitomeru(k, nozomi) {
    var n = nozomi || {};
    var mokuhyouYen = kazu(n.mokuhyouMan) * 10000;
    return {
      todoku: mokuhyouYen > 0 ? (k.finalIncome >= mokuhyouYen) : null,
      jikanOsamaru: kazu(n.roudouKibou) > 0 ? (k.roudou <= kazu(n.roudouKibou)) : null,
      genkinMotsu: k.minCash >= 0,
    };
  }

  /* ---------- 案を1つ、まるごと確かめる ---------- */
  function anWoTameusu(motoPlan, an, simCompute, regById, nozomi) {
    var p = ateru(motoPlan, an.teate);
    if (!p.items.length) return null;      // 当てた結果、作るものが無くなった案は出さない
    var k = kekka(p, simCompute, regById);
    return {
      namae: an.namae, riyuu: an.riyuu, teate: an.teate,
      plan: p, kekka: k, hantei: mitomeru(k, nozomi),
    };
  }

  /* ---------- 手放したくないものを守る ----------
     なりたい姿で「手放したくない」と選んだ品目を、減らす案は出さない。
     当たり前のこと（面積を増やせば所得が増える）しか言わない道具にしないための決まり。 */
  function mamoreteiruka(an, motoPlan, tebanasanai) {
    if (!tebanasanai || !tebanasanai.length) return true;
    var mae = {};
    (motoPlan.items || []).forEach(function (it) { mae[it.cropId] = kazu(it.area); });
    var ato = {};
    (an.plan.items || []).forEach(function (it) { ato[it.cropId] = kazu(it.area); });
    for (var i = 0; i < tebanasanai.length; i++) {
      var id = tebanasanai[i];
      if (mae[id] == null) continue;
      if (kazu(ato[id]) < mae[id] - 0.001) return false;
    }
    return true;
  }

  return {
    gennekiCurve: gennekiCurve,
    ateru: ateru,
    roudouNen: roudouNen,
    kekka: kekka,
    mitomeru: mitomeru,
    anWoTameusu: anWoTameusu,
    mamoreteiruka: mamoreteiruka,
  };
});
