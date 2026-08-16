# -*- coding: utf-8 -*-
"""公開先の画面から、実物の写真と決算書を送って、AIが読めるかを通しで確かめる。

実機のAIを実際に呼ぶ（1回あたりの回数を消費する）。
送るのは ツール本体\scripts\tsukuru_mihon_denpyou.py が作った見本で、実在の農家のものではない。

走らせ方:  python tests/try_koukai_yomitori.py
"""
import os, json
from playwright.sync_api import sync_playwright

B = 'https://myfarmbizn.github.io/agri-compass-pro'
NS = 'myfarm-agri-compass-pro'
MIHON = r'C:\Users\myfarm107\Documents\claude_git\20260804_AIビジネスモデル確認\ツール本体\サンプルデータなど\AIの読み取りの見本'

ok = ng = 0
def check(na, j, soe=''):
    global ok, ng
    if j: ok += 1
    else:
        ng += 1
        print('  不合格', na, str(soe)[:110].encode('cp932','replace').decode('cp932'))

with sync_playwright() as pw:
    b = pw.chromium.launch(); pg = b.new_page(viewport={'width':1280,'height':1000})
    err = []
    pg.on('pageerror', lambda e: err.append(str(e)))
    pg.on('dialog', lambda d: d.accept())

    # ---- 1. 伝票の写真を、記録として読む ----
    pg.goto(B + '/tools/hinmoku.html', wait_until='domcontentloaded'); pg.wait_for_timeout(2000)
    pg.evaluate("()=>localStorage.clear()")
    pg.goto(B + '/tools/kiroku.html', wait_until='domcontentloaded'); pg.wait_for_timeout(2000)
    check('記録の画面が開く', pg.locator('h1').count() > 0)

    pg.set_input_files('input[type=file]', os.path.join(MIHON, '見本_出荷精算書.jpg'))
    pg.wait_for_timeout(800)
    check('ファイルが選べる', '見本_出荷精算書' in pg.inner_text('body'))
    pg.click('#btnSend')
    pg.wait_for_timeout(45000)

    t = pg.inner_text('body')
    check('見本の断りが出ていない（本物につながっている）', '見本の受け答えです' not in t, t[:100])
    gyou = pg.locator('#recTbl tbody tr')
    check('読み取った行が3件出る', gyou.count() == 3, str(gyou.count()))
    if gyou.count():
        check('日付が出る', '2025-03-14' in pg.inner_text('#recTbl'), pg.inner_text('#recTbl')[:80])
        check('金額が出る', '21250' in pg.inner_text('#recTbl').replace(',', ''), pg.inner_text('#recTbl')[:120])

    # 確定してみる
    if pg.locator('#btnKakutei').count() and not pg.is_disabled('#btnKakutei'):
        pg.click('#btnKakutei'); pg.wait_for_timeout(2500)
        k = pg.evaluate(f"()=>JSON.parse(localStorage.getItem('{NS}:kiroku')||'null')")
        check('確定すると端末に残る', bool(k and k.get('kensu') == 3), str(k)[:80] if k else 'null')
        cc = pg.evaluate(f"()=>JSON.parse(localStorage.getItem('{NS}:cropCustom')||'null')")
        print('  記録から作った単価:', json.dumps(cc, ensure_ascii=False)[:200] if cc else 'まだ無し（件数が足りない）')

    # ---- 2. 決算書のPDFを、決算書として読む ----
    pg.goto(B + '/tools/kiroku.html', wait_until='domcontentloaded'); pg.wait_for_timeout(2000)
    pg.click('#shoruiSeg button[data-shorui="kessansho"]'); pg.wait_for_timeout(300)
    pg.set_input_files('input[type=file]', os.path.join(MIHON, '見本_収支内訳書.pdf'))
    pg.wait_for_timeout(800)
    pg.click('#btnSend')
    pg.wait_for_timeout(45000)

    kk = pg.inner_text('#kessanKekka')
    check('決算書の数字が出る', '4,820,000' in kk, kk[:120])
    check('経費の内訳が出る', '出荷運賃手数料' in kk)
    check('品目の面積が出る', '30 a' in kk, kk[-150:])
    if pg.locator('#btnKessanIreru').count() and not pg.is_disabled('#btnKessanIreru'):
        pg.click('#btnKessanIreru'); pg.wait_for_timeout(1500)
        a = pg.evaluate(f"()=>JSON.parse(localStorage.getItem('{NS}:annual')||'null')")
        check('実績の診断に入る', bool(a and a.get('2025')), str(a)[:90])
        if a and a.get('2025'):
            check('経費8分類が入る', len(a['2025'].get('expenses', {})) >= 8,
                  str(list(a['2025'].get('expenses', {}).keys())))

    check('画面のエラーが無い', len(err) == 0, ' / '.join(err[:2]))
    b.close()
print(f'\n公開先から実機の読み取りまで  合格 {ok}件 / 不合格 {ng}件')
