# 検査（実際にブラウザで押して回るもの）

構文が正しいことと、画面が動くことは別である。
書類の検査では出ない不具合が実機で出る、というのを何度も踏んでいるので、
ここの検査はすべて本物のブラウザでページを開き、利用者と同じ道を押して回る。

前の版（AIC版）の検査は `aic版の検査_この版では使わない\` に移してある。
Microsoft Edge と puppeteer-core を前提にしていたもので、この版では動かない。

## 前提

- Python 3.11 と Playwright（`pip install playwright` → `playwright install chromium`）
- Node.js（検査の中で配信を立てるのに使う）
- 配信は検査が自分で立てるので、`tests/serve.js` を先に動かす必要は無い

実機（AWS）につなぐ検査は、証明書束を渡してから走らせる。

```
export AWS_CA_BUNDLE="$HOME/.aws/corp-ca-bundle.pem"
export AWS_PROFILE=nokiroku-prod
```

## 手元で完結するもの（実機につながない）

| 走らせ方 | 何を見るか | 件数 |
|---|---|---|
| `node tests/verify_uchite.js` | 打ち手の機械の検算。1年目の売上・所得・年間の労働時間を手計算と突き合わせる | 32 |
| `python tests/try_gamen.py` | 全17ページを開いて押して回る。エラー・ナビ・消したページへの案内・3つの幅・進む道・日本語の作り | 185 |
| `python tests/try_chiiki.py` | 地域を切り替えても実績が計算の前提に書き戻るか。品目を持つ11県すべてを開く | 181 |
| `python tests/try_kakuteishinkoku.py` | 確定申告の数字を通したときの計算 | 90 |
| `python tests/try_naoshi.py` | NMの指摘3件（保存先の案内・段1の反映・自分の数字は任意）の直り | 24 |
| `python tests/try_saba.py` | サーバへ預ける道（偽の受け口を立てて確かめる） | 26 |
| `python tests/try_hinmokugai_shuunyuu.py` | 家事消費・雑収入が実績の診断の所得に入るか | 17 |
| `python tests/try_hozon_wo_yomikaesu.py` | 保存したのに読み返す場所が無かった3つ（資金繰り・入れた案・3案の比較） | 14 |
| `python tests/try_ken_wo_erabinaosu.py` | 県を選び直したときに、前の県の品目をどう扱うか | 16 |
| `python tests/try_mihon_ni_ochita_wake.py` | 見本の受け答えに落ちた理由（回数の上限・返ってこない・未設定）が伝わるか | 10 |

## 公開先（本物のURL）を開くもの

手元では通るのに公開先では通らない、という食い違いを捕まえる。

| 走らせ方 | 何を見るか | 件数 |
|---|---|---|
| `python tests/try_koukai_isshuu.py` | 段1から段7まで押して一周する | 16 |
| `python tests/try_koukai_haba.py` | 電話・板・机の3つの幅で、押したいものに手が届くか | 33 |
| `python tests/try_kami_ni_dasu.py` | 紙（A4）に出したときに崩れていないか | 10 |

## 実機（AWS）につなぐもの

⚠実機のAIを呼ぶものは、その農園の回数を消費する（1軒あたりの上限は30回）。
⚠走らせるたびに、試しの農園が1軒増える。名前に「試し」が入る。

| 走らせ方 | 何を見るか | 件数 |
|---|---|---|
| `python tests/try_koukai_yomitori.py` | 公開先の画面から、実物の写真と決算書を実機のAIへ | 13 |
| `python tests/try_koukai_dan6.py` | 公開先の段6から実機のAIを呼び、案を計画に入れて計画書まで | 8 |
| `python tests/try_tanmatsu_wo_kaeru.py` | 端末を替えても、サーバに預けたものから続きが使えるか | 9 |

サーバの側（受け口・データベース）の検査は、この置き場ではなく
`ツール本体\platform\api\test\` と `ツール本体\scripts\` にある。

## 見本の材料

実機の読み取りに使う見本（伝票の写真・作業ノートの写真・収支内訳書のPDF）は
`ツール本体\scripts\tsukuru_mihon_denpyou.py` が作る。実在の農家のものではない。
中身をこちらが知っているので、読み取れたかどうかを機械で突き合わせられる。
