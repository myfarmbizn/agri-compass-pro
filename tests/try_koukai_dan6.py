# -*- coding: utf-8 -*-
"""公開先の段6から、実機のAIが本当に呼ばれるかを確かめる。

実機のAIを1回使う（その農園の回数を1つ消費する）。
段1で品目と面積を入れ、なりたい姿を入れ、段6で「出す」を押し、
返った案を計画に入れて、計画書にその事実が出るところまで通す。

走らせ方:  python tests/try_koukai_dan6.py
"""
import json
from playwright.sync_api import sync_playwright
B='https://myfarmbizn.github.io/agri-compass-pro'; NS='myfarm-agri-compass-pro'
ok=ng=0
def check(na,j,soe=''):
    global ok,ng
    if j: ok+=1
    else:
        ng+=1
        print('  不合格',na,str(soe)[:140].encode('cp932','replace').decode('cp932'))

with sync_playwright() as pw:
    b=pw.chromium.launch(); pg=b.new_page(viewport={'width':1280,'height':1100})
    err=[]; pg.on('pageerror', lambda e: err.append(str(e))); pg.on('dialog', lambda d: d.accept())

    pg.goto(B+'/tools/hinmoku.html', wait_until='domcontentloaded'); pg.wait_for_timeout(2500)
    pg.evaluate("()=>localStorage.clear()")
    pg.reload(wait_until='domcontentloaded'); pg.wait_for_timeout(2500)
    pg.select_option('#imaSel', index=1); pg.click('#imaAdd'); pg.wait_for_timeout(600)
    men=pg.locator('#imaList input[type=number]').first
    men.fill('40'); men.dispatch_event('input'); pg.wait_for_timeout(6000)

    # なりたい姿
    pg.goto(B+'/tools/nozomi.html', wait_until='domcontentloaded'); pg.wait_for_timeout(2500)
    pg.evaluate("""()=>CORE.store.save('nozomi',{nen:5,mokuhyouMan:700,roudouKibou:2200,
                 kariireJougenMan:300,tebanasanai:[]})""")
    pg.wait_for_timeout(4000)

    # 段6
    pg.goto(B+'/tools/teian.html', wait_until='domcontentloaded'); pg.wait_for_timeout(3000)
    b6=pg.locator('#btnDasu, #btnAI, button:has-text("出す")')
    if b6.count():
        b6.first.click()
    pg.wait_for_timeout(50000)

    t=pg.inner_text('body')
    check('見本の断りが出ていない（本物につながっている）', '見本' not in t or 'AIが' in t, t[:150])
    an=pg.locator('.an-card, .teian-card, [data-ire]')
    check('案が出る', an.count() >= 1, str(an.count()))
    print('  出た案の数:', an.count())
    if an.count():
        na=[pg.locator('[data-ire]').nth(i).get_attribute('data-ire') for i in range(min(an.count(),4))]
        print('  案の名前:', json.dumps([x for x in na if x], ensure_ascii=False))
    check('金額が出ている（計算エンジンが出したもの）', '万円' in t, t[:120])

    tj=pg.evaluate(f"()=>JSON.parse(localStorage.getItem('{NS}:teian')||'null')")
    check('案が端末に残る', bool(tj and tj.get('an')), str(tj)[:100])
    if tj and tj.get('an'):
        kin=[v for a in tj['an'] for t2 in a.get('teate',[]) for v in t2.values()
             if isinstance(v,(int,float)) and abs(v)>10000]
        check('AIは金額を返していない（打ち手の強さだけ）', not kin, str(kin)[:80])

    # 案を計画に入れる
    ire=pg.locator('[data-ire]')
    if ire.count():
        ire.first.click(); pg.wait_for_timeout(4000)
        t2=pg.evaluate(f"()=>JSON.parse(localStorage.getItem('{NS}:teian')||'null')")
        check('選んだ案が端末に残る', bool(t2 and t2.get('eranda')), str(t2)[:90])
        # 計画書に出るか
        pg.goto(B+'/tools/keikaku.html', wait_until='domcontentloaded'); pg.wait_for_timeout(3500)
        k=pg.inner_text('body')
        check('計画書に、入れた案が出る', 'この計画は、段6' in k,
              k[k.find('この計画は'):k.find('この計画は')+120] if 'この計画は' in k else k[:120])
    check('エラーが無い', len(err)==0, ' / '.join(err[:2]))
    b.close()
print(f'\n公開先の段6から実機のAIまで  合格 {ok}件 / 不合格 {ng}件')
