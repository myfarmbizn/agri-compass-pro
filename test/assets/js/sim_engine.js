/* ============================================================
   マイファーム農業経営コンパス — 経営シミュレーター計算エンジン
   純関数・DOMに触れない。node --check / node での独立検算ができる。
   利用ページ: tools/simulator.html（経営シミュレーター）
             tools/keikaku.html（融資用の事業計画書）
   計算式を変えるときは両ページの表示と BUILD_SPEC.md §5.10 も確認すること。
   ============================================================ */
/*==SIM-ENGINE-START==*/
function simBuildRegistry(DATA) {
  var REG = [];
  DATA.CROPS.forEach(function (c) {
    var isHon = !!c.yieldHon10a;
    var yieldObj = isHon ? c.yieldHon10a : c.yieldKg10a;
    var priceObj = isHon ? c.priceYenHon : c.priceYenKg;
    var costRateObj = c.costRate;
    if (!costRateObj && c.cost10a && yieldObj && priceObj) {
      var cr = c.cost10a.v / (yieldObj.v * priceObj.v);
      costRateObj = { v: Math.round(cr * 100) / 100, src: c.cost10a.src, calc: true, old: !!c.cost10a.old };
    }
    REG.push({
      id: c.id, name: c.name, cat: c.cat,
      unitY: isHon ? "本/10a" : "kg/10a", unitP: isHon ? "円/本" : "円/kg",
      yieldObj: yieldObj, priceObj: priceObj, costRateObj: costRateObj,
      laborObj: c.laborH10a || { v: 0, kari: true },
      months: c.months, typhoonExp: c.typhoonExp
    });
  });
  // さとうきび（分蜜糖）: 手取り構造（原料代金＋交付金−委託等）から1行に合成
  var K = (typeof DATA !== "undefined" && DATA.KIBI) ? DATA.KIBI : null;
  if (K) {
  var ky = K.yield.r6kei;   // 県計の最新年産（R6・豊作年）。資金繰り・実績の診断・災害への備えと同じ基準
  var pYenKg = K.tedori.totalYenT.v / 1000;
  var sales10a = ky.v * pYenKg;
  var keihi10a = K.seisanhi.buzaihi.v + K.seisanhi.koyoRodo.v;
  REG.push({
    id: "kibi", name: "さとうきび（分蜜糖）", cat: "さとうきび",
    unitY: "kg/10a", unitP: "円/kg",
    yieldObj: ky,
    priceObj: { v: Math.round(pYenKg * 10) / 10, src: K.tedori.totalYenT.src, calc: true,
      note: "トン当たり手取り（取引価格＋交付金）÷1,000。交付金の対象要件（認定農業者等）を満たさない場合は交付金分が受け取れません" },
    costRateObj: { v: Math.round(keihi10a / sales10a * 100) / 100, src: "S9", calc: true,
      note: "（物財費＋雇用労働費）÷粗収益の計算値。家族労働費は含めていません" },
    laborObj: K.seisanhi.laborH,
    months: { plant: [7, 8, 9], harvest: [1, 2, 3], income: [1, 2, 3] },
    typhoonExp: 0.1, typhoonKari: true
  });
  }
  return REG;
}

// 立ち上がりの既定（すべて仮の目安・編集前提）: 果樹=3年目30%・4年目60%・5年目以降100%
// 野菜・花卉など=1年目70%・2年目以降100% / さとうきび=夏植の初年無収入を1年目0%で表現
function simDefaultCurve(reg) {
  var c;
  if (reg.id === "kibi") c = [0, 100];
  else if (reg.cat === "果樹") c = [0, 0, 30, 60, 100];
  else c = [70, 100];
  var out = [];
  for (var i = 0; i < 10; i++) out.push(c[Math.min(i, c.length - 1)]);
  return out;
}

// 借入の年別返済額（元利均等・据置あり）。返り値は計画各年の返済額（円）の配列
function simLoanPayments(amountYen, ratePct, termY, graceY, planYears) {
  var pay = [];
  var r = (ratePct || 0) / 100;
  termY = Math.max(1, Math.round(termY || 1));
  graceY = Math.max(0, Math.min(Math.round(graceY || 0), termY - 1));
  var n = termY - graceY;
  var annuity = 0;
  if (amountYen > 0) {
    annuity = r > 0 ? amountYen * r / (1 - Math.pow(1 + r, -n)) : amountYen / n;
  }
  for (var t = 1; t <= planYears; t++) {
    if (amountYen <= 0 || t > termY) pay.push(0);
    else if (t <= graceY) pay.push(amountYen * r);   // 据置中は利息のみ
    else pay.push(annuity);
  }
  return pay;
}

