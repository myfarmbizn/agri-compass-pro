# -*- coding: utf-8 -*-
"""品目に紐づかない収入（家事消費・事業消費／雑収入）が、実績の診断に効くかを確かめる。

なぜ要るか。
収支内訳書（農業所得用）の収入金額欄は、販売金額・家事消費事業消費金額・雑収入の3つで
成り立つ。実績の診断はもともと品目ごとの売上しか合計していなかったため、決算書を読み取って
入れても、この2つが所得に入らず、農業所得が実際より低く出ていた。

確かめること。
  一 欄が画面にあり、決算書から入れた値がそのまま出ること
  二 収入合計と農業所得に、その2つが足されていること（自分で計算し直して突き合わせる）
  三 品目別の表には配られていないこと（どの品目のもうけかを決められないため）
  四 この画面で保存し直しても、決算書から来た控えが消えないこと

走らせ方:  python tests/try_hinmokugai_shuunyuu.py
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
PORT = 8191
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


def en(moji):
    """「123.4万円」「1,234円」などの表示から数を取り出す。"""
    t = str(moji).replace(',', '').replace('円', '').strip()
    if t.endswith('万'):
        return float(t[:-1]) * 10000
    return float(t) if t and t not in ('―', '-') else None


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
            pg.route('**/*', lambda r: r.continue_() if '127.0.0.1' in r.request.url else r.abort())

            # 決算書から入れた直後と同じ姿を、端末に置いてから開く
            pg.goto(B + '/tools/checkup.html', wait_until='domcontentloaded')
            pg.wait_for_timeout(600)
            OKU = {
                '2025': {
                    'year': 2025,
                    'items': [
                        {'cropId': 'goya_sokusei', 'name': 'ゴーヤー（施設・冬春）', 'area10a': 3,
                         'qty': 4200, 'sales': 3000000, 'direct': 0, 'laborH': 1200},
                        {'cropId': 'okra', 'name': 'オクラ（露地）', 'area10a': 2,
                         'qty': 1800, 'sales': 1820000, 'direct': 0, 'laborH': 800},
                    ],
                    'expenses': {'種苗': 210000, '肥料': 380000, '農薬': 260000, '資材': 190000,
                                 '動力光熱': 340000, '出荷運賃手数料': 520000,
                                 '雇人費': 180000, 'その他': 240000},
                    'laborTotalH': 2000,
                    'hinmokuGaiShuunyuu': {'kaji': 180000, 'zatsu': 130000},
                    'kessanshoKara': {'hanbai': 4820000, 'kaji': 180000, 'zatsu': 130000,
                                      'shotoku': 2810000,
                                      'yomitoriAt': '2026-08-16T00:00:00.000Z', 'mihon': False},
                },
            }
            pg.evaluate(
                "(o)=>{localStorage.setItem(o.k, JSON.stringify(o.v));"
                "localStorage.setItem(o.pk, JSON.stringify({region:'okinawa'}));}",
                {'k': NS + ':annual', 'v': OKU, 'pk': NS + ':profile'})
            pg.goto(B + '/tools/checkup.html?year=2025', wait_until='domcontentloaded')
            pg.wait_for_timeout(1500)

            # ---- 一 欄が画面にあり、値が出ている ----
            check('家事消費の欄がある', pg.locator('#inKaji').count() == 1)
            check('雑収入の欄がある', pg.locator('#inZatsu').count() == 1)
            if pg.locator('#inKaji').count():
                check('家事消費に決算書の値が出ている',
                      pg.input_value('#inKaji') == '180000', pg.input_value('#inKaji'))
                check('雑収入に決算書の値が出ている',
                      pg.input_value('#inZatsu') == '130000', pg.input_value('#inZatsu'))

            # ---- 二 収入合計と所得に足されている ----
            hinmoku = 3000000 + 1820000
            hoka = 180000 + 130000
            keihi = sum(OKU['2025']['expenses'].values())
            machi_shuunyuu = hinmoku + hoka
            machi_shotoku = machi_shuunyuu - keihi

            shuunyuu = en(pg.inner_text('#kpiSales'))
            shotoku = en(pg.inner_text('#kpiIncome'))
            check('収入合計に品目外の収入が入っている',
                  shuunyuu is not None and abs(shuunyuu - machi_shuunyuu) < 10000,
                  f'画面 {shuunyuu} / 手計算 {machi_shuunyuu}')
            check('農業所得に品目外の収入が入っている',
                  shotoku is not None and abs(shotoku - machi_shotoku) < 10000,
                  f'画面 {shotoku} / 手計算 {machi_shotoku}')
            sub = pg.inner_text('#kpiSalesSub')
            check('収入合計の内訳が出ている', '品目に紐づかない収入' in sub, sub[:60])

            # ---- 三 品目別の表には配られていない ----
            hyou = pg.inner_text('#cropTbl') if pg.locator('#cropTbl').count() else pg.inner_text('body')
            check('品目別の表に品目外の収入の行が無い',
                  '家事消費' not in hyou and '雑収入' not in hyou, hyou[:80])

            # 品目の売上の合計は、品目外の収入を含まない
            gyoukei = pg.evaluate("""()=>{
              const t=document.querySelector('#cropTbl');
              if(!t) return null;
              let s=0;
              t.querySelectorAll('tbody tr').forEach(tr=>{
                const td=tr.querySelectorAll('td');
                if(td.length>1){
                  const v=parseFloat(td[1].textContent.replace(/[^0-9.\\-]/g,''));
                  if(isFinite(v)) s+=v;
                }
              });
              return s;
            }""")
            check('品目別の表の中身が読める', gyoukei is not None, str(gyoukei))

            # ---- 四 保存し直しても控えが消えない ----
            pg.fill('#inKaji', '200000')
            pg.dispatch_event('#inKaji', 'input')
            pg.wait_for_timeout(800)
            nochi = pg.evaluate(f"()=>JSON.parse(localStorage.getItem('{NS}:annual')||'{{}}')")
            r25 = (nochi or {}).get('2025') or {}
            check('直した値が端末に残る',
                  ((r25.get('hinmokuGaiShuunyuu') or {}).get('kaji')) == 200000,
                  str(r25.get('hinmokuGaiShuunyuu')))
            check('雑収入は消えていない',
                  ((r25.get('hinmokuGaiShuunyuu') or {}).get('zatsu')) == 130000,
                  str(r25.get('hinmokuGaiShuunyuu')))
            check('決算書から来た控えが消えていない',
                  bool(r25.get('kessanshoKara')), str(r25.get('kessanshoKara'))[:80])
            check('控えの中の家事消費が残っている',
                  (r25.get('kessanshoKara') or {}).get('kaji') == 180000,
                  str(r25.get('kessanshoKara'))[:80])

            # 直した値が計算にすぐ効く
            shotoku2 = en(pg.inner_text('#kpiIncome'))
            check('直すと所得もその場で変わる',
                  shotoku2 is not None and abs(shotoku2 - (machi_shotoku + 20000)) < 10000,
                  f'画面 {shotoku2} / 手計算 {machi_shotoku + 20000}')

            # ---- 五 欄が無い年（今までの端末）でも落ちない ----
            pg.evaluate(
                f"()=>{{const a=JSON.parse(localStorage.getItem('{NS}:annual'));"
                "delete a['2025'].hinmokuGaiShuunyuu; delete a['2025'].kessanshoKara;"
                f"localStorage.setItem('{NS}:annual', JSON.stringify(a));}}")
            err.clear()
            pg.goto(B + '/tools/checkup.html?year=2025', wait_until='domcontentloaded')
            pg.wait_for_timeout(1200)
            check('欄の無い古い年でも画面が落ちない', len(err) == 0, ' / '.join(err[:2]))
            check('欄の無い年は0で出る', pg.input_value('#inKaji') == '0', pg.input_value('#inKaji'))
            shotoku3 = en(pg.inner_text('#kpiIncome'))
            check('欄の無い年は品目の売上だけで計算する',
                  shotoku3 is not None and abs(shotoku3 - (hinmoku - keihi)) < 10000,
                  f'画面 {shotoku3} / 手計算 {hinmoku - keihi}')

            b.close()
    finally:
        srv.terminate()

    print('')
    for x in fugokaku:
        print('  不合格', x.encode('cp932', 'replace').decode('cp932'))
    print(f'\n品目に紐づかない収入の検査  合格 {ok}件 / 不合格 {ng}件')
    return 1 if ng else 0


if __name__ == '__main__':
    sys.exit(main())
