# -*- coding: utf-8 -*-
"""公開先を、段1から段7まで実際に押して一周する。

手元の配信ではなく、公開されている本物のURLを開く。
手元では通るのに公開先では通らない、という食い違いを捕まえるためのもの。

走らせ方:  python tests/try_koukai_isshuu.py
"""
import json
from playwright.sync_api import sync_playwright

B = 'https://myfarmbizn.github.io/agri-compass-pro'
NS = 'myfarm-agri-compass-pro'
ok = ng = 0

def check(na, j, soe=''):
    global ok, ng
    if j: ok += 1
    else:
        ng += 1
        print('  不合格', na, str(soe)[:110].encode('cp932','replace').decode('cp932'))

with sync_playwright() as pw:
    b = pw.chromium.launch(); pg = b.new_page(viewport={'width':1280,'height':1100})
    err = []
    pg.on('pageerror', lambda e: err.append(str(e)))
    pg.on('dialog', lambda d: d.accept())

    # 段1
    pg.goto(B + '/tools/hinmoku.html', wait_until='domcontentloaded'); pg.wait_for_timeout(2500)
    pg.evaluate("()=>localStorage.clear()")
    pg.reload(wait_until='domcontentloaded'); pg.wait_for_timeout(2500)
    check('段1が開く', pg.locator('#imaSel').count() == 1)
    check('どの県かを選ぶ欄がある', pg.locator('#chiikiSel').count() == 1)
    ken = pg.locator('#chiikiSel option').count()
    check('選び先が13そろっている（品目を持つ11県＋沖縄＋その他）', ken == 13, str(ken))

    pg.select_option('#imaSel', index=1)
    pg.click('#imaAdd'); pg.wait_for_timeout(600)
    men = pg.locator('#imaList input[type=number]').first
    men.fill('30'); men.dispatch_event('input'); pg.wait_for_timeout(1500)
    t = pg.inner_text('body')
    check('その場で見通しが出る', '万円' in t, t[:120])
    sp = pg.evaluate(f"()=>JSON.parse(localStorage.getItem('{NS}:simPlan')||'null')")
    check('段1が計画に書く', bool(sp and sp.get('items')), str(sp)[:100])

    # 進み具合
    jn = pg.inner_text('body')
    check('段1が完了になる', ('✓' in jn), jn[:80])

    # 段3（実績の診断）
    pg.goto(B + '/tools/checkup.html', wait_until='domcontentloaded'); pg.wait_for_timeout(2500)
    check('品目に紐づかない収入の欄がある', pg.locator('#inKaji').count() == 1)
    check('収入合計の内訳が出る', pg.locator('#kpiSalesSub').count() == 1)

    # 段4（資金繰り）
    pg.goto(B + '/tools/shikin.html', wait_until='domcontentloaded'); pg.wait_for_timeout(2500)
    check('資金繰りが開く', len(pg.inner_text('body')) > 500)

    # 段5（なりたい姿）
    pg.goto(B + '/tools/nozomi.html', wait_until='domcontentloaded'); pg.wait_for_timeout(2000)
    check('なりたい姿が開く', len(pg.inner_text('body')) > 500)

    # 段6（直しどころ）
    pg.goto(B + '/tools/teian.html', wait_until='domcontentloaded'); pg.wait_for_timeout(3000)
    check('直しどころが開く', len(pg.inner_text('body')) > 500)

    # 段7（計画書）
    pg.goto(B + '/tools/keikaku.html', wait_until='domcontentloaded'); pg.wait_for_timeout(3000)
    k = pg.inner_text('body')
    check('計画書が出る', '事業計画書' in k, k[:100])
    check('資金繰りの節がある', '７．' in k, k[:100])

    # 順路の外の道具
    pg.goto(B + '/tools/hinmoku.html', wait_until='domcontentloaded'); pg.wait_for_timeout(2000)
    ich = pg.locator('.nav-more summary')
    if ich.count():
        ich.first.click(); pg.wait_for_timeout(500)
        m = pg.inner_text('.nav-more-menu')
        check('そのほかの道具が一覧に出る', 'そのほかの道具' in m, m[:150])
        check('根拠しらべへ行ける', 'konkyo' in pg.inner_html('.nav-more-menu'), '')
    check('一周してエラーが無い', len(err) == 0, ' / '.join(err[:3]))
    b.close()
print(f'\n公開先を一周する検査  合格 {ok}件 / 不合格 {ng}件')
