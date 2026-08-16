# -*- coding: utf-8 -*-
"""確定申告（収支内訳書・農業所得用）に近い数字を1件、実績の診断へ通す検査。

数字は実在の農家のものではなく、この検査のために作った見本の農家（千葉県・水稲＋露地野菜）。
ただし科目は収支内訳書の実際の欄に合わせ、8分類への写し方も検査の中に書いてある。

確かめること
  1. 入れた数字から、品目ごとの所得と時給が計算される
  2. 共通経費の配り方（面積の比／売上の比）を切り替えると、品目ごとの所得が変わる
  3. 「この実績を前提にする」で、単収・単価・経費率・労働時間の4つとも書き込まれる
  4. 書き込まれた単価が、手計算（売上÷収穫量）と一致する
  5. 書き込まれた経費率が、手計算（(直接経費＋配分した共通経費)÷売上）と一致する
  6. 経費率が0.05〜0.95の外になる品目は、その経費率を書き込まない

手計算はこのファイルの中で、申告書の数字から素のまま組み立てる（画面の計算は使わない）。
画面の表示は万円などに丸めて出るので、突き合わせのときだけ画面側の書式関数へ手計算の値を渡し、
文字の並びを比べる（比べているのは値であって、書式ではない）。

走らせ方:  python tests/try_kakuteishinkoku.py
"""
import json
import math
import os
import socket
import subprocess
import sys
import time

from playwright.sync_api import sync_playwright

KOKO = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(KOKO)
PORT = 8204
BASE = f'http://127.0.0.1:{PORT}'
NS = 'myfarm-agri-compass-pro'
CHIIKI = 'chiba'

ok = 0
ng = 0
fugokaku = []
noteru = []       # 実測値のひかえ（最後に出す）


def check(na, jouken, soe=''):
    global ok, ng
    if jouken:
        ok += 1
    else:
        ng += 1
        fugokaku.append(f'{na}  {soe}')


def js_round(x):
    """JavaScript の Math.round と同じ丸め（.5 は上へ。負の数の扱いが Python の round と違う）"""
    return math.floor(x + 0.5)


# ============================================================
# 見本の確定申告（収支内訳書・農業所得用）— 実在の農家のものではない
#   千葉県の水稲＋露地野菜。2025年分（去年の申告）を想定
# ============================================================

# 収入金額（販売金額）— 収支内訳書の「1 収入金額」から品目ごとに写す
URIAGE = [
    {'cropId': 'cb_rice',    'name': '水稲（主食用米）',   'areaA': 100, 'qty': 5000,  'sales': 1150000},
    {'cropId': 'cb_cabbage', 'name': 'キャベツ（秋冬どり）', 'areaA': 80,  'qty': 32000, 'sales': 2560000},
    {'cropId': 'cb_radish',  'name': 'だいこん（冬どり）',   'areaA': 60,  'qty': 27000, 'sales': 2430000},
]
# 家事消費・事業消費・雑収入は、この見本では0円とした
# （実績の診断の画面には、この3つを入れる欄が無く、品目ごとの売上だけを受け取るため）

# 経費 — 収支内訳書の科目名のまま並べ、画面の8分類のどこへ写すかを右に書く
SHINKOKU_KEIHI = [
    ('種苗費',           320000, '種苗'),
    ('肥料費',           610000, '肥料'),
    ('農薬衛生費',       340000, '農薬'),
    ('諸材料費',         180000, '資材'),
    ('農具費',           120000, '資材'),
    ('動力光熱費',       280000, '動力光熱'),
    ('荷造運賃手数料',   520000, '出荷運賃手数料'),
    ('雇人費',           450000, '雇人費'),
    ('修繕費',           210000, 'その他'),
    ('減価償却費',       680000, 'その他'),
    ('地代・賃借料',     240000, 'その他'),
    ('租税公課',          90000, 'その他'),
    ('農業共済掛金',      70000, 'その他'),
    ('利子割引料',        40000, 'その他'),
    ('作業用衣料費',      30000, 'その他'),
    ('雑費',              60000, 'その他'),
]
EXP_CATS = ['種苗', '肥料', '農薬', '資材', '動力光熱', '出荷運賃手数料', '雇人費', 'その他']

# 品目だけにかかったと分かる経費（8分類の内数として、品目の行に書く）
CHOKUSETSU = {'cb_rice': 480000, 'cb_cabbage': 900000, 'cb_radish': 620000}

