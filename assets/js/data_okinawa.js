/* ============================================================
   マイファーム農業経営コンパス — 数値マスタ（2026-07-11 収集）
   すべての値は flag で区別する:
     src   : 出典ID（下の SOURCES を参照）
     calc  : true = 出典の記載値からの計算値（原典に直接の印字なし）
     kari  : true = 仮定値（出典なし。編集前提の初期値。画面で必ず（仮）表示）
     old   : true = 古い調査値（参考にとどめる）
   仮定値・計算値・古い値は UI で必ずラベル表示すること。
   年度更新はこのファイルの差し替えだけで済む構造にする。
   ============================================================ */
(function () {
  "use strict";

  /* ---------- 出典一覧 ---------- */
  const SOURCES = {
    S1: { name: "沖縄県中央卸売市場 市場年報 令和6年 青果部", url: "https://www.pref.okinawa.lg.jp/_res/projects/default_project/_page_/001/010/540/r6seikabu0701.pdf", year: "令和6年" },
    S2: { name: "沖縄県農林水産部「農業関係統計」令和7年3月版（県計統計表）", url: "https://www.pref.okinawa.jp/_res/projects/default_project/_page_/001/036/324/kennkeitoukei18-111.pdf", year: "令和4年産" },
    S3: { name: "沖縄県園芸振興課「第5章 果樹生産の現状」", url: "https://www.pref.okinawa.jp/_res/projects/default_project/_page_/001/010/522/05_p72-87.pdf", year: "令和2年" },
    S4: { name: "沖縄県園芸振興課「第4章 花き生産の現状」", url: "https://www.pref.okinawa.lg.jp/_res/projects/default_project/_page_/001/028/403/04_p42-71.pdf", year: "令和3年" },
    S5: { name: "内閣府沖縄総合事務局「令和5年産さとうきびの収穫面積及び収穫量」", url: "https://www.ogb.go.jp/-/media/Files/OGB/nousui/press_info/240620/03.pdf", year: "令和5年産（概数）" },
    S6: { name: "沖縄県糖業農産課「沖縄県における令和6年産さとうきびの生産状況」（alic掲載）", url: "https://www.alic.go.jp/joho-s/joho07_003407.html", year: "令和6年産" },
    S7: { name: "農林水産省「令和7年産さとうきび等に係る生産者交付金の単価の決定」", url: "https://www.maff.go.jp/j/press/nousan/chiiki/241211.html", year: "令和7年産" },
    S8: { name: "沖縄県糖業農産課「令和5/6年期さとうきび及び甘しゃ糖生産実績」", url: "https://www.pref.okinawa.lg.jp/_res/projects/default_project/_page_/001/010/408/01_seisanjiseki2.pdf", year: "令和5/6年期" },
    S9: { name: "農林水産省 農業経営統計調査 令和6年産さとうきび生産費（e-Stat・表402。労働時間は同調査 表404=statInfId:000040440194）", url: "https://www.e-stat.go.jp/stat-search/file-download?statInfId=000040440192&fileKind=0", year: "令和6年産" },
    S10: { name: "坂井教郎「沖縄におけるさとうきび農家の収穫委託の特徴」農業経済論集58巻2号", url: "https://agriknowledge.affrc.go.jp/RN/2030814486.pdf", year: "2004/05〜05/06年期調査（2008年発行）" },
    S11: { name: "気象庁「台風の平年値」（沖縄地方への接近数）", url: "https://www.data.jma.go.jp/typhoon/statistics/average/average.html", year: "1991〜2020年平均" },
    S12: { name: "気象庁「沖縄地方への台風接近数」（年別）", url: "https://www.data.jma.go.jp/typhoon/statistics/accession/okinawa.html", year: "2022〜2025年" },
    S13: { name: "内閣府防災「令和5年台風第6号による被害状況等」（農水省情報・速報）", url: "https://www.bousai.go.jp/updates/r5typhoon6/pdf/r5typhoon6_02.pdf", year: "令和5年8月7日時点" },
    S14: { name: "農林水産省「農業経営の収入保険」", url: "https://www.maff.go.jp/j/keiei/nogyohoken/syunyuhoken/", year: "2026年7月閲覧" },
    S15: { name: "農林水産省「農業経営の収入保険（詳細）」", url: "https://www.maff.go.jp/j/keiei/nogyohoken/syunyuhoken/syousai.html", year: "2026年7月閲覧" },
    S16: { name: "NOSAI沖縄「園芸施設共済」", url: "https://nosai-okinawa.jp/enterprise/e05/", year: "2026年7月閲覧" },
    S17: { name: "沖縄県「おきなわ農林水産物県外出荷促進事業補助金実施の手引き（令和8年度版）」", url: "https://www.pref.okinawa.jp/_res/projects/default_project/_page_/001/010/499/tebiki_r8kengai.pdf", year: "令和8年度" },
    S18: { name: "沖縄県 流通・加工推進課「農林水産物条件不利性解消事業 指定物流事業者の手引き」（大宜味村サイト掲載）", url: "https://www.vill.ogimi.okinawa.jp/material/files/group/6/4.pdf", year: "令和4〜6年度（旧制度）" },
    S19: { name: "農林水産省「施設園芸等燃油価格高騰対策（A重油価格推移）」", url: "https://www.maff.go.jp/j/seisan/ryutu/engei/attach/pdf/iyfv-134.pdf", year: "令和6年8月" },
    S20: { name: "alic「令和6年『農業物価指数』について」", url: "https://www.alic.go.jp/joho-c/joho05_003904.html", year: "令和6年" },
    S21: { name: "福島県「夏秋小ギク電照栽培マニュアル」（農水省委託・全国値）", url: "https://www.pref.fukushima.lg.jp/uploaded/attachment/261076.pdf", year: "平成30年（経費はH28-29）" },
    S22: { name: "農研機構ほか「キク電照栽培用 光源選定・導入のてびき」（全国値）", url: "https://www.naro.go.jp/publicity_report/publication/files/light_source_guidance_201311.pdf", year: "2013年" },
    S23: { name: "やまむファーム（原典：農水省 品目別経営統計 平成19年産・全国値・調査廃止）", url: "https://ymmfarm.com/agriculture/earnings-by-crop/", year: "平成19年産" },
    S24: { name: "alic『野菜情報』2022年11月号（糸満市ゴーヤー産地調査）", url: "https://vegetable.alic.go.jp/yasaijoho/senmon/2211_chosa1.html", year: "2022年" },
    S25: { name: "alic「対象甘味資源作物生産者要件審査 要件区分判定チャート」", url: "https://www.alic.go.jp/content/000125637.pdf", year: "令和7年産時点" },
    S26: { name: "沖縄県「おきなわ農林水産物県外出荷促進事業」（制度の承継）", url: "https://www.pref.okinawa.jp/shigoto/nogyo/1010390/1010499.html", year: "令和7年度〜" },
  };

  /* ---------- 品目マスタ ----------
     yieldKg10a: 10a当たり収量kg / priceYenKg: 円/kg（卸売・手取りは手数料控除前）
     costRate: 経営費÷粗収益の初期仮定（kari）/ laborH10a: 10a当たり年間労働時間
     months: 1-12。plant=植付・播種、harvest=収穫、income=入金（共販は出荷翌月ずれ込み）
     typhoonExp: 台風期(7-10月)の畑の露出度合い 0-1（仮・編集前提）
     transport: air=航空必須級の傷みやすさ, ship=船便可
  ---------- */
  const CROPS = [
    {
      id: "goya_sokusei", name: "ゴーヤー（施設・冬春）", cat: "野菜",
      yieldKg10a: { v: 2709, src: "S2", calc: true, note: "県平均（収穫量5,906t÷作付218ha、露地含む全作型平均）。施設冬春はこれより高い（糸満の篤農事例5.4t/10a=S24）" },
      priceYenKg: { v: 517, src: "S1", note: "県中央卸売市場・県内産ニガウリ年間平均卸売単価" },
      costRate: { v: 0.55, kari: true }, laborH10a: { v: 800, kari: true },
      months: { plant: [9, 10], harvest: [1, 2, 3, 4, 5, 6], income: [2, 3, 4, 5, 6, 7] },
      typhoonExp: 0.35, facility: "パイプハウス", transport: { air: true, ship: false },
    },
    {
      id: "goya_roji", name: "ゴーヤー（露地・春夏）", cat: "野菜",
      yieldKg10a: { v: 1100, src: "S24", note: "糸満市・二期作の一期作平均1.1t/10a" },
      priceYenKg: { v: 517, src: "S1" },
      costRate: { v: 0.45, kari: true }, laborH10a: { v: 400, kari: true },
      months: { plant: [2, 3], harvest: [5, 6, 7], income: [6, 7, 8] },
      typhoonExp: 0.5, facility: "露地", transport: { air: true, ship: false },
    },
    {
      id: "okra", name: "オクラ（露地）", cat: "野菜",
      yieldKg10a: { v: 1449, src: "S2", calc: true, note: "県平均（985t÷68ha）" },
      priceYenKg: { v: 666, src: "S1", note: "角オクラ年間平均。宮古の販売実績からの計算値は約1,014円/kg（S2系・宮古R3年度）" },
      costRate: { v: 0.45, kari: true }, laborH10a: { v: 500, kari: true },
      months: { plant: [3, 4], harvest: [5, 6, 7, 8, 9, 10], income: [6, 7, 8, 9, 10, 11] },
      typhoonExp: 0.85, facility: "露地", transport: { air: true, ship: false },
    },
    {
      id: "kabocha", name: "かぼちゃ（冬春）", cat: "野菜",
      yieldKg10a: { v: 947, src: "S2", calc: true, note: "県平均（3,560t÷376ha）" },
      priceYenKg: { v: 326, src: "S1", note: "えびすかぼちゃ。宮古の販売実績からの計算値は約368円/kg" },
      costRate: { v: 0.45, kari: true }, laborH10a: { v: 120, kari: true },
      months: { plant: [9, 10], harvest: [12, 1, 2], income: [1, 2, 3] },
      typhoonExp: 0.25, facility: "露地", transport: { air: false, ship: true },
    },
    {
      id: "ninjin", name: "にんじん（冬春）", cat: "野菜",
      yieldKg10a: { v: 1635, src: "S2", calc: true, note: "県平均（2,060t÷126ha）" },
      priceYenKg: { v: 148, src: "S1" },
      costRate: { v: 0.55, kari: true },
      laborH10a: { v: 118, src: "S23", old: true, note: "平成19年産・全国値（同調査は廃止）" },
      months: { plant: [8, 9, 10], harvest: [12, 1, 2, 3], income: [1, 2, 3, 4] },
      typhoonExp: 0.3, facility: "露地", transport: { air: false, ship: true },
    },
    {
      id: "piman", name: "ピーマン（施設・冬春）", cat: "野菜",
      yieldKg10a: { v: 6432, src: "S2", calc: true, note: "県平均（2,830t÷44ha・施設主体）" },
      priceYenKg: { v: 446, src: "S1", note: "大型ピーマン（中型は438円/kg）" },
      costRate: { v: 0.4, src: "S23", calc: true, old: true, note: "平成19年産・全国の露地ピーマンの値（粗収益142万・経営費53万/10a）から算出。施設作型では経費率がこれより高い可能性" },
      laborH10a: { v: 776, src: "S23", old: true, note: "平成19年産・全国の露地ピーマンの値" },
      months: { plant: [9], harvest: [11, 12, 1, 2, 3, 4, 5, 6], income: [12, 1, 2, 3, 4, 5, 6, 7] },
      typhoonExp: 0.35, facility: "パイプハウス", transport: { air: true, ship: false },
    },
    {
      id: "ingen", name: "さやいんげん（冬春）", cat: "野菜",
      yieldKg10a: { v: 1123, src: "S2", calc: true, note: "県平均（1,830t÷163ha）" },
      priceYenKg: { v: 759, src: "S1", note: "在来ヒラザヤ（フード）。いんげんの品名別では751〜1,006円/kgの幅" },
      costRate: { v: 0.5, kari: true }, laborH10a: { v: 450, kari: true },
      months: { plant: [9, 10], harvest: [11, 12, 1, 2, 3], income: [12, 1, 2, 3, 4] },
      typhoonExp: 0.4, facility: "露地", transport: { air: true, ship: false },
    },
    {
      id: "rakkyo", name: "島らっきょう", cat: "野菜",
      yieldKg10a: { v: 1024, src: "S2", calc: true, note: "県平均（379t÷37ha・品名らっきょう）" },
      priceYenKg: { v: 1268, src: "S1", note: "月別954〜2,428円/kgの幅" },
      costRate: { v: 0.5, kari: true }, laborH10a: { v: 600, kari: true, note: "収穫・調製の手作業が重い" },
      months: { plant: [8, 9], harvest: [12, 1, 2, 3, 4], income: [1, 2, 3, 4, 5] },
      typhoonExp: 0.3, facility: "露地", transport: { air: true, ship: false },
    },
    {
      id: "kogiku", name: "小ギク（電照・冬春出し）", cat: "花卉",
      yieldHon10a: { v: 32900, src: "S4", note: "キク類計の単収32,900本/10a（R3・県平均）" },
      priceYenHon: { v: 50, src: "S21", kari: true, note: "福島マニュアルの試算単価40〜50円/本（全国値）。沖縄県産の公式平均単価は未取得（要確認）" },
      cost10a: { v: 820000, src: "S21", old: true, note: "電照栽培の経営費795,400〜845,900円/10a（全国値・H30）" },
      laborH10a: { v: 700, kari: true, note: "電照で慣行比+20〜30時間（S21）。総時間の公式値なし" },
      months: { plant: [8, 9, 10], harvest: [12, 1, 2, 3], income: [1, 2, 3, 4] },
      typhoonExp: 0.45, facility: "平張・露地電照", transport: { air: true, ship: true },
      denshoCost: {
        note: "光源別の年間コスト（ランプ代の年割・基本料金・電気料金込み。20a・200球・年500時間点灯の全国試算。別掲のLED導入費と一部重複）",
        incandescent: { v: 120966, src: "S22", old: true }, fluorescent: { v: 44982, src: "S22", old: true }, led: { v: 21798, src: "S22", old: true },
        ledInstall: { v: 600000, src: "S22", old: true, note: "LED導入60万円/20a（寿命10年目安）" },
      },
    },
    {
      id: "mango", name: "マンゴー（ハウス）", cat: "果樹",
      yieldKg10a: { v: 608, src: "S3", note: "県平均（R2・収穫量1,647t÷結果樹面積271ha）" },
      priceYenKg: { v: 1942, src: "S3", calc: true, note: "県販売金額3,156,331千円÷販売量1,625t（R2・県内外込み）" },
      costRate: { v: 0.5, kari: true }, laborH10a: { v: 400, kari: true },
      months: { plant: [], harvest: [6, 7, 8], income: [7, 8, 9] },
      typhoonExp: 0.7, facility: "果樹温室・強化ハウス", transport: { air: true, ship: false },
      facilityCost: { v: 15000, src: "S3", calc: true, note: "果樹温室 約15,000円/㎡（石垣の事業実例148,500千円÷9,870㎡）。10a換算約1,500万円" },
    },
    {
      id: "pine", name: "パインアップル", cat: "果樹",
      yieldKg10a: { v: 2309, src: "S3", calc: true, note: "収穫量7,390t÷収穫面積320ha（R2）" },
      priceYenKg: { v: 200, kari: true, note: "生食・加工比率で大きく変わる（R2出荷は生食4,990t・加工2,220t）。単価の公式平均は未取得（要確認）" },
      costRate: { v: 0.5, kari: true }, laborH10a: { v: 250, kari: true },
      months: { plant: [8, 9], harvest: [4, 5, 6, 7, 8], income: [5, 6, 7, 8, 9] },
      typhoonExp: 0.4, facility: "露地", transport: { air: false, ship: true },
    },
    {
      id: "shikwasa", name: "シークヮーサー", cat: "果樹",
      yieldKg10a: { v: 1115, src: "S3", note: "県平均（R2）" },
      priceYenKg: { v: 145, src: "S3", calc: true, note: "販売金額649,717千円÷4,494t（R2・加工向け主体）" },
      costRate: { v: 0.45, kari: true }, laborH10a: { v: 200, kari: true },
      months: { plant: [], harvest: [8, 9, 10, 11, 12], income: [9, 10, 11, 12, 1] },
      typhoonExp: 0.55, facility: "露地（樹園地）", transport: { air: false, ship: true },
    },
    {
      id: "tankan", name: "タンカン", cat: "果樹",
      yieldKg10a: { v: 1152, src: "S3", note: "県平均（R2）" },
      priceYenKg: { v: 243, src: "S3", calc: true, note: "販売金額269,083千円÷1,108t（R2）" },
      costRate: { v: 0.45, kari: true }, laborH10a: { v: 200, kari: true },
      months: { plant: [], harvest: [1, 2, 3], income: [2, 3, 4] },
      typhoonExp: 0.5, facility: "露地（樹園地）", transport: { air: false, ship: true },
    },
    /* ---------- 2026-07-12 追加品目（単価=S1市場年報の実測値・単収=S2県統計からの計算値。
       作期・経費率・労働時間は目安の仮値で編集前提） ---------- */
    { id: "tomato", name: "トマト（施設・冬春）", cat: "野菜",
      yieldKg10a: { v: 5473, src: "S2", calc: true, note: "県平均（3,010t÷55ha）" },
      priceYenKg: { v: 317, src: "S1", note: "品名トマト年間平均（中玉は554円/kg）" },
      costRate: { v: 0.5, kari: true }, laborH10a: { v: 800, kari: true },
      months: { plant: [9], harvest: [11, 12, 1, 2, 3, 4, 5], income: [12, 1, 2, 3, 4, 5, 6] },
      typhoonExp: 0.35, facility: "パイプハウス", transport: { air: true, ship: false } },
    { id: "minitomato", name: "ミニトマト（施設・冬春）", cat: "野菜",
      yieldKg10a: { v: 4000, kari: true, note: "県の統計に単独の行がなく単収は不明（要確認・自分の実績で上書き前提）" },
      priceYenKg: { v: 720, src: "S1", note: "品名ペティトマト年間平均" },
      costRate: { v: 0.5, kari: true }, laborH10a: { v: 900, kari: true },
      months: { plant: [9], harvest: [11, 12, 1, 2, 3, 4, 5], income: [12, 1, 2, 3, 4, 5, 6] },
      typhoonExp: 0.35, facility: "パイプハウス", transport: { air: true, ship: false } },
    { id: "kyuri", name: "きゅうり（施設・冬春）", cat: "野菜",
      yieldKg10a: { v: 4215, src: "S2", calc: true, note: "県平均（3,330t÷79ha）" },
      priceYenKg: { v: 425, src: "S1", note: "品名短形きゅうり年間平均" },
      costRate: { v: 0.5, kari: true }, laborH10a: { v: 800, kari: true },
      months: { plant: [9, 10], harvest: [11, 12, 1, 2, 3, 4, 5, 6], income: [12, 1, 2, 3, 4, 5, 6, 7] },
      typhoonExp: 0.35, facility: "パイプハウス", transport: { air: true, ship: false } },
    { id: "suika", name: "すいか（春）", cat: "野菜",
      yieldKg10a: { v: 2642, src: "S2", calc: true, note: "県平均（2,140t÷81ha）" },
      priceYenKg: { v: 272, src: "S1" },
      costRate: { v: 0.45, kari: true }, laborH10a: { v: 150, kari: true },
      months: { plant: [2, 3], harvest: [5, 6, 7], income: [6, 7, 8] },
      typhoonExp: 0.45, facility: "露地", transport: { air: false, ship: true } },
    { id: "togan", name: "とうがん（冬春）", cat: "野菜",
      yieldKg10a: { v: 3768, src: "S2", calc: true, note: "県平均（2,336t÷62ha）" },
      priceYenKg: { v: 155, src: "S1" },
      costRate: { v: 0.45, kari: true }, laborH10a: { v: 120, kari: true },
      months: { plant: [9, 10], harvest: [12, 1, 2, 3, 4], income: [1, 2, 3, 4, 5] },
      typhoonExp: 0.25, facility: "露地", transport: { air: false, ship: true } },
    { id: "hechima", name: "へちま（夏）", cat: "野菜",
      yieldKg10a: { v: 2916, src: "S2", calc: true, note: "県平均（1,079t÷37ha）" },
      priceYenKg: { v: 306, src: "S1" },
      costRate: { v: 0.45, kari: true }, laborH10a: { v: 400, kari: true },
      months: { plant: [3, 4], harvest: [5, 6, 7, 8, 9], income: [6, 7, 8, 9, 10] },
      typhoonExp: 0.75, facility: "露地", transport: { air: true, ship: false } },
    { id: "nasu", name: "なす（施設・冬春）", cat: "野菜",
      yieldKg10a: { v: 4250, src: "S2", calc: true, note: "県平均（1,190t÷28ha）" },
      priceYenKg: { v: 285, src: "S1", note: "品名中長なす年間平均" },
      costRate: { v: 0.5, kari: true }, laborH10a: { v: 700, kari: true },
      months: { plant: [9], harvest: [11, 12, 1, 2, 3, 4, 5, 6], income: [12, 1, 2, 3, 4, 5, 6, 7] },
      typhoonExp: 0.35, facility: "パイプハウス", transport: { air: true, ship: false } },
    { id: "chingen", name: "ちんげんさい（冬春）", cat: "野菜",
      yieldKg10a: { v: 1330, src: "S2", calc: true, note: "県平均（798t÷60ha）" },
      priceYenKg: { v: 408, src: "S1", calc: true, note: "かぶチンゲンサイ425円とチンゲンサイ355円の加重平均" },
      costRate: { v: 0.5, kari: true }, laborH10a: { v: 250, kari: true },
      months: { plant: [10, 11, 12, 1], harvest: [11, 12, 1, 2, 3], income: [12, 1, 2, 3, 4] },
      typhoonExp: 0.25, facility: "露地・平張", transport: { air: true, ship: false } },
    { id: "lettuce", name: "レタス（冬春）", cat: "野菜",
      yieldKg10a: { v: 1619, src: "S2", calc: true, note: "県平均（3,660t÷226ha）" },
      priceYenKg: { v: 162, src: "S1", note: "玉レタス。サニーレタスは262円/kg" },
      costRate: { v: 0.5, kari: true }, laborH10a: { v: 180, kari: true },
      months: { plant: [10, 11], harvest: [12, 1, 2, 3], income: [1, 2, 3, 4] },
      typhoonExp: 0.25, facility: "露地", transport: { air: false, ship: true } },
    { id: "cabbage", name: "キャベツ（冬春）", cat: "野菜",
      yieldKg10a: { v: 2552, src: "S2", calc: true, note: "県平均（4,950t÷194ha）" },
      priceYenKg: { v: 129, src: "S1", note: "県内産野菜の取扱数量1位" },
      costRate: { v: 0.5, kari: true }, laborH10a: { v: 130, kari: true },
      months: { plant: [9, 10, 11], harvest: [12, 1, 2, 3, 4], income: [1, 2, 3, 4, 5] },
      typhoonExp: 0.25, facility: "露地", transport: { air: false, ship: true } },
    { id: "horenso", name: "ほうれんそう（冬春）", cat: "野菜",
      yieldKg10a: { v: 1150, src: "S2", calc: true, note: "県平均（690t÷60ha）" },
      priceYenKg: { v: 382, src: "S1" },
      costRate: { v: 0.5, kari: true }, laborH10a: { v: 250, kari: true },
      months: { plant: [10, 11, 12], harvest: [11, 12, 1, 2, 3], income: [12, 1, 2, 3, 4] },
      typhoonExp: 0.25, facility: "露地・平張", transport: { air: true, ship: false } },
    { id: "karashina", name: "からしな（シマナー）", cat: "野菜",
      yieldKg10a: { v: 1415, src: "S2", calc: true, note: "県平均（552t÷39ha）" },
      priceYenKg: { v: 413, src: "S1" },
      costRate: { v: 0.5, kari: true }, laborH10a: { v: 250, kari: true },
      months: { plant: [10, 11, 12], harvest: [11, 12, 1, 2, 3], income: [12, 1, 2, 3, 4] },
      typhoonExp: 0.25, facility: "露地", transport: { air: true, ship: false } },
    { id: "komatsuna", name: "こまつな（冬春）", cat: "野菜",
      yieldKg10a: { v: 1681, src: "S2", calc: true, note: "県平均（622t÷37ha）" },
      priceYenKg: { v: 376, src: "S1" },
      costRate: { v: 0.5, kari: true }, laborH10a: { v: 250, kari: true },
      months: { plant: [10, 11, 12], harvest: [11, 12, 1, 2, 3], income: [12, 1, 2, 3, 4] },
      typhoonExp: 0.25, facility: "露地・平張", transport: { air: true, ship: false } },
    { id: "nira", name: "にら（周年）", cat: "野菜",
      yieldKg10a: { v: 2031, src: "S2", calc: true, note: "県平均（264t÷13ha）" },
      priceYenKg: { v: 737, src: "S1" },
      costRate: { v: 0.5, kari: true }, laborH10a: { v: 500, kari: true },
      months: { plant: [3, 4], harvest: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], income: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] },
      typhoonExp: 0.4, facility: "露地・平張", transport: { air: true, ship: false } },
    { id: "papaya", name: "青パパイヤ（野菜）", cat: "野菜",
      yieldKg10a: { v: 3145, src: "S2", calc: true, note: "県平均（346t÷11ha・面積が小さく粗い）" },
      priceYenKg: { v: 164, src: "S1" },
      costRate: { v: 0.45, kari: true }, laborH10a: { v: 300, kari: true },
      months: { plant: [3, 4], harvest: [7, 8, 9, 10, 11, 12], income: [8, 9, 10, 11, 12, 1] },
      typhoonExp: 0.75, facility: "露地", transport: { air: false, ship: true } },
    { id: "moui", name: "モーウイ（赤毛瓜）", cat: "野菜",
      yieldKg10a: { v: 2500, kari: true, note: "県統計に該当行がなく単収は不明（要確認）" },
      priceYenKg: { v: 181, src: "S1" },
      costRate: { v: 0.45, kari: true }, laborH10a: { v: 150, kari: true },
      months: { plant: [3, 4], harvest: [6, 7, 8, 9], income: [7, 8, 9, 10] },
      typhoonExp: 0.6, facility: "露地", transport: { air: false, ship: true } },
    { id: "shimatogarashi", name: "島トウガラシ", cat: "野菜",
      yieldKg10a: { v: 500, kari: true, note: "県統計の「とうがらし」はR4で3ha・24t（800kg/10a）だが島トウガラシ単独の行はなく仮値（要確認）" },
      priceYenKg: { v: 1612, src: "S1" },
      costRate: { v: 0.45, kari: true }, laborH10a: { v: 600, kari: true, note: "収穫の手摘みに時間がかかる" },
      months: { plant: [3, 4], harvest: [6, 7, 8, 9, 10, 11], income: [7, 8, 9, 10, 11, 12] },
      typhoonExp: 0.6, facility: "露地", transport: { air: true, ship: false } },
    { id: "kansho", name: "かんしょ（紅いも）", cat: "野菜",
      yieldKg10a: { v: 1250, src: "S2", calc: true, note: "令和5年産（2,350t÷188ha。令和4年産は県統計に記載なし）" },
      priceYenKg: { v: 336, src: "S1", note: "品名紅甘藷。加工向け契約は別相場（要確認）" },
      costRate: { v: 0.45, kari: true }, laborH10a: { v: 100, kari: true },
      months: { plant: [4, 5, 6], harvest: [10, 11, 12, 1], income: [11, 12, 1, 2] },
      typhoonExp: 0.15, facility: "露地", transport: { air: false, ship: true } },
    { id: "taimo", name: "田いも（ターンム）", cat: "野菜",
      yieldKg10a: { v: 1811, src: "S2", calc: true, note: "県統計「水いも」（326t÷18ha）" },
      priceYenKg: { v: 819, src: "S1", note: "品名煮田芋（加工済みの単価。生の相場は別・要確認）" },
      costRate: { v: 0.5, kari: true }, laborH10a: { v: 400, kari: true },
      months: { plant: [4, 5, 6], harvest: [11, 12, 1, 2], income: [12, 1, 2, 3] },
      typhoonExp: 0.2, facility: "水田", transport: { air: false, ship: true } },
    { id: "banana", name: "バナナ（島バナナ含む）", cat: "果樹",
      yieldKg10a: { v: 1063, src: "S2", calc: true, note: "県平均（85t÷8ha・結果樹面積ベース）" },
      priceYenKg: { v: 250, src: "S1", note: "品名バナナ。島バナナは436円/kg" },
      costRate: { v: 0.4, kari: true }, laborH10a: { v: 250, kari: true },
      months: { plant: [], harvest: [6, 7, 8, 9, 10], income: [7, 8, 9, 10, 11] },
      typhoonExp: 0.85, facility: "露地（倒伏に弱い）", transport: { air: true, ship: false } },
    { id: "passion", name: "パッションフルーツ", cat: "果樹",
      yieldKg10a: { v: 944, src: "S2", calc: true, note: "県平均（85t÷9ha・結果樹面積ベース）" },
      priceYenKg: { v: 1587, src: "S1" },
      costRate: { v: 0.45, kari: true }, laborH10a: { v: 300, kari: true },
      months: { plant: [], harvest: [5, 6, 7, 8], income: [6, 7, 8, 9] },
      typhoonExp: 0.5, facility: "露地・平張", transport: { air: true, ship: false } },
    { id: "dragon", name: "ドラゴンフルーツ", cat: "果樹",
      yieldKg10a: { v: 567, src: "S2", calc: true, note: "県平均（17t÷3ha・面積が小さく誤差大）" },
      priceYenKg: { v: 1066, src: "S1", note: "品名ピタヤ" },
      costRate: { v: 0.45, kari: true }, laborH10a: { v: 250, kari: true },
      months: { plant: [], harvest: [6, 7, 8, 9, 10, 11], income: [7, 8, 9, 10, 11, 12] },
      typhoonExp: 0.5, facility: "露地（支柱栽培）", transport: { air: true, ship: false } },
    { id: "mikan", name: "温州みかん（早生）", cat: "果樹",
      yieldKg10a: { v: 458, src: "S2", calc: true, note: "県統計「みかん」（110t÷24ha・結果樹面積ベース）" },
      priceYenKg: { v: 373, src: "S1", calc: true, note: "Ⅱ-13産地別の県内産みかん年間平均（11,296千円÷30.3t）。市場経由量が少なく参考値" },
      costRate: { v: 0.45, kari: true }, laborH10a: { v: 200, kari: true },
      months: { plant: [], harvest: [9, 10, 11], income: [10, 11, 12] },
      typhoonExp: 0.5, facility: "露地（樹園地）", transport: { air: false, ship: true } },
  ];

  /* ---------- さとうきび ---------- */
  const KIBI = {
    yield: {
      note: "10a当たり収量kg",
      r5: { natsu: { v: 6500, src: "S5" }, haru: { v: 4650, src: "S5" }, kabudashi: { v: 4640, src: "S5" }, kei: { v: 5020, src: "S5" } },
      r4: { natsu: { v: 7180, src: "S5", note: "令和4年産確定値（S5内の参考記載）" }, haru: { v: 4580, src: "S5" }, kabudashi: { v: 4920, src: "S5" }, kei: { v: 5390, src: "S5" } },
      r6kei: { v: 6267, src: "S6", note: "令和6年産・県計（豊作年）" },
      r6region: { okinawa: { v: 6145, src: "S6" }, miyako: { v: 6450, src: "S6" }, yaeyama: { v: 6046, src: "S6" } },
    },
    kabudashiShare: { v: 0.684, src: "S6", note: "収穫面積の68.4%が株出し（R6）" },
    tedori: {
      totalYenT: { v: 25459, src: "S8", note: "令和5/6年期・分蜜糖県計のトン当たり手取り（取引価格＋交付金）" },
      breakdown: { genryo: { v: 8212, src: "S8", calc: true }, kofukin: { v: 17248, src: "S8", calc: true }, note: "内訳は総額÷原料処理量の計算値（原典に印字なし）" },
      gonmitsuYenT: { v: 26186, src: "S8", note: "含蜜糖向け（多良間・小浜等）。本ツールの計算は分蜜糖のみ対応" },
    },
    kofukin: {
      baseYenT: { v: 16860, src: "S7", note: "令和7年産・基準糖度帯13.1〜14.3度" },
      tokudoStep: { v: 100, src: "S7", note: "糖度0.1度ごとに±100円/t" },
      bandLow: 13.1, bandHigh: 14.3,
      avgTokudo: { v: 13.8, src: "S6", note: "令和6年産平均甘しゃ糖度（前年14.6・平年14.4）" },
      youken: { src: "S25", note: "交付対象要件: A-1認定農業者等／A-2収穫面積1.0ha以上／A-2⑤基幹作業の委託（委託面積1/2以上）／A-3協業組織4.5ha以上／A-4共同利用組織。該当しないと交付金は受け取れない" },
    },
    seisanhi: {
      note: "令和6年産生産費統計・沖縄（10a当たり）",
      hiyoGokei: { v: 127225, src: "S9", note: "費用合計（家族労働費37,088円を含む）" },
      buzaihi: { v: 86297, src: "S9", note: "物財費" },
      koyoRodo: { v: 3840, src: "S9", note: "雇用労働費（原典に直接記載。労働費40,928−家族労働費37,088と整合）" },
      chinshakuryo: { v: 34613, src: "S9", note: "賃借料及び料金（ハーベスタ委託等を含む）" },
      laborH: { v: 36.56, src: "S9", note: "10a当たり労働時間（家族33.89＋雇用2.67）" },
    },
    harvester: {
      yenT: { v: 5500, src: "S10", old: true, note: "ハーベスタ委託 概ね5,500円/t（5,000〜7,000円）。2008年発表の佐敷町調査値で古い（要確認・現行の公的料金表は未発見）" },
      shareR6: { v: 0.901, src: "S6", note: "機械収穫率90.1%（R6）" },
    },
    months: { plant: { natsu: [7, 8, 9], haru: [2, 3, 4] }, harvest: [1, 2, 3], income: [1, 2, 3], incomeNote: "きび代金は製糖期に集中（原典の収穫期は12〜4月頃。本ツールは中心の1〜3月に丸めた）。交付金は搬入後の支払い" },
    typhoonNote: "台風で倒伏しても全滅しにくく糖度低下・減収にとどまることが多い（園芸品目との最大の違い）。ただし大型直撃年は減収する（R5年産は前年比7%減・S5）",
  };

  /* ---------- 台風 ---------- */
  const TYPHOON = {
    heinen: {
      annual: { v: 7.7, src: "S11", note: "沖縄地方への年間接近数の平年値" },
      monthly: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0.4, 6: 0.6, 7: 1.5, 8: 2.2, 9: 1.9, 10: 1.1, 11: 0.3, 12: 0 },
      monthlySrc: "S11",
      monthlyNote: "気象庁の平年値（1991〜2020年・沖縄地方）の公表値そのまま。7〜10月がピーク",
    },
    recent: { 2022: 6, 2023: 6, 2024: 8, 2025: 7, src: "S12" },
    damageExample: { v: "約10,000ha・約5.5億円", src: "S13", note: "令和5年台風6号の沖縄県農作物被害（速報値・確定値はより大きい可能性）" },
    damageRateDefaults: {
      note: "被害率の公的データは弱い。以下は完全に仮定の初期値（仮）で、農家自身の経験で必ず上書きする前提",
      roji: { v: 0.4, kari: true }, hiraburi: { v: 0.25, kari: true }, pipe: { v: 0.3, kari: true }, taiko: { v: 0.1, kari: true },
    },
  };

  /* ---------- 保険・共済 ---------- */
  const INSURANCE = {
    shunyuHoken: {
      src: "S14",
      scheme: "青色申告者が対象。保険期間の収入が基準収入の9割を下回った場合、下回った額の9割を上限に補填",
      hoshoGendo: { note: "補償限度は基準収入の9〜5割から選択。支払率は保険方式9〜5割・積立方式9〜1割", src: "S15" },
      kokko: { note: "国庫補助: 保険料50%・積立金75%・付加保険料50%以内", src: "S15" },
      tsunagiExample: { note: "基準収入1,000万円・最大補償で販売収入500万円まで減少見込みの場合、280万円程度を限度につなぎ融資可", src: "S15" },
      premiumNote: "保険料の具体額は農家ごとに異なる（未確定）。加入・見積はNOSAI・農協の収入保険窓口で確認",
    },
    engeiKyosai: {
      src: "S16",
      fuho: "付保割合は基本4〜8割から選択、特約で10割まで",
      kokko: "掛金の国庫負担50%",
      premiumNote: "掛金率は過去20か年の被害率を基礎に3年ごと改定（沖縄の具体率は公表ページに記載なし・要確認）",
    },
    contact: "最終確認先: NOSAI沖縄（沖縄県農業共済組合）・お住まいの市町村窓口・沖縄県農業改良普及センター",
  };

  /* ---------- 輸送・出荷 ---------- */
  const TRANSPORT = {
    current: {
      src: "S17", name: "おきなわ農林水産物県外出荷促進事業（令和8年度）", note: "補助単価は基準額と実費単価の低い方。R7年度から旧・条件不利性解消事業の後継（S26）",
      kijun: {
        note: "基準額（円/kg）",
        hontoKengai: { air: { seika: 50, kaki: 64 }, ship: { seika: 17, kaki: 27 } },
        miyakoHonto: { air: 73 },
      },
    },
    old: {
      src: "S18", name: "農林水産物条件不利性解消事業（令和4〜6年度・旧制度）", note: "旧制度の基本額（円/kg・県外向け）。現行制度の島別基準額の代替参考値として使用（要確認）",
      kihon: { honto: 37, miyako: 65, ishigaki: 72, kume: 25, daito: 57, yonaguni: 98, tarama: 82 },
    },
    freightNote: "実運賃（航空・船便・宅配の実勢）は業者・時期で変動するため既定値を持たない。伝票の実額を入力する方式とする",
    feeDefaults: {
      note: "手数料の初期値（仮・編集前提）",
      ichiba: { v: 0.085, kari: true, note: "卸売市場手数料の目安" },
      jaKyohan: { v: 0.13, kari: true, note: "JA共販の販売手数料＋共選料の目安" },
      chokubai: { v: 0.15, kari: true, note: "直売所の販売手数料の目安" },
      shizai: { v: 30, kari: true, note: "出荷資材 円/kg の目安" },
    },
  };

  /* ---------- 燃油・資材 ---------- */
  const FUEL = {
    aJuyu: { v: 113.1, src: "S19", note: "A重油 円/L（令和6年8月・全国）" },
    shizaiIndex: { v: 120.6, src: "S20", note: "農業生産資材価格指数（令和6年・令和2年=100）" },
    nosanbutsuIndex: { v: 117.3, src: "S20", note: "農産物価格指数（同上）" },
    safetyNet: { src: "S19", note: "施設園芸セーフティネット: 補填単価（過去7中5年平均との差額）×購入数量の70%。国と生産者の積立1:1" },
  };

  /* ---------- 施設建設費（沖縄の補助事業実例からの計算値） ---------- */
  const FACILITY = {
    note: "国庫補助事業の総事業費ベースの㎡単価（計算値）。農家負担はこの一部",
    kajuOnshitsu: { v: 15000, src: "S3", calc: true, note: "果樹温室（マンゴー）約15,000円/㎡" },
    kyokaPipe: { vLow: 9400, vHigh: 12700, src: "S3", calc: true, note: "強化型パイプハウス 約9,400〜12,700円/㎡（マンゴー向け事例の幅。パイン向けを含めると約8,600〜13,200円/㎡）" },
    hirabari: { vLow: 6100, vHigh: 7000, src: "S4", calc: true, note: "小ギク平張施設 約6,100〜7,000円/㎡" },
  };

  /* ---------- 共通ヘルパ ---------- */
  function srcOf(x) { return x && x.src ? SOURCES[x.src] : null; }
  function flagLabel(x) {
    if (!x) return "";
    const f = [];
    /* 出どころの札。手で打った値（jibun）と、根拠を示せる値（jisseki・kiroku）を分ける。
       融資の窓口で根拠を聞かれたとき、答えられる値かどうかが違うため。 */
    if (x.jisseki) f.push("実績から" + (x.nen ? "・" + x.nen + "年" : ""));
    if (x.kiroku) f.push("記録から" + (x.mai ? "・" + x.mai + "件" : "") + (x.nen ? "・" + x.nen + "年" : ""));
    if (x.jibun) f.push("自分の値");
    if (x.kari) f.push("仮");
    if (x.calc) f.push("計算値");
    if (x.old) f.push("古い調査値");
    if (x.natl) f.push("国統計・県平均");
    return f.length ? "（" + f.join("・") + "）" : "";
  }
  // 出典表示用の1行（ツール側の .src 欄で使う）
  function srcLine(x) {
    if (x && x.jisseki) return "実績の診断に入れた数字から計算した値"
      + (x.nen ? "（" + x.nen + "年）" : "") + (x.note ? "。" + x.note : "");
    if (x && x.kiroku) return "自分の記録から機械が数えた値"
      + (x.mai ? "（" + x.mai + "件" + (x.nen ? "・" + x.nen + "年" : "") + "）" : "")
      + (x.note ? "。" + x.note : "");
    if (x && x.jibun) return "自分で入力した値" + (x.note ? "。" + x.note : "");
    const s = srcOf(x);
    if (!s) return x && x.kari ? "仮定値（出典なし・要確認、実態に合わせて修正してください）" : "";
    return `${s.name}（${x.year || s.year}）` + flagLabel(x);
  }

  /* ---------- 利用者による上書き・追加品目のマージ ----------
     保存先はこの端末の localStorage（キー: myfarm-agri-compass-pro:cropCustom）だけ。
     サーバーには送られず、他の端末・他の利用者からは見えない。
     編集ページ: tools/hinmoku.html（品目データの管理） */
  function jibunVal(v) { return { v: +v, jibun: true }; }
  try {
    const rawCC = localStorage.getItem("myfarm-agri-compass-pro:cropCustom");
    if (rawCC) {
      const cc = JSON.parse(rawCC) || {};
      const ov = cc.overrides || {};
      Object.keys(ov).forEach(function (id) {
        const c = CROPS.find(function (x) { return x.id === id; });
        if (!c || !ov[id]) return;
        ["yieldKg10a", "priceYenKg", "yieldHon10a", "priceYenHon", "costRate", "laborH10a"].forEach(function (k) {
          const raw = ov[id][k];
          if (raw == null) return;
          /* 上書きの値は2通り受け取る。
             数だけ  … 品目と単価の画面で手で打った値（自分の値）
             オブジェクト { v, jisseki|kiroku, nen, mai } … 実績や記録から機械が作った値
             どちらでも動くようにしてあるのは、既に保存済みの端末を壊さないため。 */
          const obj = (typeof raw === "object") ? raw : { v: raw, jibun: true };
          if (obj.v == null || isNaN(+obj.v)) return;
          const old = c[k];
          const moto = (old && old.v != null) ? "元の値: " + old.v + flagLabel(old) : "";
          c[k] = {
            v: +obj.v, note: moto,
            jibun: !!obj.jibun, jisseki: !!obj.jisseki, kiroku: !!obj.kiroku,
            nen: obj.nen || null, mai: obj.mai || null,
          };
        });
        if (ov[id].typhoonExp != null && !isNaN(+ov[id].typhoonExp)) c.typhoonExp = Math.min(1, Math.max(0, +ov[id].typhoonExp));
        /* 入金月の自分の値（作付けの決定・資金繰りの月マスから書き戻される）を反映する */
        if (ov[id].months && Array.isArray(ov[id].months.income) && ov[id].months.income.length) {
          c.months = Object.assign({}, c.months, { income: ov[id].months.income.slice() });
        }
      });
      (cc.custom || []).forEach(function (sc) {
        if (!sc || !sc.id || !sc.name) return;
        if (CROPS.some(function (x) { return x.id === sc.id; })) return;
        const c = {
          id: sc.id, name: sc.name, cat: sc.cat || "その他", custom: true,
          costRate: jibunVal(sc.costRate != null ? sc.costRate : 0.5),
          laborH10a: jibunVal(sc.laborH10a != null ? sc.laborH10a : 0),
          months: {
            plant: (sc.months && sc.months.plant) || [],
            harvest: (sc.months && sc.months.harvest) || [],
            income: (sc.months && sc.months.income) || [],
          },
          typhoonExp: (sc.typhoonExp != null && !isNaN(+sc.typhoonExp)) ? Math.min(1, Math.max(0, +sc.typhoonExp)) : 0.3,
          facility: sc.facility || "", transport: { air: !!(sc.transport && sc.transport.air), ship: !!(sc.transport && sc.transport.ship) },
        };
        if (sc.unit === "本") { c.yieldHon10a = jibunVal(sc.yieldHon10a || 0); c.priceYenHon = jibunVal(sc.priceYenHon || 0); }
        else { c.yieldKg10a = jibunVal(sc.yieldKg10a || 0); c.priceYenKg = jibunVal(sc.priceYenKg || 0); }
        CROPS.push(c);
      });
    }
  } catch (e) { /* 保存データが壊れていても既定値で動く */ }

  window.DATA = { SOURCES, CROPS, KIBI, TYPHOON, INSURANCE, TRANSPORT, FUEL, FACILITY, srcOf, srcLine, flagLabel,
    DISCLAIMER: "本ツールの数値は公表資料に基づく参考値と、（仮）と表示した仮定値です。金額の断定ではなく判断材料の比較です。制度・共済・価格の最終確認は NOSAI沖縄・市町村窓口・JA・沖縄県農業改良普及センター へ。" };
})();
