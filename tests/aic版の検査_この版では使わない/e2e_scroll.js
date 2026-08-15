const puppeteer = require("puppeteer-core");
(async () => {
  const b = await puppeteer.launch({ executablePath: "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe", headless: "new" });
  const p = await b.newPage();
  await p.setViewport({ width: 1280, height: 900 });
  await p.goto("http://127.0.0.1:8123/index.html", { waitUntil: "domcontentloaded" });
  await p.evaluate(() => {
    localStorage.setItem("myfarm-agri-compass-aic:mfkPersona", JSON.stringify("junbi"));
    localStorage.setItem("myfarm-agri-compass-aic:mfkRegion", JSON.stringify("okinawa"));
  });
  let failures = 0;
  for (const url of ["/tools/sakutsuke.html", "/tools/shikin.html", "/tools/checkup.html", "/tools/simulator.html", "/tools/taifu.html"]) {
    await p.goto("http://127.0.0.1:8123" + url, { waitUntil: "domcontentloaded" });
    await new Promise(r => setTimeout(r, 900));
    const res = await p.evaluate(async () => {
      window.scrollTo({ top: Math.max(600, document.body.scrollHeight / 2), left: 0, behavior: "instant" });
      await new Promise(r => setTimeout(r, 250));
      const y0 = window.scrollY;
      // 画面内の入力に値を入れて input/change/click を発火（利用者の入力を再現）
      const inp = [...document.querySelectorAll("input[type=number], input[type=text], input[type=range]")]
        .find(el => el.offsetParent !== null) || document.body;
      inp.dispatchEvent(new Event("input", { bubbles: true }));
      inp.dispatchEvent(new Event("change", { bubbles: true }));
      document.body.click();
      await new Promise(r => setTimeout(r, 700)); // reEval のデバウンス400msを跨ぐ
      return { y0, y1: window.scrollY };
    });
    const okv = Math.abs(res.y1 - res.y0) <= 2;
    if (!okv) failures++;
    console.log((okv ? "PASS" : "FAIL") + " " + url + " y " + res.y0 + " -> " + res.y1);
  }
  await b.close();
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
