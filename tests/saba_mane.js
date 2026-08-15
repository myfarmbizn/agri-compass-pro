/* 検査用の、受け口のまねをする配信。
   本物（platform/api）と同じ道と同じ返しをするだけの、中身の無いもの。
   ここで確かめたいのは「画面からサーバへ、正しい形で届くか」だけなので、
   データベースもAIも動かさない。

   走らせ方: node tests/saba_mane.js   （環境変数 PORT で口を変えられる）
   預かったものは、終わるときに標準出力へJSONで書き出す（検査側が読む）。 */
"use strict";
const http = require("http");
const fs = require("fs");

const PORT = Number(process.env.PORT || 8199);
const OUT = process.env.OUT || "";
const AIKOTOBA = process.env.AIKOTOBA || "TESTPASS";

/* 預かったもの。鍵ごとに最後の中身を持つ */
const azukari = {};
const koushin = {};
const teian = [];
const keikaku = [];
const aiYobareta = [];

function atama(res, status) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  });
}

const server = http.createServer((req, res) => {
  const michi = (req.url || "/").split("?")[0];

  if (req.method === "OPTIONS") { atama(res, 204); res.end(); return; }

  /* 合言葉を確かめる。見出しの書き方は本物と同じにそろえてある */
  const h = req.headers.authorization || "";
  const m = /^Aikotoba\s+([A-Za-z0-9]{8})$/.exec(String(h).trim());
  if (!m || m[1] !== AIKOTOBA) {
    atama(res, 401);
    res.end(JSON.stringify({ message: "合言葉を入れてお使いください" }));
    return;
  }

  let nama = "";
  req.on("data", (c) => { nama += c; });
  req.on("end", () => {
    let body = {};
    try { body = nama ? JSON.parse(nama) : {}; } catch (e) { body = {}; }

    if (req.method === "GET" && michi === "/compass") {
      atama(res, 200);
      res.end(JSON.stringify({ azukari, koushin, nouka: null, nozomi: null, zentei: [], keikakuBan: keikaku.length }));
      return;
    }

    if (req.method === "POST" && michi === "/compass/hikae") {
      if (!body.kagi) { atama(res, 400); res.end(JSON.stringify({ message: "鍵がありません" })); return; }
      azukari[body.kagi] = body.nakami;
      koushin[body.kagi] = body.hozonAt || new Date().toISOString();
      atama(res, 200);
      res.end(JSON.stringify({ kagi: body.kagi, azukatta: koushin[body.kagi] }));
      return;
    }

    if (req.method === "POST" && michi === "/compass/teian") {
      teian.push({ an: body.an, mihon: body.mihon, eranda: body.eranda });
      atama(res, 200);
      res.end(JSON.stringify({ teianId: "mane-" + teian.length }));
      return;
    }

    if (req.method === "POST" && michi === "/compass/keikaku") {
      keikaku.push({ keikaku: body.keikaku, kekka: body.kekka });
      atama(res, 200);
      res.end(JSON.stringify({ keikakuId: "mane-" + keikaku.length, ban: keikaku.length }));
      return;
    }

    if (req.method === "POST" && michi === "/compass/ai") {
      aiYobareta.push({ shurui: body.shurui, zairyou: body.zairyou });
      atama(res, 200);
      /* 本物のAIのつもりで、決まった形だけを返す。金額は返さない */
      if (body.shurui === "naoshidokoro") {
        res.end(JSON.stringify({
          an: [
            { namae: "単価を2割上げる", riyuu: "出し先を変える",
              teate: [{ kata: "tanka", cropId: (body.zairyou?.items?.[0]?.cropId) || "tomato", bairitsu: 1.2 }] },
          ],
        }));
      } else if (body.shurui === "yomiawase") {
        res.end(JSON.stringify({
          shiteki: [{ kata: "窓口で聞かれる", basho: "返済の原資", naiyou: "返済の原資の説明がありません。" }],
        }));
      } else {
        res.end(JSON.stringify({
          records: [{ hizuke: "2025-03-14", hinmoku: "ゴーヤー", shurui: "販売",
            suryo: 42.5, tani: "kg", kingaku: 21250, moto: "まねの返し" }],
        }));
      }
      return;
    }

    atama(res, 404);
    res.end(JSON.stringify({ message: "その道はありません: " + req.method + " " + michi }));
  });
});

server.keepAliveTimeout = 60000;
server.listen(PORT, "127.0.0.1", () => {
  process.stdout.write("mane ready " + PORT + "\n");
});

function kakidasu() {
  if (!OUT) return;
  try {
    fs.writeFileSync(OUT, JSON.stringify({ azukari, koushin, teian, keikaku, aiYobareta }, null, 2));
  } catch (e) { /* 書けなくても止めない */ }
}
process.on("SIGTERM", () => { kakidasu(); process.exit(0); });
process.on("SIGINT", () => { kakidasu(); process.exit(0); });
/* 検査側からいつでも取り出せるように、少しずつ書き出しておく */
setInterval(kakidasu, 500);
