# -*- coding: utf-8 -*-
"""県を選び直したとき、前の県で入れた品目がどうなるかを確かめる。

なぜ要るか。
段1に「どの県の数字を土台にするか」を選ぶ欄を置いた（2026-08-16）。
県を選び直すと品目の一覧がその県のものに入れ替わるので、前の県で入れた品目は
名前も単価も引けなくなる。残しておくとIDがそのまま画面に出て、見通しの計算も止まる
（公開先で実測して見つけた）。外して、外したことを伝えるのが正しい。

確かめること。
  一 県を選び直すと、その県に無い品目は外れる
  二 外したことを画面で伝える（黙って消さない）
  三 外れたあとも見通しの計算が止まらない
  四 同じ県のままなら、入れた品目は消えない

走らせ方:  python tests/try_ken_wo_erabinaosu.py
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
PORT = 8196
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
            pg = b.new_page(viewport={'width': 1280, 'height': 1000})
            err = []
            pg.on('pageerror', lambda e: err.append(str(e)))
            pg.on('dialog', lambda d: d.accept())
            pg.route('**/*', lambda r: r.continue_() if '127.0.0.1' in r.request.url else r.abort())

            pg.goto(B + '/tools/hinmoku.html', wait_until='domcontentloaded')
            pg.wait_for_timeout(1200)
            pg.evaluate("()=>localStorage.clear()")
            pg.goto(B + '/tools/hinmoku.html', wait_until='domcontentloaded')
            pg.wait_for_timeout(1500)

            check('県を選ぶ欄がある', pg.locator('#chiikiSel').count() == 1)
            erabi = pg.locator('#chiikiSel option').count()
            check('選び先が13ある（品目を持つ11県＋沖縄＋その他）', erabi == 13, str(erabi))

            # 沖縄の品目を1つ入れる
            pg.select_option('#imaSel', index=1)
            pg.click('#imaAdd')
            pg.wait_for_timeout(500)
            men = pg.locator('#imaList input[type=number]').first
            men.fill('30')
            men.dispatch_event('input')
            pg.wait_for_timeout(1200)

            mae = pg.evaluate(f"()=>JSON.parse(localStorage.getItem('{NS}:simPlan')||'null')")
            hin_mae = [i['cropId'] for i in (mae or {}).get('items', [])]
            check('品目が1件入る', len(hin_mae) == 1, str(hin_mae))
            check('見通しが出る', '万円' in pg.inner_text('body'))

            # ---- 四 同じ県のまま開き直しても消えない ----
            pg.goto(B + '/tools/hinmoku.html', wait_until='domcontentloaded')
            pg.wait_for_timeout(1500)
            onaji = pg.evaluate(f"()=>JSON.parse(localStorage.getItem('{NS}:simPlan')||'null')")
            check('同じ県のままなら品目は消えない',
                  [i['cropId'] for i in (onaji or {}).get('items', [])] == hin_mae,
                  str((onaji or {}).get('items')))
            check('外したという知らせは出ていない', pg.locator('#imaHazureta').count() == 0)

            # ---- 一・二・三 県を選び直す ----
            pg.select_option('#chiikiSel', 'hyogo')
            pg.wait_for_timeout(3000)

            check('選び直した県になっている', pg.input_value('#chiikiSel') == 'hyogo',
                  pg.input_value('#chiikiSel'))
            ato = pg.evaluate(f"()=>JSON.parse(localStorage.getItem('{NS}:simPlan')||'null')")
            hin_ato = [i['cropId'] for i in (ato or {}).get('items', [])]
            check('前の県の品目は外れる', hin_ato == [], str(hin_ato))

            check('外したことを画面で伝える', pg.locator('#imaHazureta').count() == 1)
            if pg.locator('#imaHazureta').count():
                t = pg.inner_text('#imaHazureta')
                check('何件外したかを言う', '1件' in t, t[:100])
                check('なぜ外したかを言う', '県' in t and ('単価' in t or '収量' in t), t[:120])

            hyou = pg.inner_text('#imaList')
            check('IDが生で画面に出ていない', 'goya_sokusei' not in hyou, hyou[:100])

            # ---- 選び直した県の品目を入れれば、また見通しが出る ----
            pg.select_option('#imaSel', index=1)
            pg.click('#imaAdd')
            pg.wait_for_timeout(500)
            men2 = pg.locator('#imaList input[type=number]').first
            men2.fill('20')
            men2.dispatch_event('input')
            pg.wait_for_timeout(1500)
            t2 = pg.inner_text('body')
            check('選び直した県の品目で売上が出る', '万円' in t2, t2[:120])
            # 兵庫県は県の資料に経費率が無い。所得と働く時間は出せないので、
            # その旨と、どこで入れられるかを言う 
            check('経費率が無い県では、足りないものを言う',
                  '経費率が無いため' in t2 or '農業所得' in t2, t2[:200])
            ato2 = pg.evaluate(f"()=>JSON.parse(localStorage.getItem('{NS}:simPlan')||'null')")
            hin2 = [i['cropId'] for i in (ato2 or {}).get('items', [])]
            check('新しい県の品目が入る', len(hin2) == 1 and hin2[0].startswith('hy_'), str(hin2))

            check('画面のエラーが無い', len(err) == 0, ' / '.join(err[:2]))
            b.close()
    finally:
        srv.terminate()

    print('')
    for x in fugokaku:
        print('  不合格', x.encode('cp932', 'replace').decode('cp932'))
    print(f'\n県を選び直したときの検査  合格 {ok}件 / 不合格 {ng}件')
    return 1 if ng else 0


if __name__ == '__main__':
    sys.exit(main())
