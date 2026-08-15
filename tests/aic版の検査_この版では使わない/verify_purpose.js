/* 目的から使う入口（補助金等申請・認定の準備／スマ農）の実ブラウザ検証 */
const puppeteer = require("puppeteer-core");
const BASE = "http://127.0.0.1:8123";
const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const results = [];
const errs = [];
function ok(name, cond, detail) { results.push({ name, pass: !!cond, detail: detail || "" }); console.log((cond ? "PASS" : "FAIL") + " | " + name + (detail ? " | " + detail : "")); }

(async () => {
  const browser = await puppeteer.launch({ executablePath: EDGE, headless: "new", args: ["--no-first-run"] });
  const page = await browser.newPage();
  page.on("pageerror", e => errs.push(String(e).slice(0, 200)));
  page.on("console", m => { if (m.type() === "error") errs.push(m.text().slice(0, 200)); });

  // 立場を選んでいない素の状態で開く
  await page.goto(BASE + "/index.html", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => localStorage.removeItem("myfarm-agri-compass-aic:mfkPersona"));
  await page.reload({ waitUntil: "domcontentloaded" });
  await new Promise(r => setTimeout(r, 400));

  // 1. 目的カードが存在し表示されている
  const cardVisible = await page.evaluate(() => {
    const c = document.getElementById("purposeCard");
    return c && c.offsetParent !== null;
  });
  ok("目的カードが立場未選択でも表示される", cardVisible);

  // 2. 棚の見出しが「補助金等申請・認定の準備」
  const shelf = await page.evaluate(() => document.getElementById("purposeList").textContent);
  ok("棚名が補助金等申請・認定の準備", shelf.includes("補助金等申請・認定の準備"), shelf.slice(0, 40));

  // 3. スマ農リンクが tools/smart.html を指し、タイトルが出ている
  const link = await page.evaluate(() => {
    const a = document.querySelector('#purposeList a[href="tools/smart.html"]');
    return a ? { href: a.getAttribute("href"), text: a.textContent } : null;
  });
  ok("スマ農カードが smart.html を指す", link && link.href === "tools/smart.html", link && link.href);
  ok("スマ農カードにスマート農業申請の文言", link && link.text.includes("スマート農業申請"), link && link.text.slice(0, 40));

  // 4. 棚のリンクは今スマ農1枚だけ（決定どおり）
  const count = await page.evaluate(() => document.querySelectorAll("#purposeList a.t-card").length);
  ok("棚のツールは1枚（スマ農のみ）", count === 1, "count=" + count);

  // 5. スマ農カードを踏むと実ページが開く
  await page.click('#purposeList a[href="tools/smart.html"]');
  await new Promise(r => setTimeout(r, 500));
  const onSmart = await page.evaluate(() => document.title);
  ok("スマ農ページに遷移できる", onSmart.includes("スマート農業申請"), onSmart);

  // 6. コンソールエラーなし
  ok("JSエラー0", errs.length === 0, errs.join(" / "));

  await browser.close();
  const failed = results.filter(r => !r.pass);
  console.log("\n--- " + (results.length - failed.length) + "/" + results.length + " PASS ---");
  process.exit(failed.length ? 1 : 0);
})();
