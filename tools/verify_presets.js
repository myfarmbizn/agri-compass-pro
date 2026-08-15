/* packs.js の演習例（例題経営者・営農モデル）の独立検算（node tools/verify_presets.js）
   ・sim_engine.js の simCompute をそのまま使い、各例題の
     最終年所得・資金の最低点・目標到達年・判定（良い/注意/危ない）を出す
   ・判定の基準はシミュレーターの「この数字はこう見る」と同じ:
     期間内に資金マイナス=危ない／目標未達=注意／達成=良い
   ・NaN・undefined・品目IDの不一致（items の cropId が cropCustom に無い）を FAIL にする */
"use strict";
var fs = require("fs");
var path = require("path");
var vm = require("vm");

var root = path.join(__dirname, "..");
var ctx = { window: {}, console: console };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(root, "assets", "js", "packs.js"), "utf8"), ctx);
var engineSrc = fs.readFileSync(path.join(root, "assets", "js", "sim_engine.js"), "utf8");
vm.runInContext(engineSrc + "\nwindow.__eng = { simCompute: simCompute, simDefaultCurve: simDefaultCurve };", ctx);

var P = ctx.window.MFK_PERSONAS;
var eng = ctx.window.__eng;

var fails = 0;
function ok(cond, label) {
  console.log((cond ? "PASS" : "FAIL") + "  " + label);
  if (!cond) fails++;
}

var seen = {};
Object.keys(P).forEach(function (pid) {
  (P[pid].presets || []).forEach(function (pr) {
    if (seen[pr.id]) return;
    seen[pr.id] = true;
    var plan = pr.simPlan;
    var customIds = ((pr.cropCustom || {}).custom || []).map(function (c) { return c.id; });
    var missing = plan.items.filter(function (it) { return customIds.indexOf(it.cropId) === -1; });
    ok(missing.length === 0, pr.id + " 品目IDが例題データに揃っている" + (missing.length ? "（欠け: " + missing.map(function (m) { return m.cropId; }).join(",") + "）" : ""));

    var st = JSON.parse(JSON.stringify(plan));
    st.items.forEach(function (it) {
      var reg = { id: it.cropId, cat: "演習用" };
      it.curve = eng.simDefaultCurve(reg);
    });
    var r = eng.simCompute(st, function () { return null; }, {});
    var nums = [r.minCash, r.finalIncome].concat(r.years.map(function (y) { return y.cashEnd; }));
    ok(nums.every(function (v) { return typeof v === "number" && isFinite(v); }), pr.id + " 計算結果にNaN・undefinedなし");
    var verdict = r.minCash < 0 ? "危ない" : (!r.targetYear ? "注意" : "良い");
    console.log("      " + pr.id + " [" + pr.label + "] 最終年所得=" + Math.round(r.finalIncome / 10000) + "万 資金最低点=" +
      Math.round(r.minCash / 10000) + "万(" + r.minYear + "年目) 目標到達=" + (r.targetYear ? r.targetYear + "年目" : "期間内なし") +
      " → 判定: " + verdict);
    ctx["__v_" + pr.id] = verdict;
  });
});

/* 例題の設計意図: Aは良い・Bは危ない（比較教材として判定が割れること） */
ok(ctx["__v_exA"] === "良い", "exA（小さく始める型）の判定が「良い」");
ok(ctx["__v_exB"] === "危ない", "exB（投資先行型）の判定が「危ない」");

process.exit(fails ? 1 : 0);
