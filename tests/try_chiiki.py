# -*- coding: utf-8 -*-
"""地域を沖縄以外に切り替えても、実績が計算の前提に書き戻されるかを確かめる。

この道具の中心の仕掛けは、実績の診断（tools/checkup.html）で入れた数字が
品目マスタの上書き（localStorage の cropCustom）へ jisseki 付きで書き戻され、
品目と単価（tools/hinmoku.html）や経営シミュレーターの計算がその値に変わることにある。
これまで実測で確かめていたのは沖縄の品目だけだったので、
assets/js/data_regions.js に実際に入っている地域から5つ選んで同じ道筋を通す。

地域ごとに確かめること
  1. 地域を切り替えると、その地域の品目に入れ替わる（沖縄の品目・さとうきびが残らない）
  2. 実績の診断に、その地域の品目で数字を入れて計算できる
  3. 「この実績を前提にする」を押すと cropCustom に jisseki: true の値が入る
  4. 品目と単価の画面に「実績から」の札が出る
  5. その値で計算し直される（押す前と押したあとで、段1の見通しが変わる）
  6. 「元に戻す」で、実績から入れた値だけが消える（手で入れた値は残る）

最後に、品目を持つ地域を全部いちど実績の診断で開き、画面のエラーが出る地域を拾って出力する
（この検査で直す対象ではないので合否には数えない。黙って見送らないために出す）。

走らせ方:  python tests/try_chiiki.py
配信は自分で立ち上げるので、tests/serve.js を先に動かす必要はない。
"""
import json
import os
import socket
import subprocess
import sys
import time

from playwright.sync_api import sync_playwright

KOKO = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(KOKO)
PORT = 8203
BASE = f'http://127.0.0.1:{PORT}'
NS = 'myfarm-agri-compass-pro'

ok = 0
ng = 0
fugokaku = []
jissoku = []          # 地域ごとの実測値（最後にまとめて出す）


def check(na, jouken, soe=''):
    global ok, ng
    if jouken:
        ok += 1
    else:
        ng += 1
        fugokaku.append(f'{na}  {soe}')


# data_regions.js に実際に入っている地域から5つ。
# 収録の厚みが違うものを混ぜる（経費率と労働時間の有無で書き戻せる値の数が変わるため）。
CHIIKI = [
    ('fukushima', '福島県'),    # 経費率・労働時間とも収録あり。本単位の品目を含む
    ('shimane',   '島根県'),    # 労働時間は全品目、経費率は一部だけ
    ('chiba',     '千葉県'),    # 4項目とも収録あり
    ('kanagawa',  '神奈川県'),  # 経費率はあるが労働時間が無い
    ('kyoto',     '京都府'),    # 経費率・労働時間とも無い（見通しは実績を入れて初めて出る）
]

# 実績の診断に入れる数字（県の収録値とわざと違う値にして、書き戻りを見分けられるようにする）
# 面積30a・20a、経費8分類の合計1,500,000円、品目だけの経費300,000円・200,000円
HIN1 = {'areaA': 30, 'qty': 12000, 'sales': 3000000, 'direct': 300000}
HIN2 = {'areaA': 20, 'qty': 6000, 'sales': 2000000, 'direct': 200000}
KEIHI = [100000, 250000, 150000, 200000, 150000, 300000, 200000, 150000]  # 8分類の並び順
TEDE_IRERU_TANSHU = 1234   # 手で入れる単収（元に戻すの検査用）

# 手計算（面積比で割ったとき）
#   共通経費 = 1,500,000 −（300,000＋200,000）= 1,000,000
#   面積の比 3.0 : 2.0 → 600,000 : 400,000
#   品目1の経費 = 300,000＋600,000 = 900,000 → 経費率 900,000 ÷ 3,000,000 = 0.30
#   品目2の経費 = 200,000＋400,000 = 600,000 → 経費率 600,000 ÷ 2,000,000 = 0.30
TE_KEISAN = {
    'tanshu1': 12000 / 3.0,          # 4,000
    'tanka1': 3000000 / 12000,       # 250
    'hiritsu1': 0.30,
    'tanshu2': 6000 / 2.0,           # 3,000
    'tanka2': round(2000000 / 6000),  # 333
    'hiritsu2': 0.30,
}

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


def hairu(pg, path, machi=700):
    pg.goto(f'{BASE}/{path}', wait_until='domcontentloaded')
    pg.wait_for_timeout(machi)


