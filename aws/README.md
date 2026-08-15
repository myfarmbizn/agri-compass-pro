# サーバ側は、のうきろくの基盤に載せてある

この画面が話す相手（データベースとAI）は、この置き場所には入っていない。
のうきろくの基盤（`ツール本体\platform\`）に載せてある。別に建てなかったのは、
同じ農家が2つのIDを持ってしまうと、記録と経営の数字がつながらなくなるためである。

## どこに何があるか

| 何 | どこ |
|---|---|
| 表と預かる口（PostgreSQL・行ごとの権限つき） | `platform/db/migrations/057_compass_wo_azukaru.sql` |
| 受け口（預かる・返す） | `platform/api/src/compass.mjs` |
| AI（読み取り・直しどころ・読み合わせ） | `platform/api/src/compass_ai.mjs` |
| 道の配線 | `platform/api/src/handler.mjs` の `/compass` から始まる5本 |
| 試験（WASM版PostgreSQLで実際に動かす） | `platform/api/test/compass_test.mjs` |
| 基盤の定義（Lambda・API Gateway・RDS） | `platform/infra/lib/app-stack.ts` |

## 画面から見た道

| 道 | 何をする |
|---|---|
| `GET /compass` | 預けたものを全部返す（端末を替えたとき、これで戻る） |
| `POST /compass/hikae` | 端末の保存を1つ預ける。同時に、数えられる形へも写す |
| `POST /compass/keikaku` | 計画と、その計算結果を残す |
| `POST /compass/teian` | 出した案と、本人が選んだ案を残す |
| `POST /compass/ai` | AIに聞く（読み取り・直しどころ・読み合わせ） |

どれも見出しに `Authorization: Aikotoba XXXXXXXX`（8文字）を付ける。
画面側の窓口は `assets/js/db.js` の1本だけで、設定（URLと合言葉）もそこが持つ。

## 置くときに要ること

1. 移行057を実機のデータベースへ当てる
2. 受け口を組み立て直して置く（`scripts/build_api_bundle.py` が `api/src/*.mjs` を拾う）
3. AIを使うなら、Lambda の環境変数に `COMPASS_MODEL_ID`（Bedrockの呼び先）を渡し、
   役に `bedrock:InvokeModel` を付ける。あわせて `npm install` で
   `@aws-sdk/client-bedrock-runtime` を入れる（取り決めには書き足してある）
4. 画面が呼ぶので、受け口の側で GitHub Pages の住所からの呼び出しを許す

2026年8月16日の時点で、1〜4は実機へ当てていない。作業した端末にAWSの鍵が無いため。
当てるまでのあいだ、画面は端末の中だけで動き、AIは見本の受け答えを返し、
画面には必ず「見本です」と出る。
