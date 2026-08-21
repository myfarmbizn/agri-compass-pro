/* ============================================================
   マイファーム農業経営コンパス — 立場（ペルソナ）設定
   ・最初の画面で利用者が自分の立場を選ぶと、ツール構成と学ぶ順番が切り替わる
   ・事務局がこのファイルを編集して git push すると全体に反映される
   ・presets の数値はすべて「演習用の仮の値」。実在の指標を入れる場合は
     必ず出典を note に書く（出典を書けない値は（仮）のまま運用する）
   ============================================================ */
(function () {
  "use strict";

  var EX_NOTE = "この事例の数値はすべて演習用の仮の値です（実在の地域指標ではありません）。授業では講師の配布値や自分の数字に置き換えてください。";

  function exCrop(id, name, y, p, cost, labor, months, typhoon, facility) {
    return {
      id: id, name: name, cat: "演習用",
      yieldKg10a: y, priceYenKg: p, costRate: cost, laborH10a: labor,
      months: months, typhoonExp: typhoon, facility: facility || "",
      transport: { air: false, ship: false }
    };
  }

  var EX_PRESET = {
    id: "engei",
    label: "露地野菜＋施設野菜の演習例（仮）",
    note: EX_NOTE,
    cropCustom: { overrides: {}, custom: [
      exCrop("ex_yasai_a", "露地野菜A（演習用・仮）", 2500, 300, 0.55, 200, { plant: [4, 5], harvest: [7, 8, 9, 10], income: [8, 9, 10, 11] }, 0.1),
      exCrop("ex_yasai_b", "施設野菜B（演習用・仮）", 8000, 350, 0.65, 800, { plant: [9], harvest: [12, 1, 2, 3, 4], income: [1, 2, 3, 4, 5] }, 0.05, "ハウス")
    ] },
    simPlan: {
      years: 5, famPeople: 2, famHours: 160,
      livingMan: 25, cashStartMan: 300, targetMan: 300,
      items: [
        { cropId: "ex_yasai_a", area: 30, yieldV: 2500, priceV: 300, costRate: 0.55, laborH10a: 200, typhoonExp: 0.1 },
        { cropId: "ex_yasai_b", area: 10, yieldV: 8000, priceV: 350, costRate: 0.65, laborH10a: 800, typhoonExp: 0.05 }
      ],
      invests: [{ label: "機械一式（演習用の仮の値）", amountMan: 200, year: 1, kind: "new", life: 7, leaseMan: 0, leaseYears: 5 }],
      loan: { amountMan: 300, ratePct: 2.0, termY: 10, graceY: 2 },
      hojo: { amountMan: 0, year: 1 },
      fixedMan: 30, fixedMemo: "演習用の仮の値"
    }
  };

  /* ============================================================
     例題経営者A・B（比較用）と営農モデル例題（3校フィードバック 2026-07-31で追加）
     ・数値はすべて演習用の仮の値。判定（良い/注意/危ない）が例題ごとに割れるように
       作ってあり、「どの経営者が良い結果になるか」を比較して学ぶ教材
     ・追加・変更したら tools/verify_presets.js（node）で全例題の計算を検算する
     ============================================================ */
  var EX_A = {
    id: "exA",
    label: "例題経営者A・露地野菜中心で小さく始める（仮）",
    note: EX_NOTE,
    cropCustom: { overrides: {}, custom: [
      exCrop("ex_yasai_a", "露地野菜A（演習用・仮）", 2500, 300, 0.55, 200, { plant: [4, 5], harvest: [7, 8, 9, 10], income: [8, 9, 10, 11] }, 0.1),
      exCrop("ex_yasai_b", "施設野菜B（演習用・仮）", 8000, 350, 0.65, 800, { plant: [9], harvest: [12, 1, 2, 3, 4], income: [1, 2, 3, 4, 5] }, 0.05, "ハウス")
    ] },
    simPlan: {
      years: 5, famPeople: 2, famHours: 160,
      livingMan: 20, cashStartMan: 300, targetMan: 240,
      items: [
        { cropId: "ex_yasai_a", area: 60, yieldV: 2500, priceV: 300, costRate: 0.55, laborH10a: 200, typhoonExp: 0.1 },
        { cropId: "ex_yasai_b", area: 10, yieldV: 8000, priceV: 350, costRate: 0.65, laborH10a: 800, typhoonExp: 0.05 }
      ],
      invests: [{ label: "中古機械一式（演習用の仮の値）", amountMan: 150, year: 1, kind: "new", life: 7, leaseMan: 0, leaseYears: 5 }],
      loan: { amountMan: 150, ratePct: 2.0, termY: 10, graceY: 1 },
      hojo: { amountMan: 0, year: 1 },
      fixedMan: 30, fixedMemo: "演習用の仮の値"
    }
  };
  var EX_B = {
    id: "exB",
    label: "例題経営者B・新設ハウスに先行投資（仮）",
    note: EX_NOTE,
    cropCustom: { overrides: {}, custom: [
      exCrop("ex_yasai_a", "露地野菜A（演習用・仮）", 2500, 300, 0.55, 200, { plant: [4, 5], harvest: [7, 8, 9, 10], income: [8, 9, 10, 11] }, 0.1),
      exCrop("ex_yasai_b", "施設野菜B（演習用・仮）", 8000, 350, 0.65, 800, { plant: [9], harvest: [12, 1, 2, 3, 4], income: [1, 2, 3, 4, 5] }, 0.05, "ハウス")
    ] },
    simPlan: {
      years: 5, famPeople: 2, famHours: 160,
      livingMan: 20, cashStartMan: 150, targetMan: 240,
      items: [
        { cropId: "ex_yasai_a", area: 20, yieldV: 2500, priceV: 300, costRate: 0.55, laborH10a: 200, typhoonExp: 0.1 },
        { cropId: "ex_yasai_b", area: 20, yieldV: 8000, priceV: 350, costRate: 0.65, laborH10a: 800, typhoonExp: 0.05 }
      ],
      invests: [
        { label: "新設ハウス（演習用の仮の値）", amountMan: 800, year: 1, kind: "new", life: 10, leaseMan: 0, leaseYears: 5 },
        { label: "機械一式（演習用の仮の値）", amountMan: 200, year: 1, kind: "new", life: 7, leaseMan: 0, leaseYears: 5 }
      ],
      loan: { amountMan: 800, ratePct: 2.0, termY: 10, graceY: 1 },
      hojo: { amountMan: 0, year: 1 },
      fixedMan: 40, fixedMemo: "演習用の仮の値"
    }
  };

  /* 農の学校フィードバックの5類型（多様な営農モデルの経営構造を例題で理解する） */
  function ngPlan(items, invests, loan, hojo, opt) {
    return Object.assign({
      years: 5, famPeople: 2, famHours: 160,
      livingMan: 15, cashStartMan: 200, targetMan: 150,
      items: items, invests: invests, loan: loan,
      hojo: hojo || { amountMan: 0, year: 1 },
      fixedMan: 20, fixedMemo: "演習用の仮の値"
    }, opt || {});
  }
  var NG_CROPS = [
    exCrop("ex_hamono", "葉物野菜（演習用・仮）", 1800, 450, 0.5, 300, { plant: [3, 4, 9], harvest: [5, 6, 10, 11], income: [6, 7, 11, 12] }, 0.1),
    exCrop("ex_konsai", "根菜（演習用・仮）", 2500, 200, 0.5, 150, { plant: [4, 8], harvest: [7, 11, 12], income: [8, 12, 1] }, 0.05),
    exCrop("ex_kasai", "露地果菜（演習用・仮）", 3500, 320, 0.55, 400, { plant: [4, 5], harvest: [7, 8, 9], income: [8, 9, 10] }, 0.15),
    exCrop("ex_nasu", "施設果菜・ナス型（演習用・仮）", 10000, 380, 0.65, 900, { plant: [2, 3], harvest: [5, 6, 7, 8, 9, 10], income: [6, 7, 8, 9, 10, 11] }, 0.05, "ハウス"),
    exCrop("ex_suito", "水稲（演習用・仮）", 500, 300, 0.6, 25, { plant: [5], harvest: [9, 10], income: [10, 11] }, 0.1),
    exCrop("ex_yasai_b", "施設野菜B（演習用・仮）", 12000, 320, 0.6, 800, { plant: [9], harvest: [12, 1, 2, 3, 4], income: [1, 2, 3, 4, 5] }, 0.05, "ハウス")
  ];
  function ngCustom(ids) {
    return { overrides: {}, custom: NG_CROPS.filter(function (c) { return ids.indexOf(c.id) > -1; }) };
  }
  var NG_PRESETS = [
    { id: "ng_tahinmoku", label: "営農モデル①少量多品目の露地野菜（仮）", note: EX_NOTE,
      cropCustom: ngCustom(["ex_hamono", "ex_konsai", "ex_kasai"]),
      simPlan: ngPlan([
        { cropId: "ex_hamono", area: 20, yieldV: 1800, priceV: 450, costRate: 0.5, laborH10a: 300, typhoonExp: 0.1 },
        { cropId: "ex_konsai", area: 20, yieldV: 2500, priceV: 200, costRate: 0.5, laborH10a: 150, typhoonExp: 0.05 },
        { cropId: "ex_kasai", area: 15, yieldV: 3500, priceV: 320, costRate: 0.55, laborH10a: 400, typhoonExp: 0.15 }
      ], [{ label: "中古機械（演習用の仮の値）", amountMan: 100, year: 1, kind: "new", life: 7, leaseMan: 0, leaseYears: 5 }],
        { amountMan: 100, ratePct: 2.0, termY: 7, graceY: 1 }, null, { targetMan: 120, livingMan: 13 }) },
    { id: "ng_tanpin", label: "営農モデル②単一品目中心（施設果菜）（仮）", note: EX_NOTE,
      cropCustom: ngCustom(["ex_nasu"]),
      simPlan: ngPlan([
        { cropId: "ex_nasu", area: 20, yieldV: 10000, priceV: 400, costRate: 0.65, laborH10a: 900, typhoonExp: 0.05 }
      ], [{ label: "中古ハウス（演習用の仮の値）", amountMan: 400, year: 1, kind: "new", life: 10, leaseMan: 0, leaseYears: 5 }],
        { amountMan: 300, ratePct: 2.0, termY: 10, graceY: 1 }, null, { targetMan: 200, fixedMan: 30, livingMan: 16 }) },
    { id: "ng_fukugo", label: "営農モデル③水稲と野菜の複合（仮）", note: EX_NOTE,
      cropCustom: ngCustom(["ex_suito", "ex_kasai"]),
      simPlan: ngPlan([
        { cropId: "ex_suito", area: 200, yieldV: 500, priceV: 300, costRate: 0.6, laborH10a: 25, typhoonExp: 0.1 },
        { cropId: "ex_kasai", area: 20, yieldV: 3500, priceV: 320, costRate: 0.55, laborH10a: 400, typhoonExp: 0.15 }
      ], [{ label: "水稲機械（演習用の仮の値）", amountMan: 400, year: 1, kind: "new", life: 7, leaseMan: 0, leaseYears: 5 }],
        { amountMan: 350, ratePct: 2.0, termY: 10, graceY: 1 }, null, { targetMan: 150, fixedMan: 25, livingMan: 12 }) },
    { id: "ng_hanno", label: "営農モデル④農外収入を残した半農半エックス型（仮）", note: EX_NOTE + "生活費の大半は農外収入でまかなう前提のため、農業側の生活費は月2万円だけ計上しています（仮）。この計算に農外収入そのものは含まれません。",
      cropCustom: ngCustom(["ex_hamono"]),
      simPlan: ngPlan([
        { cropId: "ex_hamono", area: 15, yieldV: 1800, priceV: 450, costRate: 0.5, laborH10a: 300, typhoonExp: 0.1 }
      ], [{ label: "小型機械（演習用の仮の値）", amountMan: 60, year: 1, kind: "new", life: 7, leaseMan: 0, leaseYears: 5 }],
        { amountMan: 0, ratePct: 0, termY: 1, graceY: 0 }, null, { targetMan: 30, livingMan: 2, fixedMan: 10, cashStartMan: 100 }) },
    { id: "ng_shisetsu", label: "営農モデル⑤施設投資を伴う経営（仮）", note: EX_NOTE,
      cropCustom: ngCustom(["ex_yasai_b"]),
      simPlan: ngPlan([
        { cropId: "ex_yasai_b", area: 20, yieldV: 13000, priceV: 340, costRate: 0.6, laborH10a: 800, typhoonExp: 0.05 }
      ], [
        { label: "新設ハウス（演習用の仮の値）", amountMan: 1000, year: 1, kind: "new", life: 10, leaseMan: 0, leaseYears: 5 },
        { label: "機械一式（演習用の仮の値）", amountMan: 150, year: 1, kind: "new", life: 7, leaseMan: 0, leaseYears: 5 }
      ], { amountMan: 700, ratePct: 2.0, termY: 12, graceY: 2 },
        { amountMan: 300, year: 1 }, { targetMan: 240, livingMan: 20, fixedMan: 35, cashStartMan: 400 }) }
  ];

  window.MFK_PERSONAS = {

    kentou: {
      label: "農業を始めるか考えている人向け",
      short: "就農を考えている",
      taisho: "会社勤めなどをしながら、就農を検討している人（農地・品目は未定でよい）",
      goal: "農業で暮らしが成り立つかどうかを、感覚ではなくお金の数字で確かめられるようになる",
      tools: ["simulator", "gyakusan", "hinmoku", "sakutsuke", "taifu"],
      /* 3校フィードバック（2026-07-31）: 品目・地域が未定の段階で経営力チェックや求人票の
         入力が最初に来ると詰まるため、この立場は「例題を動かす」から始めて、チェックは最後に置く。
         逆算・作付け比較・独立雇用比較も同フィードバック（AIC・みらい）で追加 */
      path: [
        "例題経営者A・B（下のボタン）を読み込んで経営シミュレーターを動かし、「何年目に生活が成り立つか」「資金がいちばん薄くなる年」を2人分見比べる",
        "目標から逆算で「いくら稼ぎたいか」を決め、品目ごとに必要な面積の目安を見る（気になる品目は作付けの決定でいろいろ組み合わせてみる）",
        "面積・単価・生活費を動かして、結果がどう変わるかを試す",
        "雇用就農（法人に就職して学ぶ道）も見るなら、給与の手取り換算と「独立と雇用をくらべる」で数字を並べる（求人票が手元になければ飛ばして構いません）",
        "最後に経営力チェックで、「就農するときに目指す経営力」に対して、いま数字で言えることを確かめる（先に「学びはじめの自己チェック」からでも）"
      ],
      presets: [EX_A, EX_B]
    },

    junbi: {
      label: "就農の準備中・就農して間もない人向け",
      short: "就農準備〜経営初期",
      taisho: "研修中・就農準備中の人、就農からおおむね5年目までの人",
      goal: "自分の就農計画を数字で作り、融資や認定の相談にそのまま持ち込めるようにする",
      tools: ["hinmoku", "sakutsuke", "simulator", "konkyo", "shikin", "keikaku", "taifu"],
      path: [
        "経営力チェックで、計画のどこがまだ数字になっていないかを確かめる（難しければ「学びはじめの自己チェック」から）",
        "品目と単価を自分の地域・自分の想定の値に置き換える",
        "作付けの決定で、候補の組み合わせを所得と月別労働で比べる",
        "経営シミュレーターで複数年の計画を作り、もしも検証（単価減・収量減）で弱い前提を知る",
        "数字の根拠しらべで、計画の数字一つひとつの出どころを確かめ、根拠の薄い数字を指導者との相談リストにする",
        "資金繰りカレンダーで、月ごとの残高と不足しやすい時期を見る",
        "計画書にまとめて、金融機関・市町村への相談に持参する"
      ],
      presets: [EX_PRESET]
    },

    koyou: {
      label: "農業法人で働く・働きたい人向け",
      short: "雇用就農",
      taisho: "農業法人への就職を考えている人・勤めている人",
      goal: "求人の条件を手取りで比べられるようになり、法人の経営数字とのつながりを知る",
      tools: ["toushi", "taifu"],
      path: [
        "経営力チェックで、経営の数字への慣れを確かめる",
        "給与の手取り換算で、求人票の条件を年間の手取り見込みに直して比べる",
        "投資・雇用のページを「雇う側」の視点で動かし、自分の給料が法人のどの数字から出ているかを知る",
        "将来の独立も視野にあるなら、「独立と雇用をくらべる」で両方の数字を1つの表で見る"
      ],
      presets: []
    },

    hatten: {
      label: "経営を伸ばしたい農業者向け",
      short: "経営発展",
      taisho: "すでに経営していて、規模拡大・投資・法人化などを考えている農業者",
      goal: "申告書の数字から現状を把握し、拡大案との違いを数字で比べて判断できるようになる",
      tools: ["checkup", "hinmoku", "sakutsuke", "simulator", "toushi", "shikin", "keikaku", "smart", "taifu"],
      path: [
        "経営力チェックで、経営のどの数字が手元にないかを確かめる",
        "実績の診断に申告書（収支内訳書・青色決算書）の数字を入れ、品目別の所得と時給を見る",
        "作付けを変える案があれば、作付けの決定で現状と並べて所得と労働を比べる（使う場合だけ）",
        "経営シミュレーターで「現状のまま」と「拡大案」を並べて比べる",
        "投資・雇用で、機械・施設・人を増やす判断を回収の見通しで確かめる",
        "計画書にまとめて、金融機関との相談に持参する",
        "スマート農業技術を入れる場合は、計画認定の申請下書きまで作る"
      ],
      presets: []
    },

    shidou: {
      label: "教える立場の人向け（講師・教員）",
      short: "指導者",
      taisho: "農業大学校・研修機関の教員、当社講座の講師",
      goal: "授業・研修でこのツールを教材として使い、受講生の学びの記録を改良につなげる",
      tools: ["checkup", "sakutsuke", "simulator", "keikaku", "shikin", "toushi", "smart", "hinmoku", "taifu", "gyakusan", "konkyo"],
      path: [
        "すべてのページを下見し、担当する回で使うページを決める",
        "授業用のURL（使うページと演習例を絞ったもの）は事務局が作成します。事務局に回の内容を伝えてください",
        "授業の最初と最後に経営力チェックを使うと、受講生の変化が記録に残ります"
      ],
      /* 講師用の例題集: 比較用の例題経営者A・Bと、営農モデル5類型（すべて仮の値） */
      presets: [EX_PRESET, EX_A, EX_B].concat(NG_PRESETS)
    }
  };

  /* 旧: 沖縄限定ページの追加リスト。災害への備えは全地域・全立場に常設化したため空。
     旧コードからの参照が残っても壊れないよう、定義自体は残す */
  window.MFK_OKINAWA_EXTRA = [];

  /* 学びはじめの自己チェック（3校フィードバック 2026-07-31: 既存10問は計画作成経験者向けで
     受講生にはハードルが高い、との指摘への対応）。理解度・準備度・説明力の3面×4問。
     正解のあるテストではなく、いまの自分の状態を面ごとに眺めるためのもの */
  window.MFK_MANABI_QS = [
    { men: "rikai", q: "「粗収益（売上）」と「農業所得（売上から経費を引いた残り）」の違いを、自分の言葉で説明できる", tool: "simulator", tl: "経営シミュレーター" },
    { men: "rikai", q: "「経費率」が何を表すか（売上のうち経費に消える割合）を説明できる", tool: "hinmoku", tl: "品目と単価" },
    { men: "rikai", q: "「もうけ（損益）」と「手元のお金（資金繰り）」が別ものだと説明できる", tool: "shikin", tl: "資金繰り" },
    { men: "rikai", q: "「立ち上がり」（作り始めの年は収量・売上が少ないこと）を知っている", tool: "simulator", tl: "経営シミュレーター" },
    { men: "junbi", q: "作りたい品目の候補が、1つ以上ある", tool: "hinmoku", tl: "品目と単価" },
    { men: "junbi", q: "営農したい地域の候補がある", tool: "hinmoku", tl: "品目と単価（地域の値の確認）" },
    { men: "junbi", q: "就農に使える自己資金のおおよその金額を把握している", tool: "simulator", tl: "経営シミュレーター" },
    { men: "junbi", q: "毎月の生活費（家計へ渡すお金）のおおよその金額を把握している", tool: "simulator", tl: "経営シミュレーター" },
    { men: "setsumei", q: "候補の品目の、10a当たりの売上の目安を言える", tool: "hinmoku", tl: "品目と単価" },
    { men: "setsumei", q: "目標の所得を出すのに必要な、おおよその面積を言える", tool: "gyakusan", tl: "目標から逆算" },
    { men: "setsumei", q: "就農までに必要な初期投資（機械・施設）のおおよその金額を言える", tool: "toushi", tl: "投資・雇用" },
    { men: "setsumei", q: "何年目に生活が成り立つ見込みかを言える", tool: "simulator", tl: "経営シミュレーター" }
  ];
  window.MFK_MANABI_MEN = { rikai: "経営のことばの理解", junbi: "計画の材料の準備", setsumei: "数字で言える力" };

  /* 経営力チェックの設問（check10.html と、各ページの「チェックから来ました」帯が共用する）
     設問は「〜できる」の自己評価形でなく、いまこの場で確かめられる行動そのものを書く（2026-07-19改訂）。
     tl（誘導先の表示名）は core.js の STEP_LABELS の正式名に合わせる（括弧の補足は可） */
  window.MFK_CHECK10_QS = [
    { q: "昨年（または想定する）1年間の売上と経費を、いまこの場でおおよその金額で言える", tool: "simulator", tl: "経営シミュレーター", note: "実績がある人は実績の診断でも確かめられます" },
    { q: "作っている（作りたい）品目の10a当たりの収量と単価を、いまこの場でおおよその数字で言える", tool: "hinmoku", tl: "品目と単価" },
    { q: "「この品目を増やしたら所得はいくら変わるか」を、いまこの場でおおよその金額で言える", tool: "sakutsuke", tl: "作付けの決定" },
    { q: "何年目に生活が成り立つ見込みか、その年の所得の金額とあわせて、いまこの場で言える", tool: "simulator", tl: "経営シミュレーター" },
    { q: "手元の資金がいちばん少なくなる月と、そのときのおおよその残高を、いまこの場で言える", tool: "shikin", tl: "資金繰り（カレンダー）", alt: "simulator" },
    { q: "いちばん大きい機械・施設の投資について、何年で元が取れる見込みか、いまこの場で年数を言える", tool: "toushi", tl: "投資・雇用" },
    { q: "借入をいくら借りて、毎年いくら返すか（返す予定か）を、いまこの場で金額で言える", tool: "keikaku", tl: "計画書にまとめる" },
    { q: "単価や収量が2割下がったら所得がいくらになるか、いまこの場でおおよその金額で言える", tool: "simulator", tl: "経営シミュレーター（もしも検証）" },
    { q: "作業がいちばん忙しくなるのが何月か、品目ごとに、いまこの場で言える", tool: "sakutsuke", tl: "作付けの決定（月別労働）" },
    { q: "自分の経営の数字をまとめた資料（紙かファイル）が手元にあり、いまこの場で見せられる", tool: "keikaku", tl: "計画書にまとめる（A4印刷）" }
  ];
})();