def cropCustom(pg):
    return pg.evaluate(f"() => JSON.parse(localStorage.getItem('{NS}:cropCustom') || 'null')")


def jisseki_wo_kazoeru(cc):
    """cropCustom の中で jisseki: true が付いている値を数える。→ (品目数, 値の数, 品目別の内訳)"""
    if not cc or not isinstance(cc.get('overrides'), dict):
        return 0, 0, {}
    uchiwake = {}
    for cid, o in cc['overrides'].items():
        if not isinstance(o, dict):
            continue
        keys = [k for k, v in o.items()
                if isinstance(v, dict) and v.get('jisseki') is True]
        if keys:
            uchiwake[cid] = sorted(keys)
    return len(uchiwake), sum(len(v) for v in uchiwake.values()), uchiwake


def chiiki_wo_shiraberu(pg, err, reg, label):
    """1地域ぶんの通し検査。実測値を辞書で返す"""
    m = {'reg': reg, 'label': label}
    na = f'[{label}]'

    # ---- 0. 端末を空にして地域を入れる ----
    hairu(pg, 'tools/hinmoku.html', 300)
    pg.evaluate("""([ns, reg]) => {
      localStorage.clear();
      localStorage.setItem(ns + ':mfkRegion', JSON.stringify(reg));
    }""", [NS, reg])
    n_err = len(err)
    hairu(pg, 'tools/hinmoku.html')

    # ---- 1. その地域の品目に入れ替わる ----
    joho = pg.evaluate("""(reg) => {
      const def = window.MFK_REGIONS[reg];
      const tsukaeru = DATA.CROPS.filter(function (c) {
        const y = c.yieldKg10a || c.yieldHon10a, p = c.priceYenKg || c.priceYenHon;
        return y && y.v != null && p && p.v != null;
      }).map(function (c) {
        return { id: c.id, name: c.name, hon: !!c.yieldHon10a,
                 labor: !!(c.laborH10a && c.laborH10a.v != null),
                 cost: !!(c.costRate && c.costRate.v != null) };
      });
      return { ids: DATA.CROPS.map(function (c) { return c.id; }),
               kitai: def.crops.map(function (c) { return c.id; }),
               kibi: !!DATA.KIBI, tsukaeru: tsukaeru,
               selN: (document.getElementById('imaSel') || { options: [] }).options.length };
    }""", reg)
    m['hinmoku_kensu'] = len(joho['ids'])
    m['tsukaeru_kensu'] = len(joho['tsukaeru'])
    check(f'{na} 品目がその地域のものに入れ替わる',
          joho['ids'] == joho['kitai'],
          f"出た={joho['ids'][:3]} 期待={joho['kitai'][:3]}")
    check(f'{na} 沖縄の品目が残っていない',
          'goya_sokusei' not in joho['ids'] and 'kabocha' not in joho['ids'],
          str(joho['ids'][:5]))
    check(f'{na} さとうきびの行が出ない（沖縄だけの品目）', not joho['kibi'])
    check(f'{na} 段1の選び口にその地域の品目が並ぶ',
          joho['selN'] >= len(joho['kitai']), str(joho['selN']))
    check(f'{na} 画面のエラーが無い（品目と単価）', len(err) == n_err,
          ' / '.join(err[n_err:n_err + 2]))

    tsukaeru = joho['tsukaeru']
    if len(tsukaeru) < 3:
        check(f'{na} 単収と単価のそろった品目が3件以上ある', False, str(len(tsukaeru)))
        return m
    c1, c2, c3 = tsukaeru[0], tsukaeru[1], tsukaeru[2]
    m['hinmoku'] = [c1['name'], c2['name']]
    m['tede'] = c3['name']
    m['labor_ari'] = [c1['labor'], c2['labor']]

    # ---- 2. 手で入れた値を1つ置く（あとで「元に戻す」で消えないことを見る） ----
    pg.click(f'button[data-edit="{c3["id"]}"]')
    pg.wait_for_timeout(300)
    pg.fill('#e-yield', str(TEDE_IRERU_TANSHU))
    pg.click('#editSave')
    pg.wait_for_timeout(900)
    cc0 = cropCustom(pg)
    ykey = 'yieldHon10a' if c3['hon'] else 'yieldKg10a'
    check(f'{na} 手で入れた単収が保存される',
          bool(cc0) and cc0['overrides'].get(c3['id'], {}).get(ykey) == TEDE_IRERU_TANSHU,
          json.dumps(cc0, ensure_ascii=False)[:120] if cc0 else 'null')

    # ---- 3. 段1に2品目を入れて、押す前の見通しを控える ----
    for c, hin in ((c1, HIN1), (c2, HIN2)):
        pg.select_option('#imaSel', c['id'])
        pg.click('#imaAdd')
        pg.wait_for_timeout(200)
    pg.locator('.ima-gyou input').nth(0).fill(str(HIN1['areaA']))
    pg.wait_for_timeout(200)
    pg.locator('.ima-gyou input').nth(1).fill(str(HIN2['areaA']))
    pg.wait_for_timeout(400)
    mitooshi_mae = pg.inner_text('#imaKekka')
    m['mitooshi_mae'] = mitooshi_mae.replace('\n', ' ')[:60]
    check(f'{na} 押す前は「実績から」の札が出ていない',
          pg.locator('#imaList .flag.jisseki').count() == 0)

    # ---- 4. 実績の診断に、その地域の品目で数字を入れる ----
    n_err = len(err)
    hairu(pg, 'tools/checkup.html', 900)
    check(f'{na} 画面のエラーが無い（実績の診断）', len(err) == n_err,
          ' / '.join(err[n_err:n_err + 2]))
    gyou = pg.locator('#cropRows .crop-row')
    m['shindan_gyou'] = gyou.count()
    check(f'{na} 実績の診断に段1の2品目が並ぶ', gyou.count() == 2, str(gyou.count()))
    if gyou.count() != 2:
        return m
    namae = [gyou.nth(i).locator('.cr-name').inner_text() for i in range(2)]
    check(f'{na} 並んだ品目の名前が地域の品目と合う',
          namae == [c1['name'], c2['name']], str(namae))

    for i, hin in enumerate((HIN1, HIN2)):
        r = gyou.nth(i)
        r.locator('input[data-k="area"]').fill(str(hin['areaA']))
        r.locator('input[data-k="qty"]').fill(str(hin['qty']))
        r.locator('input[data-k="sales"]').fill(str(hin['sales']))
        r.locator('input[data-k="direct"]').fill(str(hin['direct']))
    pg.wait_for_timeout(200)
    keihi = pg.locator('#expGrid input')
    for i, v in enumerate(KEIHI):
        keihi.nth(i).fill(str(v))
    pg.wait_for_timeout(500)

    kpi = pg.inner_text('#kpiIncome')
    m['kpi_shotoku'] = kpi
    check(f'{na} 農業所得が計算される', kpi not in ('―', ''), kpi)
    check(f'{na} 品目別の表に2品目が出る',
          pg.locator('#cropTbl tbody tr').count() == 2,
          str(pg.locator('#cropTbl tbody tr').count()))
    check(f'{na} 実績の表に2品目が出る',
          pg.locator('#jissekiTbl tbody tr').count() == 2,
          str(pg.locator('#jissekiTbl tbody tr').count()))

    # ---- 5. 「この実績を前提にする」を押す ----
    pg.click('#jissekiApply')
    pg.wait_for_timeout(400)
    shirase = pg.inner_text('#jissekiMsg')
    check(f'{na} 前提にした旨の知らせが出る', '前提にしました' in shirase, shirase[:60])
    cc = cropCustom(pg)
    nCrop, nVal, uchiwake = jisseki_wo_kazoeru(cc)
    m['kakikomi_hinmoku'] = nCrop
    m['kakikomi_kensu'] = nVal
    m['kakikomi_uchiwake'] = uchiwake
    check(f'{na} cropCustom に実績の値が入る（2品目）', nCrop == 2, str(uchiwake))

    nen = pg.evaluate("() => +document.getElementById('yearSel').value")
    m['nen'] = nen
    for cid, hin, te in ((c1['id'], HIN1, ('tanshu1', 'tanka1', 'hiritsu1')),
                         (c2['id'], HIN2, ('tanshu2', 'tanka2', 'hiritsu2'))):
        o = (cc['overrides'].get(cid) or {}) if cc else {}
        yk = 'yieldHon10a' if (c1 if cid == c1['id'] else c2)['hon'] else 'yieldKg10a'
        pk = 'priceYenHon' if (c1 if cid == c1['id'] else c2)['hon'] else 'priceYenKg'
        check(f'{na} {cid} の単収が実績から入る（{TE_KEISAN[te[0]]:.0f}）',
              isinstance(o.get(yk), dict) and o[yk].get('jisseki') is True
              and o[yk]['v'] == round(TE_KEISAN[te[0]]),
              json.dumps(o.get(yk), ensure_ascii=False))
        check(f'{na} {cid} の単価が実績から入る（{TE_KEISAN[te[1]]:.0f}）',
              isinstance(o.get(pk), dict) and o[pk].get('jisseki') is True
              and o[pk]['v'] == round(TE_KEISAN[te[1]]),
              json.dumps(o.get(pk), ensure_ascii=False))
        check(f'{na} {cid} の経費率が実績から入る（{TE_KEISAN[te[2]]}）',
              isinstance(o.get('costRate'), dict) and o['costRate'].get('jisseki') is True
              and abs(o['costRate']['v'] - TE_KEISAN[te[2]]) < 1e-9,
              json.dumps(o.get('costRate'), ensure_ascii=False))
        check(f'{na} {cid} の値に入力した年が付く',
              isinstance(o.get(yk), dict) and o[yk].get('nen') == nen,
              str(o.get(yk)))

    # 労働時間は、その地域に10a当たり労働時間の収録があるときだけ書き戻せる
    for c in (c1, c2):
        o = (cc['overrides'].get(c['id']) or {}) if cc else {}
        aru = isinstance(o.get('laborH10a'), dict)
        if c['labor']:
            check(f'{na} {c["id"]} の労働時間が実績から入る（収録あり）', aru,
                  json.dumps(o, ensure_ascii=False)[:80])
        else:
            check(f'{na} {c["id"]} は労働時間を作らない（収録が無く割り付けできないため）',
                  not aru, json.dumps(o.get('laborH10a'), ensure_ascii=False))

    # ---- 6. 品目と単価の画面に「実績から」の札が出て、見通しが変わる ----
    n_err = len(err)
    hairu(pg, 'tools/hinmoku.html')
    check(f'{na} 画面のエラーが無い（書き戻したあとの品目と単価）', len(err) == n_err,
          ' / '.join(err[n_err:n_err + 2]))
    fuda = pg.locator('#imaList .flag.jisseki').count()
    m['fuda_kensu'] = fuda
    check(f'{na} 段1に「実績から」の札が出る', fuda == 2, str(fuda))
    hyou = pg.inner_text('#baseTbl')
    check(f'{na} 品目の一覧に「実績から」と書かれる', '実績から' in hyou,
          hyou.replace('\n', ' ')[:80])
    check(f'{na} 札に入力した年が入る', f'実績から・{nen}年' in pg.inner_text('#imaList'),
          pg.inner_text('#imaList').replace('\n', ' ')[:80])

    mitooshi_ato = pg.inner_text('#imaKekka')
    m['mitooshi_ato'] = mitooshi_ato.replace('\n', ' ')[:60]
    check(f'{na} 段1の見通しが実績の値で計算し直される',
          mitooshi_ato != mitooshi_mae,
          f'前={mitooshi_mae[:40]} 後={mitooshi_ato[:40]}')
    check(f'{na} 実績を入れたあとは1年の見通しの金額が出る',
          '1年の売上' in mitooshi_ato, mitooshi_ato[:60])

    # ---- 7. 元に戻すと、実績から入れた値だけが消える ----
    hairu(pg, 'tools/checkup.html', 900)
    pg.click('#jissekiUndo')
    pg.wait_for_timeout(400)
    shirase = pg.inner_text('#jissekiMsg')
    check(f'{na} 消した旨の知らせが出る', '消しました' in shirase, shirase[:60])
    cc2 = cropCustom(pg)
    nCrop2, nVal2, uchiwake2 = jisseki_wo_kazoeru(cc2)
    m['modoshi_nokori'] = nVal2
    check(f'{na} 実績から入れた値が全部消える', nVal2 == 0, str(uchiwake2))
    nokori = (cc2['overrides'].get(c3['id']) or {}) if cc2 else {}
    check(f'{na} 手で入れた値は残る', nokori.get(ykey) == TEDE_IRERU_TANSHU,
          json.dumps(nokori, ensure_ascii=False))

    hairu(pg, 'tools/hinmoku.html')
    check(f'{na} 段1の「実績から」の札が消える',
          pg.locator('#imaList .flag.jisseki').count() == 0,
          str(pg.locator('#imaList .flag.jisseki').count()))
    modotta = pg.inner_text('#imaKekka')
    check(f'{na} 段1の見通しが元の値に戻る', modotta == mitooshi_mae,
          f'元={mitooshi_mae[:40]} 戻り={modotta[:40]}')
    return m


