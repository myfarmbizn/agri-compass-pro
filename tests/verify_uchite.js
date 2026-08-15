/* 打ち手の機械（assets/js/uchite.js）の検算。
   ここが正しくないと、画面に出る金額が信用できない。

   確かめること
     1. 打ち手を当てても、元の計画が書き換わらない
     2. 面積・単価・経費率の打ち手が、狙った値だけを動かす
     3. 当てた結果を sim_engine.js が計算し、手計算と一致する
     4. なりたい姿に照らした判定が、届く・収まる・底を割らないの3つを正しく返す
     5. 手放したくない品目を減らす案が、はじかれる

   走らせ方: node tests/verify_uchite.js
*/
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");
const U = require(path.join(ROOT, "assets/js/uchite.js"));

/* sim_engine.js は素の関数の並びなので、箱を作って読み込む */
const engineSrc = fs.readFileSync(path.join(ROOT, "assets/js/sim_engine.js"), "utf8");
const box = { module: undefined, exports: undefined };
vm.createContext(box);
vm.runInContext(engineSrc, box);
const simCompute = box.simCompute;

let ok = 0, ng = 0;
function check(na, jouken, soe) {
  if (jouken) { ok++; }
  else { ng++; console.log("  不合格 " + na + (soe ? "  " + soe : "")); }
}
const marume = (v) => Math.round(v);

/* ---------- 材料 ---------- */
function motoPlan() {
  return {
    years: 5, livingMan: 20, fixedMan: 100, cashStartMan: 300, targetMan: 600,
    loan: { amountMan: 0, ratePct: 1.5, termY: 10, graceY: 1 },
    items: [
      { cropId: "tomato", area: 30, yieldV: 8000, priceV: 300, costRate: 0.6,
        laborH10a: 900, curve: U.gennekiCurve(), typhoonExp: 0 },
      { cropId: "goya", area: 20, yieldV: 5000, priceV: 250, costRate: 0.55,
        laborH10a: 700, curve: U.gennekiCurve(), typhoonExp: 0 },
    ],
    invests: [], hojo: { amountMan: 0, year: 1 },
  };
}

/* ---------- 1. 元の計画が変わらない ---------- */
const moto = motoPlan();
const mae = JSON.stringify(moto);
U.ateru(moto, [{ kata: "menseki", cropId: "tomato", bairitsu: 2 }]);
check("打ち手を当てても元の計画が変わらない", JSON.stringify(moto) === mae);

/* ---------- 2. 狙った値だけが動く ---------- */
let p = U.ateru(motoPlan(), [{ kata: "menseki", cropId: "tomato", bairitsu: 1.5 }]);
check("面積の打ち手が当たる", p.items[0].area === 45, String(p.items[0].area));
check("ほかの品目の面積は動かない", p.items[1].area === 20, String(p.items[1].area));
check("面積の打ち手で単価は動かない", p.items[0].priceV === 300);

p = U.ateru(motoPlan(), [{ kata: "tanka", cropId: "goya", bairitsu: 1.2 }]);
check("単価の打ち手が当たる", p.items[1].priceV === 300, String(p.items[1].priceV));
check("単価の打ち手で面積は動かない", p.items[1].area === 20);

p = U.ateru(motoPlan(), [{ kata: "keihiritsu", cropId: "tomato", sagenPt: 10 }]);
check("経費率の打ち手が当たる", Math.abs(p.items[0].costRate - 0.5) < 1e-9, String(p.items[0].costRate));

p = U.ateru(motoPlan(), [{ kata: "keihiritsu", cropId: "tomato", sagenPt: 99 }]);
check("経費率は0.05より下げない（売上が丸ごと利益になるのを防ぐ）",
  Math.abs(p.items[0].costRate - 0.05) < 1e-9, String(p.items[0].costRate));

p = U.ateru(motoPlan(), [{ kata: "shoryoku", amountMan: 500, laborSagenPct: 20, life: 7 }]);
check("手間を減らす投資が1件足される", p.invests.length === 1 && p.invests[0].amountMan === 500);
check("10a当たり労働時間が2割減る", Math.abs(p.items[0].laborH10a - 720) < 1e-9, String(p.items[0].laborH10a));

p = U.ateru(motoPlan(), [{ kata: "hinmokuKae", derucropId: "goya", hairucropId: "tomato", area: 10 }]);
check("品目の入れ替えで面積が移る", p.items[0].area === 40 && p.items[1].area === 10,
  p.items.map((x) => x.cropId + ":" + x.area).join(" "));

p = U.ateru(motoPlan(), [{ kata: "hinmokuKae", derucropId: "goya", hairucropId: "tomato", area: 999 }]);
check("持っている面積より多くは移せない", p.items[0].area === 50 && p.items.length === 1,
  p.items.map((x) => x.cropId + ":" + x.area).join(" "));

