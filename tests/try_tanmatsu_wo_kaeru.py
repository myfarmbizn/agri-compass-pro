# -*- coding: utf-8 -*-
"""端末を替えても、サーバに預けたものから続きが使えるかを実機で確かめる。

サーバへ預ける理由そのものを確かめる検査である。
ブラウザの文脈を2つ作り、1台目で入れたものが、合言葉だけを渡した2台目で戻るかを見る。
実機のAIは呼ばないが、実機の受け口には本当につなぐ（試しの農園が1軒増える）。

走らせ方:  python tests/try_tanmatsu_wo_kaeru.py
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
        print('  不合格', na, str(soe)[:130].encode('cp932','replace').decode('cp932'))

with sync_playwright() as pw:
    b = pw.chromium.launch()

    # ---- 1台目 ----
    c1 = b.new_context(); pg = c1.new_page()
    err = []
    pg.on('pageerror', lambda e: err.append(str(e)))
    pg.goto(B + '/tools/hinmoku.html', wait_until='domcontentloaded'); pg.wait_for_timeout(3000)
    pg.evaluate("()=>localStorage.clear()")
    pg.reload(wait_until='domcontentloaded'); pg.wait_for_timeout(3000)

    pg.select_option('#imaSel', index=1); pg.click('#imaAdd'); pg.wait_for_timeout(600)
    men = pg.locator('#imaList input[type=number]').first
    men.fill('35'); men.dispatch_event('input'); pg.wait_for_timeout(6000)

    st = pg.evaluate(f"()=>JSON.parse(localStorage.getItem('{NS}:sabaSetting')||'null')")
    check('迎え入れられて合言葉が出る', bool(st and st.get('aikotoba')), str(st)[:100])
    aikotoba = (st or {}).get('aikotoba')
    url = (st or {}).get('url')
    sp1 = pg.evaluate(f"()=>JSON.parse(localStorage.getItem('{NS}:simPlan')||'null')")
    hin1 = [(i['cropId'], i['area']) for i in (sp1 or {}).get('items', [])]
    print('  1台目で入れたもの:', json.dumps(hin1, ensure_ascii=False))

    # なりたい姿も入れる
    pg.goto(B + '/tools/nozomi.html', wait_until='domcontentloaded'); pg.wait_for_timeout(3000)
    # 画面と同じ道で保存する（CORE.store.save は db.js がくるんでいて、サーバへも預ける）
    pg.evaluate("""()=>{
      CORE.store.save('nozomi', {nen:5, mokuhyouMan:640, roudouKibou:2000,
                                 kariireJougenMan:0, tebanasanai:[]});
    }""")
    pg.wait_for_timeout(7000)
    c1.close()

    # ---- 2台目（別のブラウザ文脈＝端末を替えた状態） ----
    c2 = b.new_context(); pg2 = c2.new_page()
    err2 = []
    pg2.on('pageerror', lambda e: err2.append(str(e)))
    pg2.goto(B + '/tools/hinmoku.html', wait_until='domcontentloaded'); pg2.wait_for_timeout(2500)
    sp0 = pg2.evaluate(f"()=>localStorage.getItem('{NS}:simPlan')")
    check('2台目は最初は空', sp0 in (None, '', 'null'), str(sp0)[:60])

    # 合言葉を入れる（記録の画面の設定と同じことをする）
    pg2.evaluate(f"""(o)=>{{
      localStorage.setItem('{NS}:sabaSetting', JSON.stringify({{url:o.url, aikotoba:o.aikotoba}}));
    }}""", {'url': url, 'aikotoba': aikotoba})
    pg2.goto(B + '/tools/hinmoku.html', wait_until='domcontentloaded'); pg2.wait_for_timeout(8000)

    sp2 = pg2.evaluate(f"()=>JSON.parse(localStorage.getItem('{NS}:simPlan')||'null')")
    hin2 = [(i['cropId'], i['area']) for i in (sp2 or {}).get('items', [])]
    check('1台目で入れた品目が2台目に戻る', hin2 == hin1, f'{hin2} / {hin1}')
    nz = pg2.evaluate(f"()=>JSON.parse(localStorage.getItem('{NS}:nozomi')||'null')")
    check('なりたい姿も戻る', (nz or {}).get('mokuhyouMan') == 640, str(nz)[:80])

    t = pg2.inner_text('body')
    check('2台目でも見通しが出る', '万円' in t, t[:100])
    check('画面に面積が出る', pg2.locator('#imaList input[type=number]').count() >= 1)
    if pg2.locator('#imaList input[type=number]').count():
        v = pg2.locator('#imaList input[type=number]').first.input_value()
        check('面積の値が同じ', v == '35', v)
    check('2台目の画面にエラーが無い', len(err2) == 0, ' / '.join(err2[:2]))
    check('1台目の画面にエラーが無い', len(err) == 0, ' / '.join(err[:2]))
    b.close()
print(f'\n端末を替えても続きから使えるかの検査  合格 {ok}件 / 不合格 {ng}件')