# 労働時間（本人・家族）。画面のつまみの目盛りに合わせた値
ROUDOU = {'sd': 5, 'sh': 8, 'sm': 11, 'fd': 2, 'fh': 5, 'fm': 8}
SHUU_PER_TSUKI = 4.33

# ---- ここから手計算（画面の計算は使わない） ----
KEIHI8 = {k: 0 for k in EXP_CATS}
for _na, _en, _cat in SHINKOKU_KEIHI:
    KEIHI8[_cat] += _en

URIAGE_KEI = sum(u['sales'] for u in URIAGE)            # 6,140,000
KEIHI_KEI = sum(KEIHI8.values())                        # 4,240,000
SHOTOKU = URIAGE_KEI - KEIHI_KEI                        # 1,900,000
CHOKU_KEI = sum(CHOKUSETSU.values())                    # 2,000,000
KYOUTSUU = KEIHI_KEI - CHOKU_KEI                        # 2,240,000

ROUDOU_HONNIN = js_round(ROUDOU['sd'] * ROUDOU['sh'] * ROUDOU['sm'] * SHUU_PER_TSUKI)   # 1,905
ROUDOU_KAZOKU = js_round(ROUDOU['fd'] * ROUDOU['fh'] * ROUDOU['fm'] * SHUU_PER_TSUKI)   # 346
ROUDOU_KEI = ROUDOU_HONNIN + ROUDOU_KAZOKU                                              # 2,251


def te_keisan(labor10a, wari):
    """申告書の数字から、品目ごとのもうけ・時給・書き戻す値を素のまま組み立てる。
       labor10a … 品目マスタの10a当たり労働時間（入力データとして画面から読む）
       wari     … 'area'（面積の比）か 'sales'（売上の比）"""
    omomi = {u['cropId']: labor10a[u['cropId']] * (u['areaA'] / 10) for u in URIAGE}
    omomi_kei = sum(omomi.values())
    kijun_kei = sum((u['areaA'] / 10) if wari == 'area' else u['sales'] for u in URIAGE)
    out = {}
    for u in URIAGE:
        area10a = u['areaA'] / 10
        kijun = area10a if wari == 'area' else u['sales']
        haibun = KYOUTSUU * kijun / kijun_kei
        keihi = CHOKUSETSU[u['cropId']] + haibun
        mouke = u['sales'] - keihi
        roudou = ROUDOU_KEI * omomi[u['cropId']] / omomi_kei
        out[u['cropId']] = {
            'name': u['name'], 'area10a': area10a, 'sales': u['sales'],
            'haibun': haibun, 'keihi': keihi, 'mouke': mouke,
            'jikyuu': mouke / roudou, 'per10a': mouke / area10a, 'roudou': roudou,
            'tanshu': js_round(u['qty'] / area10a),
            'tanka': js_round(u['sales'] / u['qty']),
            'hiritsu_nama': keihi / u['sales'],
            'labor10a': js_round(roudou / area10a),
        }
    return out


HAISHIN = f'''
const http=require("http"),fs=require("fs"),path=require("path");
const ROOT={json.dumps(ROOT)};
const MIME={{".html":"text/html; charset=utf-8",".js":"text/javascript; charset=utf-8",
  ".css":"text/css; charset=utf-8",".png":"image/png",".jpg":"image/jpeg",".svg":"image/svg+xml",
  ".json":"application/json; charset=utf-8",".ico":"image/x-icon"}};
const s=http.createServer((q,r)=>{{
  let u=decodeURIComponent((q.url||"/").split("?")[0]);
  if(u.endsWith("/"))u+="index.html";
  const f=path.join(ROOT,u.replace(/^\\/+/,""));
  if(!f.startsWith(ROOT)){{r.writeHead(403);r.end();return;}}
  fs.readFile(f,(e,d)=>{{ if(e){{r.writeHead(404);r.end("no");}}
    else{{r.writeHead(200,{{"Content-Type":MIME[path.extname(f).toLowerCase()]||"application/octet-stream"}});r.end(d);}} }});
}});
s.keepAliveTimeout=60000;
s.listen({PORT},"127.0.0.1");
'''


def matsu(port, byou=8):
    kagiri = time.time() + byou
    while time.time() < kagiri:
        try:
            socket.create_connection(('127.0.0.1', port), 0.2).close()
            return True
        except OSError:
            time.sleep(0.1)
    return False