def zenchiiki_wo_hirou(pg, err):
    """品目を持つ地域を全部、実績の診断で開いてみて、画面のエラーが出る地域を拾う。

    合否には数えない（この検査で直す対象ではないため）。
    ただし黙って見送ると気づけないので、必ず結果を出力へ出す。"""
    hairu(pg, 'tools/hinmoku.html', 300)
    regs = pg.evaluate("""() => Object.keys(window.MFK_REGIONS).filter(function (k) {
      const d = window.MFK_REGIONS[k];
      return d.crops && d.crops.length;
    }).map(function (k) { return [k, window.MFK_REGIONS[k].label]; })""")
    warui = []
    for reg, label in regs:
        pg.evaluate("""([ns, reg]) => {
          localStorage.clear();
          localStorage.setItem(ns + ':mfkRegion', JSON.stringify(reg));
        }""", [NS, reg])
        n_err = len(err)
        hairu(pg, 'tools/checkup.html', 800)
        if len(err) > n_err:
            tanka_nashi = pg.evaluate("""() => DATA.CROPS.filter(function (c) {
              return !((c.priceYenKg && c.priceYenKg.v != null) ||
                       (c.priceYenHon && c.priceYenHon.v != null));
            }).map(function (c) { return c.id; })""")
            warui.append({'reg': reg, 'label': label, 'err': err[n_err],
                          'tanka_nashi': tanka_nashi,
                          'gyou': pg.locator('#cropRows .crop-row').count(),
                          'kpi': pg.inner_text('#kpiIncome')})
    return len(regs), warui


