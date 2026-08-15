# -*- coding: utf-8 -*-
"""NMからの指摘3件を直したかどうかを確かめる（2026年8月16日）。

  1. 段1で入れた品目と面積が、経営シミュレーターと計画の直しどころに渡ること
     （これまでは農場の情報にしか書いておらず、渡っていなかった）
  2. 自分の数字が無くても、直しどころを出せること（自分の数字は任意）
  3. 住所を決めれば、農家が何もしなくてもサーバへ預かること
     （合言葉をこちらから自動で作る）。あわせて保存先の案内が正しく書き替わること

走らせ方:  python tests/try_naoshi.py
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
HAISHIN_PORT = 8195
SABA_PORT = 8196
BASE = f'http://127.0.0.1:{HAISHIN_PORT}'
SABA = f'http://127.0.0.1:{SABA_PORT}'
NS = 'myfarm-agri-compass-pro'
AIKOTOBA = 'TESTPASS'
OUT = os.path.join(KOKO, 'naoshi_azukari.json')

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
        return {'azukari': {}, 'mukaeireta': []}


def hairu(pg, path, machi=900):
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
            pg.on('pageerror', lambda e: err.append(str(e)))
            pg.on('dialog', lambda d: d.accept())
            pg.route('**/*', lambda r: r.continue_()
                     if '127.0.0.1' in r.request.url else r.abort())

            # ============================================================
            # 1. 段1で入れたものが、その先へ渡るか
            # ============================================================
            hairu(pg, 'tools/hinmoku.html')
            pg.evaluate("() => localStorage.clear()")
            hairu(pg, 'tools/hinmoku.html')

            v = pg.eval_on_selector('#imaSel', 'e => e.options[1].value')
            pg.select_option('#imaSel', v)
            pg.click('#imaAdd')
            pg.wait_for_timeout(300)
            pg.fill('.ima-gyou input', '30')
            pg.wait_for_timeout(700)

            plan = pg.evaluate(f"() => JSON.parse(localStorage.getItem('{NS}:simPlan') || 'null')")
            check('段1で入れると計画ができる', bool(plan and plan.get('items')),
                  json.dumps(plan, ensure_ascii=False)[:90] if plan else 'null')
            check('計画の品目が1件', plan and len(plan['items']) == 1,
                  str(len(plan['items']) if plan else 0))
            check('計画の面積が30a', plan and plan['items'][0].get('area') == 30,
                  str(plan['items'][0].get('area') if plan else None))
            check('計画に単収と単価が入る',
                  plan and plan['items'][0].get('yieldV') and plan['items'][0].get('priceV'))
            check('お金の項目は0のまま（入れていないものを入れたことにしない）',
                  plan and plan.get('fixedMan') == 0 and plan.get('livingMan') == 0,
                  json.dumps({k: plan.get(k) for k in ('fixedMan', 'livingMan')}) if plan else '')
            check('農場の情報にも写る',
                  pg.evaluate(f"() => (JSON.parse(localStorage.getItem('{NS}:profile'))||{{}}).crops[0].area10a") == 3)

            # 経営シミュレーターに渡るか
            hairu(pg, 'tools/simulator.html', 2200)
            sim = pg.evaluate(f"() => JSON.parse(localStorage.getItem('{NS}:simPlan') || 'null')")
            check('シミュレーターが段1の品目を読み込む',
                  sim and len(sim['items']) == 1 and sim['items'][0].get('area') == 30,
                  json.dumps([{'c': i.get('cropId'), 'a': i.get('area')} for i in sim['items']]) if sim else '')

            # 面積を段1で変えると、計画にも届くか
            hairu(pg, 'tools/hinmoku.html')
            pg.fill('.ima-gyou input', '45')
            pg.wait_for_timeout(700)
            plan2 = pg.evaluate(f"() => JSON.parse(localStorage.getItem('{NS}:simPlan'))")
            check('段1で面積を変えると計画も変わる', plan2['items'][0]['area'] == 45,
                  str(plan2['items'][0]['area']))

            # ============================================================
            # 2. 自分の数字が無くても、直しどころを出せるか
            # ============================================================
            pg.evaluate("""(nozomi) => localStorage.setItem(
              'myfarm-agri-compass-pro:nozomi', JSON.stringify(nozomi))""",
                        {"nen": 4, "mokuhyouMan": 930, "roudouKibou": 0,
                         "kariireJougenMan": 0, "tebanasanai": [],
                         "updatedAt": "2026-08-16T00:00:00.000Z"})
            hairu(pg, 'tools/teian.html', 1300)
            zai = pg.inner_text('#zai')
            check('いまの計画が埋まる', 'まだありません' not in zai, zai[:90])
            check('自分の数字は任意だと分かる', '入れなくても進めます' in zai, zai[:90])
            check('自分の数字が無くても、足りない印を付けない',
                  pg.locator('#zai .m.nai').count() == 0,
                  str(pg.locator('#zai .m.nai').count()))
            check('自分の数字が無くても押せる', not pg.is_disabled('#dasu'))

            pg.click('#dasu')
            pg.wait_for_timeout(1600)
            check('自分の数字が無くても案が出る', pg.locator('.an').count() >= 3,
                  str(pg.locator('.an').count()))

            # ============================================================
            # 3. 住所を決めれば、何もしなくてもサーバへ預かるか
            # ============================================================
            # 住所の決め（saba_settei.js）は、この検査のあいだだけ差し替える。
            # 端末に書いても core.js が読み直して上書きするため、読み込みごと横取りする
            pg.evaluate("() => localStorage.clear()")
            nise = ("window.MFK_SABA_SETTEI = { url: '" + SABA + "', namae: 'ためし' };")
            pg.route('**/saba_settei.js', lambda route: route.fulfill(
                status=200, content_type='text/javascript; charset=utf-8', body=nise))
            hairu(pg, 'tools/hinmoku.html', 3000)

            st = pg.evaluate(f"() => JSON.parse(localStorage.getItem('{NS}:sabaSetting') || 'null')")
            check('何もしなくても迎え入れられる', bool(st and st.get('aikotoba')),
                  json.dumps(st, ensure_ascii=False) if st else 'null')
            check('自動で迎え入れた印が残る', bool(st and st.get('jidou')))
            azu = azukari_wo_yomu()
            check('サーバ側にも迎え入れの記録が残る', len(azu.get('mukaeireta', [])) >= 1,
                  json.dumps(azu.get('mukaeireta'), ensure_ascii=False))
            check('つながっている状態になる', pg.evaluate("() => window.MFK_DB.tsunagatteiru()"))

            annai = pg.inner_text('[data-hozon-annai]')
            check('保存先の案内が「端末だけ」でなくなる',
                  'この端末だけです' not in annai, annai[:70])
            check('保存先の案内にサーバが出る',
                  'マイファームのサーバ' in annai, annai[:70])

            # 入れたものが届くか
            v2 = pg.eval_on_selector('#imaSel', 'e => e.options[1].value')
            pg.select_option('#imaSel', v2)
            pg.click('#imaAdd')
            pg.wait_for_timeout(300)
            pg.fill('.ima-gyou input', '25')
            pg.wait_for_timeout(4500)
            azu = azukari_wo_yomu()
            check('入れた計画がサーバへ届く', 'simPlan' in azu['azukari'],
                  str(list(azu['azukari'].keys())))
            todoita = azu['azukari'].get('simPlan') or {}
            check('届いた計画に面積25aが入っている',
                  (todoita.get('items') or [{}])[0].get('area') == 25,
                  json.dumps(todoita.get('items'), ensure_ascii=False)[:80])

            check('画面のエラーが無い', len(err) == 0, ' / '.join(err[:3]))
            b.close()
    finally:
        haishin.terminate()
        try:
            saba.terminate()
        except Exception:
            pass
        if os.path.exists(OUT):
            os.remove(OUT)

    print('')
    for x in fugokaku:
        # 端末の文字の決まりで出せない字（絵文字など）は落として出す
        print('  不合格', x.encode('cp932', 'replace').decode('cp932'))
    print(f'\n指摘3件の直しの検査  合格 {ok}件 / 不合格 {ng}件')
    return 1 if ng else 0


if __name__ == '__main__':
    sys.exit(main())