def hairu(pg, path, machi=800):
    pg.goto(f'{BASE}/{path}', wait_until='domcontentloaded')
    pg.wait_for_timeout(machi)


def tsumami_wo_awaseru(pg, eid, mokuhyou):
    """つまみ（range）を目盛りの矢印キーで目標値まで動かす。押して動かすのと同じ道筋"""
    el = pg.locator('#' + eid)
    el.focus()
    for _ in range(60):
        ima = float(pg.eval_on_selector('#' + eid, 'e => +e.value'))
        if abs(ima - mokuhyou) < 1e-9:
            return True
        pg.keyboard.press('ArrowRight' if ima < mokuhyou else 'ArrowLeft')
        pg.wait_for_timeout(30)
    return False


def hyou_wo_yomu(pg, table_id):
    """表の中身の行を読み、行の先頭の文字（品目名）で引けるようにして返す"""
    return pg.eval_on_selector(
        '#' + table_id,
        """t => {
          const out = {};
          t.querySelectorAll('tbody tr').forEach(tr => {
            const tds = [...tr.children].map(td => td.textContent.replace(/\\s+/g, ' ').trim());
            if (tds.length) out[tds[0]] = tds;
          });
          return out;
        }""")


def main():
    srv = subprocess.Popen(['node', '-e', HAISHIN],
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    if not matsu(PORT):
        print('配信が立ち上がりませんでした')
        srv.terminate()
        return 1
    try:
        with sync_playwright() as p:
            b = p.chromium.launch()
            pg = b.new_page(viewport={'width': 1280, 'height': 950})
            err = []
            soto = []
            pg.on('pageerror', lambda e: err.append(str(e)))
            pg.on('dialog', lambda d: d.accept())

            def michibiki(route):
                u = route.request.url
                if '127.0.0.1' in u:
                    route.continue_()
                else:
                    soto.append(u)
                    route.abort()
            pg.route('**/*', michibiki)
            pg.route('**/saba_settei.js', lambda route: route.fulfill(
                status=200, content_type='text/javascript; charset=utf-8',
                body="window.MFK_SABA_SETTEI = { url: '', namae: 'ためし' };"))

            # ---- 0. 端末を空にして、千葉県に切り替える ----
            hairu(pg, 'tools/checkup.html', 300)
            pg.evaluate("""([ns, reg]) => {
              localStorage.clear();
              localStorage.setItem(ns + ':mfkRegion', JSON.stringify(reg));
            }""", [NS, CHIIKI])
            hairu(pg, 'tools/checkup.html', 900)
            check('実績の診断が開く（千葉県）', pg.locator('h1').count() > 0)
            check('画面のエラーが無い（開いたところ）', not err, ' / '.join(err[:2]))

            # 品目マスタの10a当たり労働時間を読む（手計算の入力データ。計算そのものではない）
            labor10a = pg.evaluate("""(ids) => {
              const o = {};
              ids.forEach(function (id) {
                const c = DATA.CROPS.filter(function (x) { return x.id === id; })[0];
                o[id] = c && c.laborH10a ? c.laborH10a.v : null;
              });
              return o;
            }""", [u['cropId'] for u in URIAGE])
            check('3品目とも10a当たり労働時間が収録されている',
                  all(v for v in labor10a.values()), json.dumps(labor10a))
            noteru.append(f"品目マスタの10a当たり労働時間: {labor10a}")

            # ---- 1. 収入金額を品目の行へ写す ----
            pg.select_option('#addCropSel', 'cb_radish')
            pg.click('#addCropBtn')
            pg.wait_for_timeout(300)
            gyou = pg.locator('#cropRows .crop-row')
            check('品目の行が3つになる', gyou.count() == 3, str(gyou.count()))
            namae = [gyou.nth(i).locator('.cr-name').inner_text() for i in range(3)]
            check('3品目の名前が申告書の並びと合う',
                  namae == [u['name'] for u in URIAGE], str(namae))

            for i, u in enumerate(URIAGE):
                r = gyou.nth(i)
                r.locator('input[data-k="area"]').fill(str(u['areaA']))
                r.locator('input[data-k="qty"]').fill(str(u['qty']))
                r.locator('input[data-k="sales"]').fill(str(u['sales']))
                r.locator('input[data-k="direct"]').fill(str(CHOKUSETSU[u['cropId']]))
            pg.wait_for_timeout(300)

            # ---- 2. 経費8分類へ写す ----
            keihi = pg.locator('#expGrid input')
            check('経費の欄が8つある', keihi.count() == 8, str(keihi.count()))
            for i, cat in enumerate(EXP_CATS):
                keihi.nth(i).fill(str(KEIHI8[cat]))
            pg.wait_for_timeout(300)

            # ---- 3. 労働時間のつまみを合わせる ----
            for k, v in ROUDOU.items():
                check(f'つまみ {k} を {v} に合わせられる', tsumami_wo_awaseru(pg, k, v))
            pg.wait_for_timeout(500)
            check(f'本人の年間時間が手計算と合う（{ROUDOU_HONNIN}時間）',
                  pg.inner_text('#selfHours').replace(',', '') == str(ROUDOU_HONNIN),
                  pg.inner_text('#selfHours'))
            check(f'家族の年間時間が手計算と合う（{ROUDOU_KAZOKU}時間）',
                  pg.inner_text('#famHours').replace(',', '') == str(ROUDOU_KAZOKU),
                  pg.inner_text('#famHours'))

            # ---- 4. 全体の数字が申告書と合う ----
            def moji(v, kata='manUnit'):
                return pg.evaluate(f"(v) => CORE.fmt.{kata}(v)", v)

            check(f'売上合計が申告書と合う（{URIAGE_KEI:,}円）',
                  pg.inner_text('#kpiSales') == moji(URIAGE_KEI), pg.inner_text('#kpiSales'))
            check(f'経費合計が申告書と合う（{KEIHI_KEI:,}円）',
                  pg.inner_text('#kpiExp') == moji(KEIHI_KEI), pg.inner_text('#kpiExp'))
            check(f'農業所得が申告書と合う（{SHOTOKU:,}円）',
                  pg.inner_text('#kpiIncome') == moji(SHOTOKU), pg.inner_text('#kpiIncome'))
            zentai_jikyuu = js_round(SHOTOKU / ROUDOU_KEI)
            check(f'全体の時給が手計算と合う（{zentai_jikyuu}円）',
                  pg.inner_text('#kpiWage') == moji(zentai_jikyuu, 'num') + '円',
                  pg.inner_text('#kpiWage'))
            noteru.append(f'売上合計 {URIAGE_KEI:,}円 / 経費合計 {KEIHI_KEI:,}円 / '
                          f'農業所得 {SHOTOKU:,}円 / 時給 {zentai_jikyuu}円 / '
                          f'労働時間 {ROUDOU_KEI}時間')

            # ---- 5. 品目ごとの所得と時給（面積の比） ----
            te_area = te_keisan(labor10a, 'area')
            hyou = hyou_wo_yomu(pg, 'cropTbl')
            for u in URIAGE:
                t = te_area[u['cropId']]
                row = hyou.get(u['name'])
                check(f'品目別の表に「{u["name"]}」の行がある', bool(row), str(list(hyou.keys())))
                if not row:
                    continue
                check(f'{u["name"]} の売上が合う', row[2] == moji(t['sales']), f'{row[2]} 期待={moji(t["sales"])}')
                check(f'{u["name"]} の共通経費の配分が手計算と合う（{t["haibun"]:,.0f}円）',
                      row[4] == moji(js_round(t['haibun'])), f'{row[4]} 期待={moji(js_round(t["haibun"]))}')
                check(f'{u["name"]} のもうけが手計算と合う（{t["mouke"]:,.0f}円）',
                      row[5] == moji(js_round(t['mouke'])), f'{row[5]} 期待={moji(js_round(t["mouke"]))}')
                check(f'{u["name"]} の10a当たりが手計算と合う（{t["per10a"]:,.0f}円）',
                      row[6] == moji(js_round(t['per10a'])), f'{row[6]} 期待={moji(js_round(t["per10a"]))}')
                check(f'{u["name"]} の労働時間が手計算と合う（{t["roudou"]:,.0f}時間）',
                      row[7] == moji(js_round(t['roudou']), 'num') + 'h',
                      f'{row[7]} 期待={moji(js_round(t["roudou"]), "num")}h')
                check(f'{u["name"]} の時給が手計算と合う（{t["jikyuu"]:,.0f}円）',
                      row[8] == moji(js_round(t['jikyuu']), 'num') + '円',
                      f'{row[8]} 期待={moji(js_round(t["jikyuu"]), "num")}円')
            noteru.append('面積の比で割ったときの品目ごとのもうけ: '
                          + '／'.join(f'{v["name"]} {v["mouke"]:,.0f}円（時給 {v["jikyuu"]:,.0f}円）'
                                      for v in te_area.values()))

            # ---- 6. 配り方を売上の比に切り替えると、もうけが変わる ----
            pg.click('#allocSeg button[data-v="sales"]')
            pg.wait_for_timeout(400)
            te_sales = te_keisan(labor10a, 'sales')
            hyou2 = hyou_wo_yomu(pg, 'cropTbl')
            for u in URIAGE:
                t, t0 = te_sales[u['cropId']], te_area[u['cropId']]
                row = hyou2.get(u['name'])
                if not row:
                    check(f'売上の比でも「{u["name"]}」の行がある', False)
                    continue
                check(f'{u["name"]} 売上の比の共通経費が手計算と合う（{t["haibun"]:,.0f}円）',
                      row[4] == moji(js_round(t['haibun'])), f'{row[4]} 期待={moji(js_round(t["haibun"]))}')
                check(f'{u["name"]} 売上の比のもうけが手計算と合う（{t["mouke"]:,.0f}円）',
                      row[5] == moji(js_round(t['mouke'])), f'{row[5]} 期待={moji(js_round(t["mouke"]))}')
                check(f'{u["name"]} は割り方を変えるともうけが動く',
                      js_round(t['mouke']) != js_round(t0['mouke']),
                      f'面積比={t0["mouke"]:,.0f} 売上比={t["mouke"]:,.0f}')
            noteru.append('売上の比で割ったときの品目ごとのもうけ: '
                          + '／'.join(f'{v["name"]} {v["mouke"]:,.0f}円' for v in te_sales.values()))

            # 書き戻しの検査は、面積の比に戻してから行う
            pg.click('#allocSeg button[data-v="area"]')
            pg.wait_for_timeout(400)

            # ---- 7. 経費率が0.05〜0.95の外になる品目を、手計算で確かめておく ----
            soto_no_hinmoku = [u['cropId'] for u in URIAGE
                               if not (0.05 <= round(te_area[u['cropId']]['hiritsu_nama'], 2) <= 0.95)]
            check('手計算で、経費率が範囲の外になる品目が1件ある',
                  len(soto_no_hinmoku) == 1,
                  str({u['cropId']: round(te_area[u['cropId']]['hiritsu_nama'], 4) for u in URIAGE}))
            noteru.append('経費率（面積の比）: '
                          + '／'.join(f'{v["name"]} {v["hiritsu_nama"]:.4f}' for v in te_area.values()))

            jhyou = hyou_wo_yomu(pg, 'jissekiTbl')
            for u in URIAGE:
                t = te_area[u['cropId']]
                row = jhyou.get(u['name'])
                check(f'実績の表に「{u["name"]}」の行がある', bool(row), str(list(jhyou.keys())))
                if not row:
                    continue
                check(f'{u["name"]} 実績の単収が手計算と合う（{t["tanshu"]}）',
                      row[1].startswith(moji(t['tanshu'], 'num')), row[1])
                check(f'{u["name"]} 実績の単価が手計算と合う（{t["tanka"]}円）',
                      row[3].startswith(moji(t['tanka'], 'num')), row[3])
                if u['cropId'] in soto_no_hinmoku:
                    check(f'{u["name"]} は経費率が範囲の外なので実績の表でも空欄にする',
                          '要確認' in row[5], row[5])

            # ---- 8. 「この実績を前提にする」を押す ----
            pg.click('#jissekiApply')
            pg.wait_for_timeout(500)
            check('前提にした旨の知らせが出る', '前提にしました' in pg.inner_text('#jissekiMsg'),
                  pg.inner_text('#jissekiMsg')[:80])
            cc = pg.evaluate(f"() => JSON.parse(localStorage.getItem('{NS}:cropCustom') || 'null')")
            nen = pg.evaluate("() => +document.getElementById('yearSel').value")
            ov = (cc or {}).get('overrides') or {}
            check('3品目とも書き込まれる', sorted(ov.keys()) == sorted(CHOKUSETSU.keys()),
                  str(sorted(ov.keys())))

            kensuu = {}
            for u in URIAGE:
                cid = u['cropId']
                t = te_area[cid]
                o = ov.get(cid) or {}
                jkeys = sorted(k for k, v in o.items()
                               if isinstance(v, dict) and v.get('jisseki') is True)
                kensuu[u['name']] = jkeys

                check(f'{u["name"]} の単収が実績から入る（{t["tanshu"]}kg/10a）',
                      isinstance(o.get('yieldKg10a'), dict) and o['yieldKg10a'].get('jisseki') is True
                      and o['yieldKg10a']['v'] == t['tanshu'],
                      json.dumps(o.get('yieldKg10a'), ensure_ascii=False))
                # 4. 単価＝売上÷収穫量
                check(f'{u["name"]} の単価が手計算（売上÷収穫量＝{t["tanka"]}円）と一致する',
                      isinstance(o.get('priceYenKg'), dict) and o['priceYenKg']['v'] == t['tanka'],
                      json.dumps(o.get('priceYenKg'), ensure_ascii=False))
                # 3. 労働時間
                check(f'{u["name"]} の10a当たり労働時間が実績から入る（{t["labor10a"]}時間）',
                      isinstance(o.get('laborH10a'), dict) and o['laborH10a'].get('jisseki') is True
                      and o['laborH10a']['v'] == t['labor10a'],
                      json.dumps(o.get('laborH10a'), ensure_ascii=False))
                check(f'{u["name"]} の値に入力した年（{nen}年）が付く',
                      o.get('yieldKg10a', {}).get('nen') == nen, str(o.get('yieldKg10a')))

                if cid in soto_no_hinmoku:
                    # 6. 範囲の外の経費率は書き込まない
                    check(f'{u["name"]} は経費率が{t["hiritsu_nama"]:.2f}で範囲の外なので書き込まない',
                          'costRate' not in o, json.dumps(o.get('costRate'), ensure_ascii=False))
                    check(f'{u["name"]} は経費率以外の3つは書き込む',
                          jkeys == ['laborH10a', 'priceYenKg', 'yieldKg10a'], str(jkeys))
                else:
                    # 5. 経費率＝（直接経費＋配分した共通経費）÷売上
                    kitai = js_round(t['hiritsu_nama'] * 100) / 100
                    check(f'{u["name"]} の経費率が手計算（{t["keihi"]:,.0f}÷{t["sales"]:,}＝{kitai}）と一致する',
                          isinstance(o.get('costRate'), dict)
                          and abs(o['costRate']['v'] - kitai) < 1e-9,
                          json.dumps(o.get('costRate'), ensure_ascii=False))
                    check(f'{u["name"]} は単収・単価・経費率・労働時間の4つとも書き込まれる',
                          jkeys == ['costRate', 'laborH10a', 'priceYenKg', 'yieldKg10a'], str(jkeys))
            noteru.append('書き込まれた項目: '
                          + '／'.join(f'{k} {len(v)}件（{"・".join(v)}）' for k, v in kensuu.items()))

            # ---- 9. 品目と単価の画面に「実績から」の札が出て、単価がその値になる ----
            n_err = len(err)
            hairu(pg, 'tools/hinmoku.html')
            check('画面のエラーが無い（書き戻したあとの品目と単価）', len(err) == n_err,
                  ' / '.join(err[n_err:n_err + 2]))
            hyou3 = hyou_wo_yomu(pg, 'baseTbl')
            for u in URIAGE:
                t = te_area[u['cropId']]
                row = hyou3.get(u['name']) or hyou3.get(u['name'] + ' 自分の値')
                if not row:
                    # 「自分の値」の札が名前の後ろに付くので、前方一致でも探す
                    row = next((v for k, v in hyou3.items() if k.startswith(u['name'])), None)
                check(f'品目の一覧に「{u["name"]}」の行がある', bool(row), str(list(hyou3.keys()))[:120])
                if not row:
                    continue
                check(f'{u["name"]} の単価に「実績から・{nen}年」の札が出る',
                      f'実績から・{nen}年' in row[3], row[3])
                check(f'{u["name"]} の単価が実績の値（{t["tanka"]}円）になる',
                      moji(t['tanka'], 'num') in row[3], row[3])

            check('外へ勝手に出ていかない', not soto, ' / '.join(soto[:2]))
            b.close()
    finally:
        srv.terminate()

    print('')
    print('見本の確定申告（収支内訳書・千葉県の水稲＋露地野菜・実在の農家ではない）')
    for x in noteru:
        print('  ' + x)
    print('')
    for x in fugokaku:
        print('  不合格', x)
    print(f'\n確定申告の数字を通す検査  合格 {ok}件 / 不合格 {ng}件')
    return 1 if ng else 0


if __name__ == '__main__':
    sys.exit(main())
