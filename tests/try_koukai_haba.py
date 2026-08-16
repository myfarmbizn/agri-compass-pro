# -*- coding: utf-8 -*-
"""公開先を電話・板・机の3つの幅で開き、押したいものに手が届くかを見る。

見るのは2つ。ページ本体が横にずれないこと（ずれると読む場所を見失う）と、
操作するもの（欄・選び先・釦）に寄せれば届くこと。
表のように横へ流して読む作りのものは、流せる入れ物の中にあれば困らないので、
「はみ出しているか」でなく「寄せれば押せるか」で見る。

走らせ方:  python tests/try_koukai_haba.py
"""
from playwright.sync_api import sync_playwright
B='https://myfarmbizn.github.io/agri-compass-pro'
ok=ng=0
def check(na,j,soe=''):
    global ok,ng
    if j: ok+=1
    else:
        ng+=1
        print('  不合格',na,str(soe)[:120].encode('cp932','replace').decode('cp932'))

HABA=[('電話',390,844),('板',834,1112),('机',1440,900)]
MITA=['hinmoku','checkup','taifu','keikaku','kiroku']
with sync_playwright() as pw:
    b=pw.chromium.launch()
    for na,w,h in HABA:
        pg=b.new_page(viewport={'width':w,'height':h})
        err=[]; pg.on('pageerror', lambda e: err.append(str(e)))
        for m in MITA:
            pg.goto(f'{B}/tools/{m}.html', wait_until='domcontentloaded'); pg.wait_for_timeout(2200)
            yoko=pg.evaluate("()=>document.documentElement.scrollWidth - document.documentElement.clientWidth")
            check(f'{na} {m} が横にはみ出さない', yoko <= 2, f'{yoko}px')
            # はみ出していても、寄せれば押せるなら困らない（表は横に流して読む作り）。
            # 寄せても押せないものだけを不合格にする
            hamidashi = []
            el = pg.locator('input:visible, select:visible, button:visible')
            for idx in range(min(el.count(), 60)):
                e = el.nth(idx)
                bx = e.bounding_box()
                if not bx:
                    continue
                if bx['x'] + bx['width'] <= w + 2 and bx['x'] >= -2:
                    continue
                try:
                    e.scroll_into_view_if_needed(timeout=2000)
                    bx2 = e.bounding_box()
                    if bx2 and (bx2['x'] + bx2['width'] > w + 2 or bx2['x'] < -2):
                        hamidashi.append((e.get_attribute('id') or e.inner_text()[:14]))
                except Exception:
                    hamidashi.append((e.get_attribute('id') or 'なまえ不明') + '（寄せられない）')
            check(f'{na} {m} の操作する所に届く', not hamidashi, str(hamidashi[:4]))
        check(f'{na} でエラーが無い', len(err)==0, ' / '.join(err[:2]))
        pg.close()
    b.close()
print(f'\n携帯・板・机の幅で見る検査  合格 {ok}件 / 不合格 {ng}件')