/* ---------- 3. 計算が手計算と合う ---------- */
/* 元の計画の1年目の売上を手で出す。
   トマト 30a → 3.0（10a単位）× 8000kg × 300円 = 7,200,000
   ゴーヤ 20a → 2.0 × 5000 × 250            = 2,500,000
   合計 9,700,000 */
const k0 = U.kekka(U.ateru(motoPlan(), []), simCompute);
check("1年目の売上が手計算と一致する", marume(k0.years[0].sales) === 9700000, String(marume(k0.years[0].sales)));

/* 経費は 7,200,000×0.6 + 2,500,000×0.55 = 4,320,000 + 1,375,000 = 5,695,000
   固定費 100万 → 所得 = 9,700,000 − 5,695,000 − 1,000,000 = 3,005,000 */
check("1年目の所得が手計算と一致する", marume(k0.years[0].income) === 3005000, String(marume(k0.years[0].income)));

/* 面積を2倍にしたら売上も2倍 */
const k2 = U.kekka(U.ateru(motoPlan(), [
  { kata: "menseki", cropId: "tomato", bairitsu: 2 },
  { kata: "menseki", cropId: "goya", bairitsu: 2 },
]), simCompute);
check("面積2倍で売上が2倍になる", marume(k2.years[0].sales) === 19400000, String(marume(k2.years[0].sales)));

/* 年間の働く時間 = 3.0×900 + 2.0×700 = 2700 + 1400 = 4100 */
check("年間の働く時間が手計算と一致する", marume(k0.roudou) === 4100, String(marume(k0.roudou)));

/* ---------- 4. なりたい姿に照らした判定 ---------- */
const h1 = U.mitomeru({ finalIncome: 6000000, minCash: 1000000, roudou: 1800 },
  { mokuhyouMan: 600, roudouKibou: 2000 });
check("目標に届いていれば届くと返す", h1.todoku === true);
check("希望の時間に収まっていれば収まると返す", h1.jikanOsamaru === true);
check("現金が底を割っていなければ持つと返す", h1.genkinMotsu === true);

const h2 = U.mitomeru({ finalIncome: 5999999, minCash: -1, roudou: 2001 },
  { mokuhyouMan: 600, roudouKibou: 2000 });
check("1円でも足りなければ届かないと返す", h2.todoku === false);
check("1時間でも超えれば収まらないと返す", h2.jikanOsamaru === false);
check("現金が1円でも足りなければ持たないと返す", h2.genkinMotsu === false);

const h3 = U.mitomeru({ finalIncome: 100, minCash: 0, roudou: 9999 }, {});
check("希望が入っていない項目は判定しない（null で返す）", h3.todoku === null && h3.jikanOsamaru === null);

/* ---------- 5. 手放したくない品目を守る ---------- */
const m = motoPlan();
const heru = { plan: U.ateru(m, [{ kata: "menseki", cropId: "goya", bairitsu: 0.5 }]) };
check("手放したくない品目を減らす案ははじく", U.mamoreteiruka(heru, m, ["goya"]) === false);
check("減らしていない品目なら通す", U.mamoreteiruka(heru, m, ["tomato"]) === true);
check("手放したくないものが無ければ全部通す", U.mamoreteiruka(heru, m, []) === true);

const kaeru = { plan: U.ateru(m, [{ kata: "hinmokuKae", derucropId: "goya", hairucropId: "tomato", area: 5 }]) };
check("品目の入れ替えでも、守る品目が減っていればはじく", U.mamoreteiruka(kaeru, m, ["goya"]) === false);

/* ---------- 6. 案をまるごと確かめる ---------- */
const an = U.anWoTameusu(motoPlan(),
  { namae: "面積を1割ふやす", riyuu: "見る", teate: [{ kata: "menseki", cropId: "tomato", bairitsu: 1.1 }] },
  simCompute, null, { mokuhyouMan: 600, roudouKibou: 5000 });
check("案の結果が返る", !!an && !!an.kekka);
check("案の売上が、機械の計算と一致する",
  marume(an.kekka.years[0].sales) === marume(3.3 * 8000 * 300 + 2.0 * 5000 * 250),
  String(marume(an.kekka.years[0].sales)));
check("案には当てた打ち手が残る", an.teate.length === 1 && an.teate[0].kata === "menseki");

const kara = U.anWoTameusu(motoPlan(),
  { namae: "全部やめる", riyuu: "", teate: [
    { kata: "menseki", cropId: "tomato", bairitsu: 0 },
    { kata: "menseki", cropId: "goya", bairitsu: 0 }] },
  simCompute, null, {});
check("作るものが無くなった案は出さない", kara === null);

/* ---------- 7. 分からない打ち手は捨てる ---------- */
p = U.ateru(motoPlan(), [{ kata: "shiranai_uchite", nanika: 1 }]);
check("知らない打ち手は何も動かさない", JSON.stringify(p.items) === JSON.stringify(U.ateru(motoPlan(), []).items));

console.log("");
console.log("打ち手の機械  合格 " + ok + "件 / 不合格 " + ng + "件");
process.exit(ng ? 1 : 0);