// 年次計算。st の金額は万円、返り値は円。opts: {taifu, delay, rateAdd}
function simCompute(st, regById, opts) {
  opts = opts || {};
  var M = 10000;
  var N = st.years;
  var living = st.livingMan * M * 12;
  var fixed = st.fixedMan * M;
  var loanAmt = (st.loan.amountMan || 0) * M;
  var pays = simLoanPayments(loanAmt, (st.loan.ratePct || 0) + (opts.rateAdd || 0), st.loan.termY, st.loan.graceY, N);
  var years = [];
  var cash = st.cashStartMan * M;
  for (var t = 1; t <= N; t++) {
    var sales = 0, varCost = 0;
    st.items.forEach(function (it) {
      var area10 = it.area / 10;
      var ci = opts.delay ? t - 2 : t - 1;                 // 1年遅れは前年の割合（1年目は0%）
      var ramp = ci < 0 ? 0 : (it.curve[Math.min(ci, 9)] || 0) / 100;
      var s = area10 * it.yieldV * it.priceV * ramp;
      varCost += s * it.costRate;                          // 経費は掛かった後という想定
      if (opts.salesCut) s = s * opts.salesCut;            // 下振れ検証も売上だけ減らす（経費は基本ケースのまま）
      if (opts.taifu) s = s * (1 - (it.typhoonExp || 0));  // 台風年は売上だけ減らす
      sales += s;
    });
    var dep = 0, lease = 0, investCash = 0;
    (st.invests || []).forEach(function (iv) {
      if (iv.kind === "lease") {
        var ly = Math.max(1, Math.round(iv.leaseYears || 1));
        if (t >= iv.year && t < iv.year + ly) lease += (iv.leaseMan || 0) * M;
      } else {
        var life = Math.max(1, Math.round(iv.life || 1));
        if (t === iv.year) investCash += (iv.amountMan || 0) * M;
        if (t >= iv.year && t < iv.year + life) dep += (iv.amountMan || 0) * M / life;
      }
    });
    var income = sales - varCost - fixed - lease - dep;
    var loanIn = t === 1 ? loanAmt : 0;
    var hojoIn = (st.hojo && st.hojo.amountMan > 0 && t === st.hojo.year) ? st.hojo.amountMan * M : 0;
    cash = cash + income + dep - pays[t - 1] - living + loanIn + hojoIn - investCash;
    years.push({ y: t, sales: sales, varCost: varCost, fixed: fixed, lease: lease, dep: dep,
      expense: varCost + fixed + lease + dep, income: income, repay: pays[t - 1],
      loanIn: loanIn, hojoIn: hojoIn, investCash: investCash, living: living, cashEnd: cash });
  }
  var minCash = years[0].cashEnd, minYear = 1;
  years.forEach(function (r) { if (r.cashEnd < minCash) { minCash = r.cashEnd; minYear = r.y; } });
  var targetYen = st.targetMan * M;
  var targetYear = null;
  for (var i = 0; i < years.length; i++) { if (years[i].income >= targetYen) { targetYear = years[i].y; break; } }
  return { years: years, minCash: minCash, minYear: minYear, targetYear: targetYear,
    finalIncome: years[N - 1].income };
}

// 満作年の月別労働（植付月∪収穫月に均等にならす仮の按分・作付け比較と同じ方式）
function simMonthlyLabor(st, regById) {
  var per = [], total = new Array(12).fill(0);
  st.items.forEach(function (it) {
    var c = regById(it.cropId);
    var laborTotal = it.area / 10 * (it.laborH10a || 0);
    var active = {};
    ((c && c.months && c.months.plant) || []).forEach(function (m) { active[m] = 1; });
    ((c && c.months && c.months.harvest) || []).forEach(function (m) { active[m] = 1; });
    var act = Object.keys(active).map(Number);
    if (!act.length) act = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    var arr = new Array(12).fill(0);
    act.forEach(function (m) { arr[m - 1] += laborTotal / act.length; });
    for (var i = 0; i < 12; i++) total[i] += arr[i];
    per.push({ name: (c ? c.name : it.cropId) + " " + it.area + "a", values: arr });
  });
  return { per: per, total: total };
}

// もしも6ケース（決め打ち比較・確率は使わない）
function simWhatif(st, regById) {
  function clone(s) { return JSON.parse(JSON.stringify(s)); }
  var defs = [
    { key: "base", label: "基本", make: function (s) { return { st: s, opts: {} }; } },
    { key: "salescut", label: "① 売上−20%（単価や収量の下振れ）", make: function (s) { return { st: s, opts: { salesCut: 0.8 } }; } },
    { key: "cost", label: "② 経費＋20%", make: function (s) { s.items.forEach(function (it) { it.costRate = Math.min(1, it.costRate * 1.2); }); return { st: s, opts: {} }; } },
    { key: "taifu", label: "③ 毎年台風1回（仮）", make: function (s) { return { st: s, opts: { taifu: true } }; } },
    { key: "rate", label: "④ 金利＋1%", make: function (s) { return { st: s, opts: { rateAdd: 1 } }; } },
    { key: "delay", label: "⑤ 立ち上がり1年遅れ", make: function (s) { return { st: s, opts: { delay: true } }; } }
  ];
  return defs.map(function (d) {
    var m = d.make(clone(st));
    var r = simCompute(m.st, regById, m.opts);
    return { key: d.key, label: d.label, finalIncome: r.finalIncome, minCash: r.minCash, minYear: r.minYear, targetYear: r.targetYear };
  });
}
/*==SIM-ENGINE-END==*/
