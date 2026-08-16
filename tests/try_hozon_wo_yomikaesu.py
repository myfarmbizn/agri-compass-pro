# -*- coding: utf-8 -*-
"""保存したのに、どの画面も読み返していなかった3つが、読まれるようになったかを確かめる。

洗い出し（2026-08-16）で分かったこと。
  一 資金繰りカレンダー（cashflow）の月ごとの見通しが、計画書に1行も出ていなかった
  二 段6で「この案を計画に入れる」を押しても、その事実が計画書に出ていなかった
  三 災害への備えで保存した3案の比較（insurance）を、読み返す画面がどこにも無かった

いずれも、押した人は保存したつもりでいるのに、あとから見ると消えたように見える。

走らせ方:  python tests/try_hozon_wo_yomikaesu.py
"""
import json
import os
import socket
import subprocess
import sys
import time

from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
PORT = 8192
NS = 'myfarm-agri-compass-pro'

ok = 0
ng = 0
fugokaku = []


def check(na, jouken, soe=''):
    global ok, ng
    if jouken:
        ok += 1
    else:
        ng += 1
        fugokaku.append(f'{na}  {soe}')


def main():
    srv = subprocess.Popen(
        ['node', '-e', f'''
const http=require("http"),fs=require("fs"),path=require("path");
const ROOT={json.dumps(ROOT)};
const MIME={{".html":"text/html; charset=utf-8",".js":"text/javascript; charset=utf-8",
  ".css":"text/css; charset=utf-8",".json":"application/json; charset=utf-8"}};
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
'''], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    for _ in range(80):
        try:
            socket.create_connection(('127.0.0.1', PORT), 0.2).close()
            break
        except OSError:
            time.sleep(0.1)

    B = f'http://127.0.0.1:{PORT}'
    try:
        with sync_playwright() as pw:
            b = pw.chromium.launch()
            pg = b.new_page(viewport={'width': 1280, 'height': 1200})
            err = []
            pg.on('pageerror', lambda e: err.append(str(e)))
            pg.route('**/*', lambda r: r.continue_() if '127.0.0.1' in r.request.url else r.abort())

            pg.goto(B + '/tools/keikaku.html', wait_until='domcontentloaded')
            pg.wait_for_timeout(600)

            PLAN = {
                'years': 5, 'livingMan': 200, 'fixedMan': 0, 'cashStartMan': 300, 'targetMan': 600,
                'loan': {'amountMan': 0, 'ratePct': 2.0, 'termY': 10, 'graceY': 3},
                'items': [{'cropId': 'goya_sokusei', 'area': 30, 'yieldV': 8000, 'priceV': 300,
                           'costRate': 0.6, 'laborH10a': 900, 'curve': [100] * 10, 'typhoonExp': 0}],
                'invests': [], 'hojo': {'amountMan': 0, 'year': 1},
            }
            # 一 資金繰りカレンダーの保存（shikin.html が書く形にそろえる）
            CF = {
                'startMonth': 4, 'startYear': 2026, 'horizon': 12,
                'cashStart': 3_000_000, 'living': 200_000, 'keihi': 150_000,
                'incomes': [{'cropId': 'goya_sokusei', 'area10a': 30, 'annualYen': 7_200_000}],
                'bigPays': [{'month': 9, 'label': '設備の支払い', 'amount': 2_000_000}],
                'loans': [{'label': '公庫', 'monthly': 50_000}],
                'extraExpenses': [{'label': '家の光熱費', 'man': 3}],
                'stress': {}, 'savedAt': '2026-08-16T00:00:00.000Z',
            }
            # 二 段6で選んだ案
            TEIAN = {
                'an': [{'namae': '面積を1割ふやす', 'teate': [{'kata': 'menseki', 'cropId': 'goya_sokusei', 'bairitsu': 1.1}]}],
                'mihon': False, 'dashitaAt': '2026-08-16T00:00:00.000Z',
                'eranda': '面積を1割ふやす',
                'erandaTeate': [{'kata': 'menseki', 'cropId': 'goya_sokusei', 'bairitsu': 1.1},
                                {'kata': 'keihiritsu', 'cropId': 'goya_sokusei', 'sagenPt': 3}],
                'erandaAt': '2026-08-16T09:00:00.000Z',
            }
            pg.evaluate("(o)=>{for(const k in o) localStorage.setItem(k, JSON.stringify(o[k]));}", {
                NS + ':simPlan': PLAN,
                NS + ':cashflow': CF,
                NS + ':teian': TEIAN,
                NS + ':profile': {'region': 'okinawa'},
            })
            pg.goto(B + '/tools/keikaku.html', wait_until='domcontentloaded')
            pg.wait_for_timeout(1800)

            honbun = pg.inner_text('body')

            # ---- 一 月ごとの資金繰りの山場 ----
            check('計画書に、月ごとの山場が出る', '月ごとに見ると' in honbun,
                  honbun[honbun.find('７．'):honbun.find('７．') + 200] if '７．' in honbun else honbun[:120])
            check('山場が何月かを言っている',
                  any((str(m) + '月で、') in honbun for m in range(1, 13)),
                  honbun[honbun.find('月ごとに見ると'):honbun.find('月ごとに見ると') + 120])
            check('概算であることを断っている', '概算です' in honbun)

            # 手で計算した山場と突き合わせる
            deru = CF['living'] + CF['keihi'] + 30_000 + 50_000
            hairu = 7_200_000 / 12
            zan, yasui, yasuiTsuki = CF['cashStart'], None, None
            for k in range(12):
                mo = (CF['startMonth'] - 1 + k) % 12 + 1
                ooguchi = sum(b['amount'] for b in CF['bigPays'] if b['month'] == mo)
                zan += hairu - deru - ooguchi
                if yasui is None or zan < yasui:
                    yasui, yasuiTsuki = zan, mo
            check('山場の月が手計算と合う', f'{yasuiTsuki}月で、' in honbun,
                  f'手計算 {yasuiTsuki}月 / {yasui:.0f}円')

            # ---- 二 どの直しどころを入れたか ----
            check('計画書に、入れた案の名前が出る', '面積を1割ふやす' in honbun)
            check('打ち手が日本語で出る', '面積を変える' in honbun and '経費率を下げる' in honbun,
                  honbun[honbun.find('この計画は'):honbun.find('この計画は') + 140])
            check('入れた日が出る', '2026-08-16' in honbun)

            # 選んでいないときは出さない
            pg.evaluate(f"()=>localStorage.removeItem('{NS}:teian')")
            pg.goto(B + '/tools/keikaku.html', wait_until='domcontentloaded')
            pg.wait_for_timeout(1500)
            check('案を入れていないときは、その行を出さない',
                  'この計画は、段6' not in pg.inner_text('body'))
            check('資金繰りが無くても計画書が出る（山場の行だけ消える）',
                  '７．' in pg.inner_text('body'))

            # ---- 三 前に保存した3案の比較 ----
            INS = {'items': [
                {'label': 'A案（いまのまま）', 'kakekin円': 42000, 'hosho円': 900000, 'memo': ''},
                {'label': 'B案（補償を厚く）', 'kakekin円': 78000, 'hosho円': 1600000, 'memo': ''},
                {'label': 'C案（掛金を抑える）', 'kakekin円': 26000, 'hosho円': 500000, 'memo': ''},
            ]}
            pg.evaluate("(o)=>{localStorage.setItem(o.k, JSON.stringify(o.v));}",
                        {'k': NS + ':insurance', 'v': INS})
            err.clear()
            pg.goto(B + '/tools/taifu.html', wait_until='domcontentloaded')
            pg.wait_for_timeout(1500)
            t = pg.inner_text('body')
            check('災害への備えに、前に保存した比較が出る', '前に保存した3案の比較' in t, t[:100])
            check('3案とも出る',
                  all(x in t for x in ('A案（いまのまま）', 'B案（補償を厚く）', 'C案（掛金を抑える）')))
            check('掛金の額が出る', '42,000' in t and '78,000' in t,
                  t[t.find('前に保存した3案の比較'):t.find('前に保存した3案の比較') + 200])
            check('画面のエラーが無い', len(err) == 0, ' / '.join(err[:2]))

            # 保存が無いときは出さない
            pg.evaluate(f"()=>localStorage.removeItem('{NS}:insurance')")
            pg.goto(B + '/tools/taifu.html', wait_until='domcontentloaded')
            pg.wait_for_timeout(1200)
            check('保存が無いときは、その箱を出さない',
                  '前に保存した3案の比較' not in pg.inner_text('body'))

            b.close()
    finally:
        srv.terminate()

    print('')
    for x in fugokaku:
        print('  不合格', x.encode('cp932', 'replace').decode('cp932'))
    print(f'\n保存したものを読み返せるかの検査  合格 {ok}件 / 不合格 {ng}件')
    return 1 if ng else 0


if __name__ == '__main__':
    sys.exit(main())
