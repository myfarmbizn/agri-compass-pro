# サーバ側は、のうきろくの基盤に載せてある

この画面が話す相手（データベースとAI）は、この置き場所には入っていない。
のうきろくの基盤（`ツール本体\platform\`）に載せてある。別に建てなかったのは、
同じ農家が2つのIDを持ってしまうと、記録と経営の数字がつながらなくなるためである。

置き先は AWS 586481703889。のうきろくのスタックが居るアカウントと同じ。
GitHub は `myfarmbizn`（`nokiroku-mihon` と同じ持ち主）。

## どこに何があるか

| 何 | どこ |
|---|---|
| 表と預かる口（PostgreSQL・行ごとの権限つき） | `platform/db/migrations/057_compass_wo_azukaru.sql` |
| 受け口（預かる・返す） | `platform/api/src/compass.mjs` |
| AI（読み取り・直しどころ・読み合わせ） | `platform/api/src/compass_ai.mjs` |
| 道の配線 | `platform/api/src/handler.mjs` の `/compass` から始まる5本 |
| 試験（WASM版PostgreSQLで実際に動かす） | `platform/api/test/compass_test.mjs` |
| 実機を通しで確かめる | `scripts/try_compass_jikki.py` |
| 基盤の定義（Lambda・API Gateway・RDS） | `platform/infra/lib/app-stack.ts` |
| 画面側の窓口 | `assets/js/db.js`／住所は `assets/js/saba_settei.js` |

## 画面から見た道

| 道 | 何をする |
|---|---|
| `GET /compass` | 預けたものを全部返す（端末を替えたとき、これで戻る） |
| `POST /compass/hikae` | 端末の保存を1つ預ける。同時に、数えられる形へも写す |
| `POST /compass/keikaku` | 計画と、その計算結果を残す |
| `POST /compass/teian` | 出した案と、本人が選んだ案を残す |
| `POST /compass/ai` | AIに聞く（読み取り・直しどころ・読み合わせ） |

どれも見出しに `Authorization: Aikotoba XXXXXXXX`（8文字）を付ける。
合言葉は、農家が初めて何かを入れたときに `POST /welcome` で自動で作る。
画面側の窓口は `assets/js/db.js` の1本だけ。

## AWSを呼ぶときの決まり（この端末）

社内で通信を検査しているため、証明書束を指さないと呼べない。
指さないと `aws` が「鍵が見つからない」と返すので、鍵が無いと読み違えやすい。

```
export AWS_CA_BUNDLE="$HOME/.aws/corp-ca-bundle.pem"
export NODE_EXTRA_CA_CERTS="$HOME/.aws/corp-ca-bundle.pem"
export AWS_PROFILE=nokiroku-prod        # 586481703889。既定のままだと別アカウントを見る
```

⚠基盤の定義（`lib/*.ts`）を直したら、載せる前に必ず組み立てる。
`cdk.json` は `node dist/bin/app.js` を動かす作りなので、TypeScriptを直しただけでは効かない。
`npx tsc --noEmit` は型を見るだけで組み立てない（2026-08-16に、これで直しが実機へ入らなかった）。

```
npx tsc -p tsconfig.json        # 組み立てる。--noEmit は付けない
npx cdk deploy <スタック名> --require-approval never
```

## 置いた記録

### 2026年8月16日　データベース

移行を当てる役を作り直して載せ替え（`python scripts/build_migration_runner.py` →
`npx cdk deploy nokiroku-nonprod-database`）、7本を流した。

| 流した移行 | かかった時間 |
|---|---|
| 048 控え | 72ミリ秒 |
| 049 本人の実数 | 27ミリ秒 |
| 050 相場を見る口 | 4ミリ秒 |
| 053 階段 | 4ミリ秒 |
| 055 ふりかえりの記録 | 15ミリ秒 |
| 056 知らせに期限を足す | 7ミリ秒 |
| 057 コンパスを預かる | 40ミリ秒 |

流したあとの実測。移行53本すべて流し済み・これから流すもの0／`core` の表は84／
行ごとの見える範囲の制御が入っていない表は0件／`app` の関数は184。

流す役の呼び方。

```
aws lambda invoke --function-name <移行を当てる役> --payload '{"dryRun":true}' out.json  # 何が流れるか見る
aws lambda invoke --function-name <移行を当てる役> --payload '{}' out.json               # 流す
aws lambda invoke --function-name <移行を当てる役> --payload '{"inspect":true}' out.json # 中身を数える
```

### 2026年8月16日　受け口

`python scripts/build_api_bundle.py` → `npx cdk deploy nokiroku-nonprod-app`。
基盤の定義に2つ足した。受け口の役にBedrockを呼ぶ許し（呼び先は既存と同じ並びだけ）と、
呼び先の名前（`COMPASS_MODEL_ID`＝日本国内で処理する推論プロファイル）。
画面の住所（`https://myfarmbizn.github.io`）は、もともと許す先に入っていた。

受け口の住所は `https://m4vxi8w3zj.execute-api.ap-northeast-1.amazonaws.com/nonprod`。
これを `assets/js/saba_settei.js` の `url` に入れてある。

## WAGRI（農業データ連携基盤）

段1（`tools/hinmoku.html`）で圃場を選んで面積を取る道。WAGRIを呼ぶのは `assets/js/wagri.js` だけで、
鍵が空のあいだは見本の圃場を返し、画面にも見本だと出す。本物への切り替えは次の3行。

1. `assets/js/wagri.js` 先頭の `SETTEI.riyousha` に利用者ID、`SETTEI.himitsu` にクライアントシークレットを入れる
2. 同じ `SETTEI.michi` に、ID付与済み筆ポリゴン取得API v3 の道（`GetByLocalGovernmentCd`・`GetDistance`）を入れる
3. 同じ `SETTEI.kou` に、返ってくる項目の名（ID・面積・市区町村コード・緯度・経度）を仕様ページのとおり入れる

2と3は手順書に載っていない（未確定）。鍵と一緒に届く仕様ページで確かめる。画面側は直さなくてよい。

### 2026年8月16日　集計とAIの回数、写真の通し道

移行058（社内で横断して数える口）と移行059（AIを呼んだ回数）を流した。
1本あたり42ミリ秒・20ミリ秒。流したあと55本すべて流し済み・残り0。

受け口に足したもの。

| 何 | どこ |
|---|---|
| 社内で横断して数える | `GET /compass/matome`。管理者の合言葉（`Authorization: Kanri …`）でだけ通る |
| 管理者の合言葉の置き場 | Secrets Manager の `nokiroku-nonprod/compass/kanri-aikotoba`（自動で作られる） |
| AIを呼べる回数 | 1軒あたり30回（`compass_ai.mjs` の `KAISUU_JOUGEN`。環境変数 `COMPASS_AI_JOUGEN` で変えられる） |

⚠見張り（WAF）の決まりを1つ直した。`AWSManagedRulesCommonRuleSet` の
`SizeRestrictions_BODY` は8KBを超える中身を止める。農家が送る伝票の写真は必ず超えるので、
2026年8月16日に403で止まった（実測）。この決まりだけ「止める」から「数えるだけ」に変えた。
大きさは別のところで押さえている。入口そのものが10MBまでで、受け口の側も1回に5ファイル・
base64にして合計4MBまでしか渡さない。ほかの決まりはそのまま働いている。

## まだ決めていないこと

- AIを呼ぶ費用の上限と、1人あたりの回数
- 写真とPDFの渡し方の上限（いまは base64 を `zairyou.files[].data` に入れる前提）
- 農家に「サーバに預けます」と伝える同意の文面と、その版番号
- 当社が横断して数える画面（何人が自分の数字にしたか、どの打ち手が選ばれたか）
