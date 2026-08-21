/* ============================================================
   学校の入口ページの「段階の一覧」— 2026-08-04
   道具ページの進め方の一覧（journey.js）と同じ形で、いま画面のどこを読んでいるかを左に出す。
   ・対象は data-dankai 属性を付けた節。属性の値がそのまま一覧の名前になる。
   ・広い画面（1400px以上）では本文の左に貼り付き、狭い画面では1行に畳む（見た目は app.css）。
   ・スクロールに追従して、いま見ている節に「いまここ」を付ける。
   ・入口ページは順路ではないので、完了の印は出さない（済んだかどうかは道具ページ側の話）。
   ============================================================ */
(function () {
  "use strict";
  function ready(fn) {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", fn);
    else fn();
  }
  ready(function () {
    var secs = [].slice.call(document.querySelectorAll("[data-dankai]"));
    if (!secs.length) return;
    secs.forEach(function (el, i) { if (!el.id) el.id = "dankai" + (i + 1); });

    var home = (location.pathname.indexOf("/sites/") > -1) ? "../../index.html" : "index.html";
    var side = document.createElement("nav");
    side.className = "jny-side no-print";
    side.id = "jnySide";
    side.setAttribute("aria-label", "このページの段階");
    var items = secs.map(function (el, i) {
      return "<li class='js-step' data-to='" + el.id + "'>" +
        "<a class='js-link' href='#" + el.id + "'>" +
        "<span class='js-dot'>" + (i + 1) + "</span>" +
        "<span class='js-name'>" + el.getAttribute("data-dankai") + "</span>" +
        "</a></li>";
    }).join("");
    side.innerHTML =
      "<div class='js-head'>" +
        "<a class='js-home' href='" + home + "'>⌂ トップ</a>" +
        "<button type='button' class='js-toggle' id='jnySideToggle'>" +
          "<span class='js-ttl'>この入口</span>" +
          /* いま見ている段の名前。広い画面では一覧そのものに「いまここ」が出るので、
             畳んでいる狭い画面のときだけ出す（app.css の js-nowlabel） */
          "<span class='js-count js-nowlabel' id='dankaiNow'></span>" +
        "</button>" +
      "</div>" +
      "<div class='js-body'><ol class='js-list'>" + items + "</ol>" +
      "<div class='js-note'>上から順に見ていく形ですが、あてはまる段階から始めて構いません。</div></div>";

    var tb = document.querySelector(".topbar");
    if (tb) tb.insertAdjacentElement("afterend", side);
    else document.body.insertAdjacentElement("afterbegin", side);
    document.body.classList.add("has-side");

    var tg = document.getElementById("jnySideToggle");
    if (tg) tg.addEventListener("click", function () { side.classList.toggle("open"); });

    var lis = [].slice.call(side.querySelectorAll(".js-step"));
    var nowEl = document.getElementById("dankaiNow");
    function mark(id) {
      lis.forEach(function (li) {
        var on = li.getAttribute("data-to") === id;
        li.classList.toggle("here", on);
        li.classList.toggle("now", on);
        var name = li.querySelector(".js-name");
        var badge = li.querySelector(".js-here");
        if (on && !badge) {
          var s = document.createElement("span");
          s.className = "js-here";
          s.textContent = "いまここ";
          name.appendChild(s);
        } else if (!on && badge) badge.remove();
        if (on && nowEl) nowEl.textContent = "いま：" + li.querySelector(".js-name").childNodes[0].textContent.trim();
      });
    }
    mark(secs[0].id);

    /* いま画面のどこを読んでいるかを一覧に反映する。
       画面の上から3割の高さを目印にして、そこを最後に通り過ぎた段を「いまここ」とする。
       （節が重なって見えている状態でも1つに決まるよう、線で判定する）
       いちばん下まで来たときは最後の段に合わせる。最後の段は短いことが多く、
       画面をどれだけ送っても目印の線を越えないことがあるため。 */
    function update() {
      var line = window.innerHeight * 0.3;
      var cur = secs[0].id;
      secs.forEach(function (el) {
        if (el.getBoundingClientRect().top <= line) cur = el.id;
      });
      var atEnd = (window.innerHeight + window.scrollY) >= (document.documentElement.scrollHeight - 4);
      if (atEnd) cur = secs[secs.length - 1].id;
      mark(cur);
    }
    var tick = false;
    window.addEventListener("scroll", function () {
      if (tick) return;
      tick = true;
      requestAnimationFrame(function () { tick = false; update(); });
    }, { passive: true });
    window.addEventListener("resize", update, { passive: true });
    update();

    /* 狭い画面では、押した先へ送ったあと一覧を閉じる */
    side.addEventListener("click", function (ev) {
      var a = ev.target.closest ? ev.target.closest(".js-link") : null;
      if (a) side.classList.remove("open");
    });
  });
})();
