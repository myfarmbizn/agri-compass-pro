# -*- coding: utf-8 -*-
"""紙に出したときに崩れていないかを見る。計画書は紙で持っていくもの。

A4で書き出し、文字が入っているか、画面でしか使わない操作の言葉が紙へ出ていないかを見る。
書き出した紙は、この置き場の外（一時の置き場）へ出す。

走らせ方:  python tests/try_kami_ni_dasu.py
"""
import os, re
from playwright.sync_api import sync_playwright
B='https://myfarmbizn.github.io/agri-compass-pro'; NS='myfarm-agri-compass-pro'
ok=ng=0
def check(na,j,soe=''):
    global ok,ng
    if j: ok+=1
    else:
        ng+=1
        print('  不合格',na,str(soe)[:130].encode('cp932','replace').decode('cp932'))

import tempfile
DASU=tempfile.gettempdir()
with sync_playwright() as pw:
    b=pw.chromium.launch(); pg=b.new_page(viewport={'width':1280,'height':1100})
    err=[]; pg.on('pageerror', lambda e: err.append(str(e)))

    # 中身を入れてから
    pg.goto(B+'/tools/hinmoku.html', wait_until='domcontentloaded'); pg.wait_for_timeout(2500)
    pg.evaluate("()=>localStorage.clear()")
    pg.reload(wait_until='domcontentloaded'); pg.wait_for_timeout(2000)
    pg.select_option('#imaSel', index=1); pg.click('#imaAdd'); pg.wait_for_timeout(500)
    men=pg.locator('#imaList input[type=number]').first
    men.fill('30'); men.dispatch_event('input'); pg.wait_for_timeout(2000)

    for na, michi in [('計画書','keikaku'), ('実績の診断','checkup'), ('直しどころ','teian')]:
        pg.goto(f'{B}/tools/{michi}.html', wait_until='domcontentloaded'); pg.wait_for_timeout(3000)
        pdf=os.path.join(DASU, f'_kami_{michi}.pdf')
        pg.pdf(path=pdf, format='A4', print_background=True,
               margin={'top':'12mm','bottom':'12mm','left':'12mm','right':'12mm'})
        check(f'{na} が紙に出せる', os.path.exists(pdf) and os.path.getsize(pdf) > 3000,
              str(os.path.getsize(pdf)) if os.path.exists(pdf) else 'できていない')
        # 中身を読み出して、画面にしか無い言葉が紙へ出ていないかを見る
        try:
            import fitz
            d=fitz.open(pdf)
            moji=''.join(p.get_text() for p in d)
            kazu=d.page_count
            d.close()
            check(f'{na} の紙に文字が入っている', len(moji) > 200, f'{len(moji)}字')
            print(f'  {na}: {kazu}ページ / {len(moji)}字')
            warui=[w for w in ('保存する','この端末に保存','ページ一覧','操作の記録を書き出す') if w in moji]
            check(f'{na} の紙に、画面用の操作が出ていない', not warui, str(warui))
        except ImportError:
            print('  （PyMuPDFが無いので中身は読めない）')
    check('エラーが無い', len(err)==0, ' / '.join(err[:2]))
    b.close()
print(f'\n紙に出したときの検査  合格 {ok}件 / 不合格 {ng}件')
