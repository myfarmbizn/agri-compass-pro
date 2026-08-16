# -*- coding: utf-8 -*-
"""画面からサーバへ預けるところを、通しで確かめる。

確かめること
  1. 合言葉が無いときは、外へ1回も送らない（登録なしで使える手応えを崩さない）
  2. 合言葉を入れると、入力したものがサーバへ届く
  3. 端末の保存を空にして開き直すと、サーバから戻ってくる
  4. 案と計画が、AIの受け口とは別の道でサーバへ残る
  5. サーバが落ちていても、端末では動き続ける

受け口は tests/saba_mane.js（本物のまねをするだけのもの）を立てて使う。
本物のデータベースとAIは動かさない。ここで見たいのは画面とサーバのあいだだけ。

走らせ方:  python tests/try_saba.py
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
HAISHIN_PORT = 8197
SABA_PORT = 8199
BASE = f'http://127.0.0.1:{HAISHIN_PORT}'
SABA = f'http://127.0.0.1:{SABA_PORT}'
NS = 'myfarm-agri-compass-pro'
AIKOTOBA = 'TESTPASS'
OUT = os.path.join(KOKO, '_saba_azukari.json')

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
s.listen({HAISHIN_PORT},"127.0.0.1");
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


def azukari_wo_yomu():
    try:
        with open(OUT, encoding='utf-8') as f:
            return json.load(f)
    except Exception:
        return {'azukari': {}, 'teian': [], 'keikaku': [], 'aiYobareta': []}


def hairu(pg, path, machi=700):
    pg.goto(f'{BASE}/{path}', wait_until='domcontentloaded')
    pg.wait_for_timeout(machi)


def main():
    if os.path.exists(OUT):
        os.remove(OUT)

    haishin = subprocess.Popen(['node', '-e', HAISHIN],
                               stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    saba = subprocess.Popen(
        ['node', os.path.join(KOKO, 'saba_mane.js')],
        env={**os.environ, 'PORT': str(SABA_PORT), 'OUT': OUT, 'AIKOTOBA': AIKOTOBA},
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    if not matsu(HAISHIN_PORT) or not matsu(SABA_PORT):
        print('配信か受け口が立ち上がりませんでした')
        haishin.terminate(); saba.terminate()
        return 1

    try:
        with sync_playwright() as p:
            b = p.chromium.launch()
            pg = b.new_page(viewport={'width': 1280, 'height': 950})
            err = []
            soto = []
            pg.on('pageerror', lambda e: err.append(str(e)))
            pg.on('dialog', lambda d: d.accept())

            # 手元の2つの口だけ通す。ほかの外への通信は落として、行き先を数える
            def michibiki(route):
                u = route.request.url
                if '127.0.0.1' in u:
                    route.continue_()
                else:
                    soto.append(u)
                    route.abort()
            pg.route('**/*', michibiki)

            # この検査は「住所が決まっていないとき」と「合言葉を手で入れたとき」を見る。
            # 実機の住所が入ったままだと自動で迎え入れに行くので、住所の決めだけ空に差し替える
            pg.route('**/saba_settei.js', lambda route: route.fulfill(
                status=200, content_type='text/javascript; charset=utf-8',
                body="window.MFK_SABA_SETTEI = { url: '', namae: 'ためし' };"))

            # ---- 1. 合言葉が無いときは、外へ送らない ----
            hairu(pg, 'tools/hinmoku.html')
            pg.evaluate("() => localStorage.clear()")
            hairu(pg, 'tools/hinmoku.html')
            v = pg.eval_on_selector('#imaSel', 'e => e.options.length > 1 ? e.options[1].value : ""')
            pg.select_option('#imaSel', v)
            pg.click('#imaAdd')
            pg.wait_for_timeout(200)
            pg.fill('.ima-gyou input', '30')
            pg.wait_for_timeout(4500)     # 送るまでの待ち（3秒）を越えて待つ

            azu = azukari_wo_yomu()
            check('合言葉が無ければサーバへ1件も送らない', not azu['azukari'],
                  str(list(azu['azukari'].keys())))
            check('端末には保存されている',
                  pg.evaluate(f"() => !!localStorage.getItem('{NS}:profile')"))
            check('外へ勝手に出ていかない', not soto, ' / '.join(soto[:2]))

            # ---- 2. 合言葉を入れると届く ----
            pg.evaluate("""([url, aikotoba]) => window.MFK_DB.setteiWoKaku(url, aikotoba)""",
                        [SABA, AIKOTOBA])
            pg.wait_for_timeout(1500)
            check('つながっている状態になる', pg.evaluate("() => window.MFK_DB.tsunagatteiru()"))

            pg.fill('.ima-gyou input', '45')
            pg.wait_for_timeout(4500)
            azu = azukari_wo_yomu()
            check('入力した内容がサーバへ届く', 'profile' in azu['azukari'],
                  str(list(azu['azukari'].keys())))
            todoita = azu['azukari'].get('profile') or {}
            crops = todoita.get('crops') or []
            check('面積が正しく届く（45a＝4.5）', crops and crops[0].get('area10a') == 4.5,
                  json.dumps(crops, ensure_ascii=False))
            check('保存した時刻も届く', bool(azu['koushin'].get('profile')))

            # ---- 3. 端末を空にすると、サーバから戻る ----
            pg.evaluate(f"""() => {{
              const setteiRaw = localStorage.getItem('{NS}:sabaSetting');
              localStorage.clear();
              localStorage.setItem('{NS}:sabaSetting', setteiRaw);
            }}""")
            check('端末を空にした', pg.evaluate(f"() => !localStorage.getItem('{NS}:profile')"))
            hairu(pg, 'tools/hinmoku.html', 2500)
            modotta = pg.evaluate(f"() => JSON.parse(localStorage.getItem('{NS}:profile') || 'null')")
            check('サーバから戻ってくる', bool(modotta and modotta.get('crops')),
                  json.dumps(modotta, ensure_ascii=False) if modotta else 'null')
            check('戻した面積が合っている',
                  modotta and modotta['crops'][0].get('area10a') == 4.5,
                  json.dumps(modotta.get('crops') if modotta else None, ensure_ascii=False))
            check('画面にも出る', pg.locator('.ima-gyou').count() == 1,
                  str(pg.locator('.ima-gyou').count()))

            # ---- 4. 案と計画が別の道で残る ----
            PLAN = {
                "years": 5, "livingMan": 20, "fixedMan": 100, "cashStartMan": 300, "targetMan": 400,
                "loan": {"amountMan": 0, "ratePct": 1.5, "termY": 10, "graceY": 1},
                "items": [{"cropId": "tomato", "area": 30, "yieldV": 8000, "priceV": 300,
                           "costRate": 0.6, "laborH10a": 900, "curve": [100] * 10, "typhoonExp": 0}],
                "invests": [], "hojo": {"amountMan": 0, "year": 1},
            }
            NOZOMI = {"nen": 5, "mokuhyouMan": 400, "roudouKibou": 5000,
                      "kariireJougenMan": 0, "tebanasanai": [],
                      "updatedAt": "2026-08-16T00:00:00.000Z"}
            pg.evaluate("""([plan, nozomi]) => {
              CORE.store.save('simPlan', plan);
              CORE.store.save('nozomi', nozomi);
            }""", [PLAN, NOZOMI])
            # 送るまでの待ち（3秒）に加えて、2つぶんの送りが終わるまで余裕を見る
            pg.wait_for_timeout(7000)
            azu = azukari_wo_yomu()
            check('計画がサーバへ届く', 'simPlan' in azu['azukari'])
            check('なりたい姿がサーバへ届く', 'nozomi' in azu['azukari'])

            hairu(pg, 'tools/teian.html', 1200)
            check('AIにつながっている旨が出る（つながっていないとは書かない）',
                  'AIにつながっていない' not in pg.inner_text('#dasuSub'),
                  pg.inner_text('#dasuSub')[:60])
            pg.click('#dasu')
            pg.wait_for_timeout(2500)
            azu = azukari_wo_yomu()
            check('AIが呼ばれる', any(x['shurui'] == 'naoshidokoro' for x in azu['aiYobareta']),
                  json.dumps([x['shurui'] for x in azu['aiYobareta']]))
            yobareta = [x for x in azu['aiYobareta'] if x['shurui'] == 'naoshidokoro']
            z = yobareta[0]['zairyou'] if yobareta else {}
            check('AIへ氏名や住所を渡していない',
                  not any(k in json.dumps(z, ensure_ascii=False) for k in ['氏名', '住所', '電話']),
                  json.dumps(z, ensure_ascii=False)[:80])
            check('出した案がサーバへ残る', len(azu['teian']) >= 1, str(len(azu['teian'])))
            check('AIが返した打ち手が画面に出る',
                  '単価を2割上げる' in pg.inner_text('#kekka'), pg.inner_text('#kekka')[:80])
            check('見本の断りは出ない（本物につながっているため）',
                  '見本の受け答えです' not in pg.inner_text('#kekka'))

            pg.locator('.an button[data-ire]').first.click()
            pg.wait_for_timeout(1800)
            azu = azukari_wo_yomu()
            check('本人が選んだ案が残る',
                  any(x.get('eranda') for x in azu['teian']),
                  json.dumps([x.get('eranda') for x in azu['teian']], ensure_ascii=False))
            check('選んだときの計画と計算結果が残る', len(azu['keikaku']) >= 1, str(len(azu['keikaku'])))
            if azu['keikaku']:
                kk = azu['keikaku'][-1].get('kekka') or {}
                check('計算結果に金額が入っている（画面が計算したもの）',
                      isinstance(kk.get('finalIncome'), (int, float)), json.dumps(kk))

            # ---- 5. サーバが落ちても端末では動く ----
            saba.terminate()
            time.sleep(1.0)
            hairu(pg, 'tools/hinmoku.html', 2500)
            check('サーバが落ちていても画面は開く', pg.locator('#cardIma').count() == 1)
            check('サーバが落ちていても端末の中身は残る',
                  pg.evaluate(f"() => !!localStorage.getItem('{NS}:profile')"))
            pg.fill('.ima-gyou input', '60')
            pg.wait_for_timeout(3000)
            check('サーバが落ちていても端末には保存できる',
                  pg.evaluate(f"() => JSON.parse(localStorage.getItem('{NS}:profile')).crops[0].area10a") == 6)

            check('画面のエラーが無い', len(err) == 0, ' / '.join(err[:3]))
            b.close()
    finally:
        haishin.terminate()
        try:
            saba.terminate()
        except Exception:
            pass

    print('')
    for x in fugokaku:
        print('  不合格', x)
    print(f'\nサーバへ預ける通しの検査  合格 {ok}件 / 不合格 {ng}件')
    return 1 if ng else 0


if __name__ == '__main__':
    sys.exit(main())