def main():
    zen_n, warui = 0, []
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

            # 手元の配信だけ通す。外への通信は落とす
            def michibiki(route):
                u = route.request.url
                if '127.0.0.1' in u:
                    route.continue_()
                else:
                    soto.append(u)
                    route.abort()
            pg.route('**/*', michibiki)
            # 住所の決めには実機のサーバが入っているので、検査のあいだは空に差し替える
            pg.route('**/saba_settei.js', lambda route: route.fulfill(
                status=200, content_type='text/javascript; charset=utf-8',
                body="window.MFK_SABA_SETTEI = { url: '', namae: 'ためし' };"))

            for reg, label in CHIIKI:
                jissoku.append(chiiki_wo_shiraberu(pg, err, reg, label))

            zen_n, warui = zenchiiki_wo_hirou(pg, err)

            check('外へ勝手に出ていかない', not soto, ' / '.join(soto[:2]))
            b.close()
    finally:
        srv.terminate()

    print('')
    print('地域ごとの実測値')
    for m in jissoku:
        if 'kakikomi_kensu' not in m:
            print(f"  {m['label']}  … 途中で止まりました")
            continue
        uchi = '／'.join(f'{k}: {len(v)}件（{"・".join(v)}）'
                         for k, v in m['kakikomi_uchiwake'].items())
        print(f"  {m['label']}（{m['reg']}）")
        print(f"    品目マスタ {m['hinmoku_kensu']}件（単収と単価がそろうもの {m['tsukaeru_kensu']}件）"
              f" / 使った品目 {m['hinmoku'][0]}・{m['hinmoku'][1]} / 手で直した品目 {m['tede']}")
        print(f"    書き込み {m['kakikomi_hinmoku']}品目・{m['kakikomi_kensu']}件（{m['nen']}年）  {uchi}")
        print(f"    「実績から」の札 {m['fuda_kensu']}件 / 元に戻したあとの残り {m['modoshi_nokori']}件")
        print(f"    段1の見通し  押す前: {m['mitooshi_mae']}")
        print(f"                 押した後: {m['mitooshi_ato']}")

    print('')
    print(f'申し送り（合否には数えない）: 品目を持つ{zen_n}地域を実績の診断で開いた結果')
    if not warui:
        print('  画面のエラーが出た地域はありません')
    else:
        for w in warui:
            print(f"  ⚠ {w['label']}（{w['reg']}）でエラー: {w['err']}")
            print(f"    品目の行 {w['gyou']}件・農業所得の表示「{w['kpi']}」"
                  f"（画面が組み上がっていません）")
            print(f"    単価の収録が無い品目 {len(w['tanka_nashi'])}件: {'・'.join(w['tanka_nashi'])}")

    print('')
    for x in fugokaku:
        print('  不合格', x)
    print(f'\n地域を切り替えて実績を前提にする検査  合格 {ok}件 / 不合格 {ng}件'
          + (f' / 申し送り {len(warui)}地域' if warui else ''))
    return 1 if ng else 0


if __name__ == '__main__':
    sys.exit(main())
