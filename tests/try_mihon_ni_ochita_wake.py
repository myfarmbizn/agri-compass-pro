# -*- coding: utf-8 -*-
"""見本の受け答えに落ちたとき、その理由が農家に正しく伝わるかを確かめる。

なぜ要るか。
画面は、見本になった理由を「サーバがまだ設定されていないため」と決め打ちで出していた。
AIに聞ける回数の上限（1軒30回）に達したときも同じ文が出るため、
農家は設定の問題だと思い込み、いつまでも直そうとしてしまう。
上限に達したなら、そう伝えるのが正しい。

確かめること。
  一 回数の上限に達したときは、その旨が出る
  二 呼んだが返ってこなかったときは、そう出る
  三 そもそもつながっていないときは、これまでどおり設定の話が出る
  四 どの場合でも、画面は最後まで進める（既定の案が出る）

受け口は偽物を立てて確かめる（実機のAIは呼ばない）。

走らせ方:  python tests/try_mihon_ni_ochita_wake.py
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
PORT = 8197
SABA = 8198
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
    # 画面を配る
    haisin = subprocess.Popen(
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

    # 受け口の偽物。/compass/ai だけ、決めた断りを返す
    saba = subprocess.Popen(
        ['node', '-e', f'''
const http=require("http");
let kotae={{code:429, message:"AIに聞ける回数の上限（30回）に達しました。いまは作りの途中のため回数を絞っています。"}};
const s=http.createServer((q,r)=>{{
  const h={{"access-control-allow-origin":"*",
            "access-control-allow-headers":"content-type,authorization",
            "access-control-allow-methods":"GET,POST,OPTIONS",
            "content-type":"application/json; charset=utf-8"}};
  if(q.method==="OPTIONS"){{r.writeHead(204,h);r.end();return;}}
  let body="";
  q.on("data",d=>body+=d);
  q.on("end",()=>{{
    if(q.url==="/_kimeru"){{ kotae=JSON.parse(body||"{{}}"); r.writeHead(200,h); r.end("{{}}"); return; }}
    if(q.url==="/welcome"){{ r.writeHead(200,h); r.end(JSON.stringify({{aikotoba:"TESTTEST",namae:"試し"}})); return; }}
    if(q.url==="/compass"){{ r.writeHead(200,h); r.end(JSON.stringify({{azukari:{{}},koushin:{{}}}})); return; }}
    if(q.url==="/compass/ai"){{
      r.writeHead(kotae.code||500,h);
      r.end(JSON.stringify({{message:kotae.message}}));
      return;
    }}
    r.writeHead(200,h); r.end("{{}}");
  }});
}});
s.listen({SABA},"127.0.0.1");
'''], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    for port in (PORT, SABA):
        for _ in range(80):
            try:
                socket.create_connection(('127.0.0.1', port), 0.2).close()
                break
            except OSError:
                time.sleep(0.1)

    B = f'http://127.0.0.1:{PORT}'
    SABA_URL = f'http://127.0.0.1:{SABA}'
    try:
        with sync_playwright() as pw:
            b = pw.chromium.launch()
            pg = b.new_page(viewport={'width': 1280, 'height': 1100})
            err = []
            pg.on('pageerror', lambda e: err.append(str(e)))
            pg.on('dialog', lambda d: d.accept())
            pg.route('**/*', lambda r: r.continue_() if '127.0.0.1' in r.request.url else r.abort())

            # ---- 三 つながっていないとき ----
            pg.goto(B + '/tools/teian.html', wait_until='domcontentloaded')
            pg.wait_for_timeout(1200)
            pg.evaluate("()=>localStorage.clear()")
            pg.evaluate(f"""()=>{{
              CORE.store.save('simPlan', {{years:5, livingMan:0, fixedMan:0, cashStartMan:0,
                targetMan:600, loan:{{amountMan:0,ratePct:2,termY:10,graceY:3}},
                items:[{{cropId:'goya_sokusei', area:30, yieldV:8000, priceV:300,
                        costRate:0.6, laborH10a:900, curve:[100,100,100,100,100,100,100,100,100,100],
                        typhoonExp:0}}], invests:[], hojo:{{amountMan:0,year:1}}}});
              CORE.store.save('nozomi', {{nen:5, mokuhyouMan:700, roudouKibou:2000,
                                          kariireJougenMan:0, tebanasanai:[]}});
            }}""")
            pg.goto(B + '/tools/teian.html', wait_until='domcontentloaded')
            pg.wait_for_timeout(2000)
            pg.click('#dasu')
            pg.wait_for_timeout(4000)
            t = pg.inner_text('body')
            check('つながっていないときは、設定の話が出る',
                  '設定' in t or '受け口' in t, t[:150])
            check('つながっていなくても案が出る', '万円' in t, t[:120])

            # ---- 一 回数の上限 ----
            pg.evaluate(f"""(u)=>{{
              CORE.store.save('sabaSetting', {{url:u, aikotoba:'TESTTEST'}});
            }}""", SABA_URL)
            pg.goto(B + '/tools/teian.html', wait_until='domcontentloaded')
            pg.wait_for_timeout(2500)
            pg.click('#dasu')
            pg.wait_for_timeout(5000)
            t = pg.inner_text('body')
            check('回数の上限に達したことが画面に出る', '上限' in t, t[:200])
            check('上限のときに、設定の話を出さない',
                  'サーバがまだ設定されていない' not in t, t[:200])
            check('上限でも案は最後まで出る', '万円' in t, t[:120])

            # ---- 二 呼んだが返ってこない ----
            pg.request.post(SABA_URL + '/_kimeru',
                            data=json.dumps({'code': 500, 'message': 'AIが返ってきませんでした'}))
            pg.goto(B + '/tools/teian.html', wait_until='domcontentloaded')
            pg.wait_for_timeout(2500)
            pg.click('#dasu')
            pg.wait_for_timeout(5000)
            t = pg.inner_text('body')
            check('返ってこなかったことが出る', '返ってこなかった' in t or '返ってきません' in t, t[:200])
            check('返ってこなくても案は出る', '万円' in t, t[:120])

            # ---- 計画書の読み合わせでも同じか ----
            pg.request.post(SABA_URL + '/_kimeru',
                            data=json.dumps({'code': 429,
                                             'message': 'AIに聞ける回数の上限（30回）に達しました。'}))
            pg.goto(B + '/tools/keikaku.html', wait_until='domcontentloaded')
            pg.wait_for_timeout(3000)
            yomi = pg.locator('button:has-text("読み合わせ")')
            if yomi.count():
                yomi.first.click()
                pg.wait_for_timeout(5000)
                t = pg.inner_text('body')
                check('計画書の読み合わせでも、上限が伝わる', '上限' in t, t[:200])
                check('計画書でも、機械で分かる指摘は出る',
                      '指摘' in t or '読み合わせました' in t, t[:150])

            check('画面のエラーが無い', len(err) == 0, ' / '.join(err[:2]))
            b.close()
    finally:
        haisin.terminate()
        saba.terminate()

    print('')
    for x in fugokaku:
        print('  不合格', x.encode('cp932', 'replace').decode('cp932'))
    print(f'\n見本に落ちた理由が伝わるかの検査  合格 {ok}件 / 不合格 {ng}件')
    return 1 if ng else 0


if __name__ == '__main__':
    sys.exit(main())
