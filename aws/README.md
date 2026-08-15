# AIの受け口（まだ置いていない）

画面（`assets/js/ai.js`）から呼ばれる受け口。ここに置く前は、画面は見本の受け答えで動き、
「見本です」と必ず出す。段6では機械が決めた既定の3案が必ず出るので、受け口が無くても最後まで通る。

2026年8月16日の時点で、この受け口はまだAWSに置いていない。
作業した端末にAWSの鍵が無く、立てられなかったため。`handler.mjs` は書いてある。

## 置き方

1. Lambda を1つ作る（Node.js 20以上・ESM）。`handler.mjs` を入れ、入口を `handler.handler` にする
2. 環境変数を3つ渡す

| 名前 | 中身 |
|---|---|
| `MODEL_ID` | Bedrock の呼び先。日本国内で処理する推論プロファイルに固定する |
| `AIKOTOBA` | 8文字の合言葉。複数なら読点で区切る |
| `ALLOW_ORIGIN` | `https://myfarmbizn.github.io`（絞らないなら `*`） |

3. Lambda の役に `bedrock:InvokeModel` を付ける
4. 関数URL（または API Gateway）を作り、POST を受けられるようにする
5. できたURLと合言葉を、記録を入れる画面（`tools/kiroku.html`）の下の設定欄に入れる

## 受け取る形

```
POST /
Authorization: Aikotoba XXXXXXXX
{ "shurui": "yomitori" | "naoshidokoro" | "yomiawase", "zairyou": { ... } }
```

## 返す形

| 種類 | 返すもの |
|---|---|
| `yomitori` | `{ "records": [{hizuke, hinmoku, shurui, suryo, tani, kingaku, moto}] }` |
| `naoshidokoro` | `{ "an": [{namae, riyuu, teate: [{kata, ...}]}] }` |
| `yomiawase` | `{ "shiteki": [{kata, basho, naiyou}] }` |

## 守っている決まり

- AIは抽出と選択だけ。ツール実行・外部取得の権限を与えない
- 利用者の書類は「資料」として囲みの中に入れ、指示として読ませない
- 出力はJSONで受け取り、機械で確かめてから返す（画面側でも同じ確認をする。二重にしてある）
- 使ったトークン数を毎回記録に残す（費用を見張るため）
- **金額はAIに作らせない。**`naoshidokoro` の言いつけに「金額は一切返すな」と書いてあり、
  返ってきても機械が採らない。金額は画面側の `sim_engine.js` が計算する

## まだ決めていないこと

- 呼び先（どのモデルを使うか）と、1人あたり何回呼んでよいか
- 写真とPDFの渡し方（いまは base64 を `zairyou.files[].data` に入れる前提で書いてある）
- 大きいファイルの上限
