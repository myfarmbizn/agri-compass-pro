# -*- coding: utf-8 -*-
"""全ページをブラウザで開いて押して回る検査。

書類の検査（node の verify_*.js）では出ない不具合を捕まえるためのもの。
実際に開く・押す・保存を見る、の3つを全ページに当てる。

走らせ方:  python tests/try_gamen.py
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
PORT = 8188
BASE = f'http://127.0.0.1:{PORT}'
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


# この版にあるページ。ここに無いものは消したページ
PAGES = [
    ('index.html', 'ふりだし'),
    ('guide.html', '見取り図'),
    ('tools/hinmoku.html', '段1 品目と単価'),
    ('tools/kiroku.html', '段2 記録を入れる'),
    ('tools/checkup.html', '段3 実績の診断'),
    ('tools/sakutsuke.html', '段4 作付けの決定'),
    ('tools/simulator.html', '段4 経営シミュレーター'),
    ('tools/shikin.html', '段4 資金繰り'),
    ('tools/toushi.html', '段4 投資・雇用'),
    ('tools/taifu.html', '段4 災害への備え'),
    ('tools/nozomi.html', '段5 なりたい姿'),
    ('tools/teian.html', '段6 計画の直しどころ'),
    ('tools/keikaku.html', '段7 計画書'),
    ('tools/konkyo.html', '根拠しらべ'),
    ('tools/hanro.html', '出荷先比較'),
    ('tools/smart.html', 'スマート農業申請'),
    ('tools/kibi.html', 'さとうきび配分'),
    ('tools/gyakusan.html', '目標から逆算'),
]

# 消したページ。開けてはいけない
KESHITA = ['tools/check10.html', 'tools/kurabe.html', 'tools/kyuyo.html',
           'tools/soudan.html', 'sites/aic/index.html', 'jimukyoku/index.html']

TAMESHI_PLAN = {
    "years": 5, "livingMan": 20, "fixedMan": 100, "cashStartMan": 300, "targetMan": 400,
    "famPeople": 2, "famHours": 160,
    "loan": {"amountMan": 0, "ratePct": 1.5, "termY": 10, "graceY": 1},
    "items": [{"cropId": "tomato", "area": 30, "yieldV": 8000, "priceV": 300,
               "costRate": 0.6, "laborH10a": 900, "curve": [100] * 10, "typhoonExp": 0}],
    "invests": [], "hojo": {"amountMan": 0, "year": 1},
}
TAMESHI_NOZOMI = {"nen": 5, "mokuhyouMan": 400, "roudouKibou": 5000,
                  "kariireJougenMan": 0, "tebanasanai": [],
                  "updatedAt": "2026-08-16T00:00:00.000Z"}


def hairu(pg, path, machi=600):
    pg.goto(f'{BASE}/{path}', wait_until='domcontentloaded')
    pg.wait_for_timeout(machi)


def main():
    # tests/serve.js はポート8123の決め打ちなので、ここでは別のポートで同じ作りの配信を立てる
    # （つなぎっぱなしの時間を延ばす。これが無いと連続の読み込みで止まる）
    srv = subprocess.Popen(
        ['node', '-e', f'''
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
'''], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    for _ in range(80):
        try:
            socket.create_connection(('127.0.0.1', PORT), 0.2).close()
            break
        except OSError:
            time.sleep(0.1)

    try:
        with sync_playwright() as p:
            b = p.chromium.launch()
            pg = b.new_page(viewport={'width': 1280, 'height': 950})
            err = []
            # 手元の配信だけ通す。外への通信は落とす（通信待ちで検査が止まるのを防ぐ）
            pg.route('**/*', lambda route: route.continue_()
                     if '127.0.0.1' in route.request.url else route.abort())
            pg.on('pageerror', lambda e: err.append(str(e)))
            pg.on('dialog', lambda d: d.accept())

            # 試すための計画となりたい姿を先に置く
            hairu(pg, 'tools/hinmoku.html', 400)
            pg.evaluate("""([ns, plan, nozomi]) => {
              localStorage.setItem(ns + ':simPlan', JSON.stringify(plan));
              localStorage.setItem(ns + ':nozomi', JSON.stringify(nozomi));
            }""", [NS, TAMESHI_PLAN, TAMESHI_NOZOMI])

            # ---- 1. 全ページが開く ----
            for path, na in PAGES:
                mae = len(err)
                hairu(pg, path)
                check(f'{na} が開く', pg.locator('h1').count() > 0, path)
                check(f'{na} に画面のエラーが無い', len(err) == mae,
                      ' / '.join(err[mae:mae + 2]))
                if path != 'index.html':
                    check(f'{na} に上のナビが出る', pg.locator('.nm-step, .nav-home').count() > 0)
                    # 消したページへの案内が残っていないか
                    hrefs = pg.eval_on_selector_all('a[href]', 'a => a.map(x => x.getAttribute("href"))')
                    warui = [h for h in hrefs if h and any(k in h for k in
                             ['check10', 'kurabe.html', 'kyuyo', 'soudan', 'sites/', 'jimukyoku'])]
                    check(f'{na} に消したページへの案内が無い', not warui, str(warui[:3]))

            # ---- 2. 消したページは開けない ----
            for path in KESHITA:
                r = pg.request.get(f'{BASE}/{path}')
                check(f'{path} は無い', r.status == 404, str(r.status))

            # ---- 3. ふりだしは段1へ送る ----
            pg.goto(f'{BASE}/index.html', wait_until='domcontentloaded')
            pg.wait_for_timeout(900)
            check('ふりだしから段1へ移る', 'hinmoku.html' in pg.url, pg.url)

            # ---- 4. 段1で入れると見通しが出る ----
            hairu(pg, 'tools/hinmoku.html')
            v = pg.eval_on_selector('#imaSel', 'e => e.options.length > 1 ? e.options[1].value : ""')
            check('段1に足せる品目がある', bool(v))
            if v:
                pg.select_option('#imaSel', v)
                pg.click('#imaAdd')
                pg.wait_for_timeout(200)
                pg.fill('.ima-gyou input', '30')
                pg.wait_for_timeout(400)
                moji = pg.inner_text('#imaKekka')
                check('段1で1年の見通しが出る', '1年の売上' in moji and '万円' in moji)
                check('段1で入れていないものを正直に書く', 'まだ入っていません' in moji)

            # ---- 5. 段6が案を出す ----
            hairu(pg, 'tools/teian.html')
            check('段6が押せる', not pg.is_disabled('#dasu'))
            pg.click('#dasu')
            pg.wait_for_timeout(1400)
            check('段6が案を出す', pg.locator('.an').count() >= 3, str(pg.locator('.an').count()))
            check('段6が見本だと書く', '見本の受け答えです' in pg.inner_text('#kekka'))

            # ---- 6. 段7が読み合わせる ----
            hairu(pg, 'tools/keikaku.html', 900)
            check('段7に読み合わせの節がある', pg.locator('#cardYomi').count() == 1)
            if pg.locator('#btnYomi').count():
                pg.click('#btnYomi')
                pg.wait_for_timeout(1300)
                check('段7が指摘を出す', len(pg.inner_text('#yomiKekka')) > 10)

            # ---- 7. 3つの幅で横にはみ出さない ----
            for path, na in PAGES:
                if path == 'index.html':
                    continue
                hairu(pg, path, 400)
                for haba, hn in [(1280, '机'), (820, '板'), (390, '電話')]:
                    pg.set_viewport_size({'width': haba, 'height': 900})
                    pg.wait_for_timeout(150)
                    over = pg.evaluate(
                        "() => document.documentElement.scrollWidth - document.documentElement.clientWidth")
                    check(f'{na} が{hn}({haba}px)で横にはみ出さない', over <= 0, f'{over}px')
                pg.set_viewport_size({'width': 1280, 'height': 950})


            # ---- 8. 進む道が1本か ----
            # 作った理由：シミュレーターの下に、ページ側の「資金繰りへ進む」と
            # 順路の帯の「次へ進む」が並び、進む道が2本に見える状態でNMから差し戻しを受けた
            # （2026-08-04「2こ進む道がある。すごくわかりにくい」）。
            for path, na in PAGES:
                if path == 'index.html':
                    continue
                hairu(pg, path, 700)
                r = pg.evaluate("""() => {
                  const h = document.body.scrollHeight;
                  const list = [...document.querySelectorAll('.jny-next, .btn.primary, a.btn.primary')]
                    .filter(el => el.offsetParent !== null)
                    .map(el => {
                      const box = el.getBoundingClientRect();
                      return { top: box.top + window.scrollY,
                               text: (el.textContent||'').replace(/\\s+/g,' ').trim().slice(0,30),
                               href: el.getAttribute('href') || '' };
                    });
                  const shita = list.filter(x => x.top > h * 0.55 && x.href && x.href.indexOf('#') !== 0);
                  // 上と下の帯に同じ「次へ」が出るのは、順路の帯の作りとして意図したもの。
                  // NMの指摘は「1つの画面の下に進む道が2本ある」だったので、下側だけで重なりを見る。
                  const shitaHrefs = shita.map(x => x.href.split('#')[0]);
                  const dup = shitaHrefs.filter((v,i) => v && shitaHrefs.indexOf(v) !== i);
                  return { shita, dup };
                }""")
                check(f'{na} の下側に進む道が2本以上ない', len(r['shita']) <= 1,
                      ' / '.join(x['text'] for x in r['shita']))
                check(f'{na} の下側に同じ行き先が重なっていない', not r['dup'],
                      str(r['dup'][:2]))

            # ---- 9. 画面に出る日本語の作り ----
            # 禁止語の検査（check_kinshigo.py）は「語」を見る。ここは「文の作り」を見る。
            NIHONGO_TAISHOU = ['tools/hinmoku.html', 'tools/kiroku.html', 'tools/nozomi.html',
                               'tools/teian.html', 'guide.html']
            KASANE = ['ところ', 'こと', 'もの', 'ここ', 'ため', 'など']
            WARUI = [
                ('その人の', '読み手のことは「あなたの」と書く'),
                ('利用者は', '画面の中では読み手を「利用者」と呼ばない'),
                ('を行います', 'お役所調。「〜します」に開く'),
                ('を実施します', 'お役所調。「〜します」に開く'),
                ('という形で', '翻訳調'),
                ('といった形', '翻訳調'),
                ('することが可能', '「できます」に開く'),
            ]
            for path in NIHONGO_TAISHOU:
                hairu(pg, path, 700)
                bun = pg.evaluate("""() => {
                  const out = [];
                  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
                  let n;
                  while ((n = w.nextNode())) {
                    const el = n.parentElement;
                    if (!el || el.closest('script, style, code, pre')) continue;
                    if (!el.offsetParent && el.tagName !== 'BODY') continue;
                    const t = (n.textContent||'').replace(/\\s+/g,' ').trim();
                    if (t.length < 6) continue;
                    t.split(/(?<=。)/).forEach(x => { const y = x.trim(); if (y.length >= 6) out.push(y); });
                  }
                  return out;
                }""")
                nagai = [x for x in bun if len(x) > 70]
                check(f'{path} に70字を超える文が無い', not nagai, (nagai[0][:50] + '…') if nagai else '')
                kasane = [x for x in bun if any(x.count(w) >= 2 for w in KASANE)]
                check(f'{path} に同じ語を重ねた文が無い', not kasane, (kasane[0][:50] + '…') if kasane else '')
                waru = [(x, r) for x in bun for (g, r) in WARUI if g in x]
                check(f'{path} に翻訳調・お役所調が無い', not waru,
                      (waru[0][0][:40] + ' → ' + waru[0][1]) if waru else '')

            b.close()
    finally:
        srv.terminate()

    print('')
    for x in fugokaku:
        print('  不合格', x)
    print(f'\n画面を押して回る検査  合格 {ok}件 / 不合格 {ng}件')
    return 1 if ng else 0


if __name__ == '__main__':
    sys.exit(main())
