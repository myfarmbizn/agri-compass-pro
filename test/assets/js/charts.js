/* ============================================================
   マイファーム農業経営コンパス — SVGチャートライブラリ（依存なし）
   配色は検証済みカテゴリ8色（validate_palette.js 合格）。
   すべて viewBox ベースでレスポンシブ。ホバーツールチップ内蔵。
   ============================================================ */
(function () {
  "use strict";

  // 白背景（ライト）固定。検証済みカテゴリ8色（validate_palette.js 合格）
  const SERIES = ["#2a78d6", "#1baf7a", "#eda100", "#e34948", "#008300", "#e87ba4", "#4a3aa7", "#946200"];
  const INK = "#16212c", INK2 = "var(--ink-2)", INK3 = "var(--ink-3)";
  const GRID = "rgba(15,30,45,.09)", AXIS = "rgba(15,30,45,.28)";
  const LINEC = "#16212c";            // 重ね描きする折れ線（残高線など）
  const DOT_STROKE = "#ffffff";       // マーカーの縁取り
  const CONNECT = "rgba(15,30,45,.35)";
  const CROSS = "rgba(15,30,45,.3)";
  const FONT = 11;
  // 塗りの上に置く文字色（明るい塗りには濃い字）
  function onFill(hex) {
    const m = /^#([0-9a-f]{6})$/i.exec(hex || "");
    if (!m) return "#fff";
    const n = parseInt(m[1], 16);
    const lum = 0.299 * (n >> 16 & 255) + 0.587 * (n >> 8 & 255) + 0.114 * (n & 255);
    return lum > 150 ? "#16212c" : "#fff";
  }

  /* ---------- ツールチップ（シングルトン） ---------- */
  let tipEl = null;
  function tip() {
    if (!tipEl) {
      tipEl = document.createElement("div");
      tipEl.className = "viz-tip";
      document.body.appendChild(tipEl);
    }
    return tipEl;
  }
  function showTip(html, x, y) {
    const t = tip();
    t.innerHTML = html;
    t.classList.add("show");
    const r = t.getBoundingClientRect();
    let px = x + 14, py = y - r.height - 10;
    if (px + r.width > window.innerWidth - 8) px = x - r.width - 14;
    if (py < 8) py = y + 16;
    t.style.left = px + "px";
    t.style.top = py + "px";
  }
  function hideTip() { if (tipEl) tipEl.classList.remove("show"); }
  function tipRow(color, label, value) {
    return `<div class="t-row"><span class="dot" style="background:${color}"></span>${esc(label)}<b>${esc(value)}</b></div>`;
  }

  function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }

  /* ---------- 目盛り ---------- */
  function niceTicks(min, max, n) {
    if (min === max) { max = min + 1; }
    const span = max - min;
    const step0 = span / (n || 4);
    const mag = Math.pow(10, Math.floor(Math.log10(step0)));
    const norm = step0 / mag;
    const step = (norm >= 5 ? 10 : norm >= 2.5 ? 5 : norm >= 1.5 ? 2.5 : norm >= 1 ? 2 : 1) * mag;
    const lo = Math.floor(min / step) * step;
    const hi = Math.ceil(max / step) * step;
    const ticks = [];
    for (let v = lo; v <= hi + step * 0.001; v += step) ticks.push(Math.round(v * 1e9) / 1e9);
    return { ticks, lo, hi };
  }

  function svgEl(w, h) {
    const s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    s.setAttribute("viewBox", `0 0 ${w} ${h}`);
    s.setAttribute("role", "img");
    return s;
  }
  function el(name, attrs, text) {
    const e = document.createElementNS("http://www.w3.org/2000/svg", name);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (text != null) e.textContent = text;
    return e;
  }
  function legend(container, items) {
    const lg = document.createElement("div");
    lg.className = "legend";
    lg.innerHTML = items.map(it => `<span class="lg"><span class="sw" style="background:${it.color}"></span>${esc(it.label)}</span>`).join("");
    container.appendChild(lg);
  }

  /* ============================================================
     棒グラフ（縦・グループ/単一系列）
     cfg: { labels[], series:[{name, values[], color?}], fmt(v), h?, yLabel?, direct? }
     ============================================================ */
  function barChart(container, cfg) {
    container.innerHTML = "";
    const W = 720, H = cfg.h || 300, padL = 56, padR = 12, padT = 14, padB = 34;
    const svg = svgEl(W, H);
    const n = cfg.labels.length, m = cfg.series.length;
    const all = cfg.series.flatMap(s => s.values).filter(v => v != null);
    const { ticks, lo, hi } = niceTicks(Math.min(0, ...all), Math.max(0, ...all, 1), 4);
    const y = v => padT + (H - padT - padB) * (1 - (v - lo) / (hi - lo));
    const plotW = W - padL - padR;
    const groupW = plotW / n;
    const barW = Math.min(38, (groupW * 0.72) / m);

    ticks.forEach(t => {
      svg.appendChild(el("line", { x1: padL, x2: W - padR, y1: y(t), y2: y(t), stroke: t === 0 ? AXIS : GRID, "stroke-width": 1 }));
      svg.appendChild(el("text", { x: padL - 8, y: y(t) + 3.5, "text-anchor": "end", fill: INK3, "font-size": FONT }, cfg.fmt ? cfg.fmt(t) : t));
    });

    cfg.labels.forEach((lab, i) => {
      const cx = padL + groupW * i + groupW / 2;
      svg.appendChild(el("text", { x: cx, y: H - padB + 18, "text-anchor": "middle", fill: INK2, "font-size": FONT }, lab));
      cfg.series.forEach((s, j) => {
        const v = s.values[i];
        if (v == null) return;
        const x0 = cx - (barW * m + 2 * (m - 1)) / 2 + j * (barW + 2);
        const y1 = y(Math.max(0, v)), y2 = y(Math.min(0, v));
        const hgt = Math.max(1.5, y2 - y1);
        const color = s.color || SERIES[j % 8];
        const rect = el("rect", { x: x0, y: y1, width: barW, height: hgt, rx: 4, fill: color, cursor: "pointer" });
        rect.addEventListener("mousemove", ev => showTip(
          `<div class="t-title">${esc(lab)}</div>` + tipRow(color, s.name, cfg.fmt ? cfg.fmt(v) : v), ev.clientX, ev.clientY));
        rect.addEventListener("mouseleave", hideTip);
        svg.appendChild(rect);
        if (cfg.direct) svg.appendChild(el("text", { x: x0 + barW / 2, y: y1 - 5, "text-anchor": "middle", fill: INK2, "font-size": 10 }, cfg.fmt ? cfg.fmt(v) : v));
      });
    });
    container.appendChild(svg);
    if (m > 1) legend(container, cfg.series.map((s, j) => ({ label: s.name, color: s.color || SERIES[j % 8] })));
  }

  /* ============================================================
     積み上げ棒（月次資金繰り・費用構成など）
     cfg: { labels[], series:[{name, values[], color?}], fmt, h?, line?:{name,values[]} }
     負値は下側に積む。line は折れ線の重ね描き（残高など・同じ目盛り）。
     ============================================================ */
  function stackedBar(container, cfg) {
    container.innerHTML = "";
    const W = 720, H = cfg.h || 320, padL = 58, padR = 12, padT = 14, padB = 34;
    const svg = svgEl(W, H);
    const n = cfg.labels.length;
    let maxPos = 1, minNeg = 0;
    for (let i = 0; i < n; i++) {
      let p = 0, q = 0;
      cfg.series.forEach(s => { const v = s.values[i] || 0; if (v >= 0) p += v; else q += v; });
      maxPos = Math.max(maxPos, p); minNeg = Math.min(minNeg, q);
    }
    if (cfg.line) { maxPos = Math.max(maxPos, ...cfg.line.values); minNeg = Math.min(minNeg, ...cfg.line.values); }
    const { ticks, lo, hi } = niceTicks(minNeg, maxPos, 4);
    const y = v => padT + (H - padT - padB) * (1 - (v - lo) / (hi - lo));
    const plotW = W - padL - padR;
    const slotW = plotW / n;
    const barW = Math.min(44, slotW * 0.62);

    ticks.forEach(t => {
      svg.appendChild(el("line", { x1: padL, x2: W - padR, y1: y(t), y2: y(t), stroke: t === 0 ? AXIS : GRID }));
      svg.appendChild(el("text", { x: padL - 8, y: y(t) + 3.5, "text-anchor": "end", fill: INK3, "font-size": FONT }, cfg.fmt ? cfg.fmt(t) : t));
    });

    cfg.labels.forEach((lab, i) => {
      const cx = padL + slotW * i + slotW / 2;
      svg.appendChild(el("text", { x: cx, y: H - padB + 18, "text-anchor": "middle", fill: INK2, "font-size": FONT }, lab));
      const nzCount = cfg.series.reduce((a, s) => a + ((s.values[i] || 0) !== 0 ? 1 : 0), 0);
      let accP = 0, accN = 0;
      cfg.series.forEach((s, j) => {
        const v = s.values[i] || 0;
        if (v === 0) return;
        const color = s.color || SERIES[j % 8];
        let y1, hgt;
        if (v > 0) { y1 = y(accP + v); hgt = y(accP) - y1; accP += v; }
        else { y1 = y(accN); hgt = y(accN + v) - y1; accN += v; }
        const rect = el("rect", { x: cx - barW / 2, y: y1 + 1, width: barW, height: Math.max(1, hgt - 2), rx: 3, fill: color, cursor: "pointer" });
        rect.addEventListener("mousemove", ev => {
          let html = `<div class="t-title">${esc(lab)}</div>`;
          cfg.series.forEach((ss, jj) => {
            const vv = ss.values[i] || 0;
            if (vv !== 0) html += tipRow(ss.color || SERIES[jj % 8], ss.name, cfg.fmt ? cfg.fmt(vv) : vv);
          });
          showTip(html, ev.clientX, ev.clientY);
        });
        rect.addEventListener("mouseleave", hideTip);
        svg.appendChild(rect);
        // 区分内の金額直書き（十分な高さがある区分のみ。区分が1つだけの棒は頂点の合計と重複するため出さない）
        if (cfg.segLabels && hgt - 2 >= 18 && !(cfg.totals && nzCount === 1)) {
          svg.appendChild(el("text", {
            x: cx, y: y1 + 1 + (hgt - 2) / 2 + 3.5, "text-anchor": "middle",
            fill: onFill(color), "font-size": 10, "pointer-events": "none"
          }, cfg.fmt ? cfg.fmt(v) : v));
        }
      });
      // 棒の頂点に月合計を直書き
      if (cfg.totals && accP > 0) {
        svg.appendChild(el("text", {
          x: cx, y: y(accP) - 5, "text-anchor": "middle",
          fill: INK, "font-size": 10.5, "font-weight": 650
        }, cfg.fmt ? cfg.fmt(accP) : accP));
      }
    });

    if (cfg.line) {
      const pts = cfg.line.values.map((v, i) => [padL + slotW * i + slotW / 2, y(v)]);
      svg.appendChild(el("path", { d: "M" + pts.map(p => p.join(",")).join("L"), fill: "none", stroke: LINEC, "stroke-width": 2, "stroke-linejoin": "round" }));
      pts.forEach((p, i) => {
        const c = el("circle", { cx: p[0], cy: p[1], r: 3.5, fill: LINEC, stroke: DOT_STROKE, "stroke-width": 2, cursor: "pointer" });
        c.addEventListener("mousemove", ev => showTip(`<div class="t-title">${esc(cfg.labels[i])}</div>` + tipRow(LINEC, cfg.line.name, cfg.fmt ? cfg.fmt(cfg.line.values[i]) : cfg.line.values[i]), ev.clientX, ev.clientY));
        c.addEventListener("mouseleave", hideTip);
        svg.appendChild(c);
      });
    }
    container.appendChild(svg);
    const items = cfg.series.map((s, j) => ({ label: s.name, color: s.color || SERIES[j % 8] }));
    if (cfg.line) items.push({ label: cfg.line.name, color: LINEC });
    legend(container, items);
  }

  /* ============================================================
     折れ線
     cfg: { labels[], series:[{name, values[], color?}], fmt, h?, area? }
     ============================================================ */
  function lineChart(container, cfg) {
    container.innerHTML = "";
    const W = 720, H = cfg.h || 300, padL = 58, padR = 14, padT = 14, padB = 34;
    const svg = svgEl(W, H);
    const n = cfg.labels.length;
    const all = cfg.series.flatMap(s => s.values).filter(v => v != null);
    const { ticks, lo, hi } = niceTicks(Math.min(0, ...all), Math.max(...all, 1), 4);
    const y = v => padT + (H - padT - padB) * (1 - (v - lo) / (hi - lo));
    const x = i => padL + (W - padL - padR) * (n === 1 ? 0.5 : i / (n - 1));

    ticks.forEach(t => {
      svg.appendChild(el("line", { x1: padL, x2: W - padR, y1: y(t), y2: y(t), stroke: t === 0 ? AXIS : GRID }));
      svg.appendChild(el("text", { x: padL - 8, y: y(t) + 3.5, "text-anchor": "end", fill: INK3, "font-size": FONT }, cfg.fmt ? cfg.fmt(t) : t));
    });
    const step = Math.ceil(n / 12);
    cfg.labels.forEach((lab, i) => {
      if (i % step) return;
      svg.appendChild(el("text", { x: x(i), y: H - padB + 18, "text-anchor": "middle", fill: INK2, "font-size": FONT }, lab));
    });

    cfg.series.forEach((s, j) => {
      const color = s.color || SERIES[j % 8];
      const pts = s.values.map((v, i) => v == null ? null : [x(i), y(v)]).filter(Boolean);
      if (cfg.area) {
        const d = "M" + pts.map(p => p.join(",")).join("L") + `L${pts[pts.length - 1][0]},${y(Math.max(0, lo))}L${pts[0][0]},${y(Math.max(0, lo))}Z`;
        svg.appendChild(el("path", { d, fill: color, opacity: .12 }));
      }
      svg.appendChild(el("path", { d: "M" + pts.map(p => p.join(",")).join("L"), fill: "none", stroke: color, "stroke-width": 2, "stroke-linejoin": "round" }));
    });

    // ホバー層（縦クロスヘア）
    const hover = el("rect", { x: padL, y: padT, width: W - padL - padR, height: H - padT - padB, fill: "transparent" });
    const cross = el("line", { y1: padT, y2: H - padB, stroke: CROSS, "stroke-width": 1, visibility: "hidden" });
    svg.appendChild(cross);
    hover.addEventListener("mousemove", ev => {
      const r = svg.getBoundingClientRect();
      const mx = (ev.clientX - r.left) / r.width * W;
      let best = 0, bd = 1e9;
      for (let i = 0; i < n; i++) { const d = Math.abs(x(i) - mx); if (d < bd) { bd = d; best = i; } }
      cross.setAttribute("x1", x(best)); cross.setAttribute("x2", x(best));
      cross.setAttribute("visibility", "visible");
      let html = `<div class="t-title">${esc(cfg.labels[best])}</div>`;
      cfg.series.forEach((s, j) => {
        if (s.values[best] == null) return;
        html += tipRow(s.color || SERIES[j % 8], s.name, cfg.fmt ? cfg.fmt(s.values[best]) : s.values[best]);
      });
      showTip(html, ev.clientX, ev.clientY);
    });
    hover.addEventListener("mouseleave", () => { hideTip(); cross.setAttribute("visibility", "hidden"); });
    svg.appendChild(hover);
    container.appendChild(svg);
    if (cfg.series.length > 1) legend(container, cfg.series.map((s, j) => ({ label: s.name, color: s.color || SERIES[j % 8] })));
  }

  /* ============================================================
     横棒（ランキング・比較。diverging=trueで正負を左右に）
     cfg: { rows:[{label, value, color?, note?}], fmt, h?, diverging? }
     ============================================================ */
  function hbar(container, cfg) {
    container.innerHTML = "";
    const rows = cfg.rows;
    const rowH = 34, padT = 8, padB = 26, padL = cfg.padL || 130, padR = 70;
    const W = 720, H = padT + padB + rows.length * rowH;
    const svg = svgEl(W, H);
    const vals = rows.map(r => r.value);
    const maxA = Math.max(...vals.map(Math.abs), 1);
    const zeroX = cfg.diverging ? padL + (W - padL - padR) / 2 : padL;
    const scale = (W - padL - padR) / (cfg.diverging ? 2 * maxA : maxA);

    if (cfg.diverging) svg.appendChild(el("line", { x1: zeroX, x2: zeroX, y1: padT, y2: H - padB, stroke: AXIS }));

    rows.forEach((r, i) => {
      const cy = padT + rowH * i + rowH / 2;
      const w = Math.abs(r.value) * scale;
      const x0 = r.value >= 0 ? zeroX : zeroX - w;
      const color = r.color || (cfg.diverging ? (r.value >= 0 ? SERIES[1] : SERIES[5]) : SERIES[0]);
      svg.appendChild(el("text", { x: padL - 10, y: cy + 4, "text-anchor": "end", fill: INK2, "font-size": FONT }, r.label));
      const rect = el("rect", { x: x0, y: cy - 9, width: Math.max(1.5, w), height: 18, rx: 4, fill: color, cursor: "pointer" });
      rect.addEventListener("mousemove", ev => showTip(
        `<div class="t-title">${esc(r.label)}</div>` + tipRow(color, r.note || "", cfg.fmt ? cfg.fmt(r.value) : r.value), ev.clientX, ev.clientY));
      rect.addEventListener("mouseleave", hideTip);
      svg.appendChild(rect);
      const tx = r.value >= 0 ? x0 + w + 6 : x0 - 6;
      svg.appendChild(el("text", { x: tx, y: cy + 4, "text-anchor": r.value >= 0 ? "start" : "end", fill: INK, "font-size": FONT, "font-weight": 650 }, cfg.fmt ? cfg.fmt(r.value) : r.value));
    });
    container.appendChild(svg);
  }

  /* ============================================================
     レーダー（経営診断 5〜6項目）
     cfg: { axes[], series:[{name, values[](0-100), color?}] }
     ============================================================ */
  function radar(container, cfg) {
    container.innerHTML = "";
    const W = 460, H = 400, cx = W / 2, cy = H / 2 + 6, R = 140;
    const svg = svgEl(W, H);
    const n = cfg.axes.length;
    const ang = i => -Math.PI / 2 + (2 * Math.PI * i) / n;
    const pt = (i, r) => [cx + Math.cos(ang(i)) * r, cy + Math.sin(ang(i)) * r];

    [25, 50, 75, 100].forEach(lv => {
      const pts = Array.from({ length: n }, (_, i) => pt(i, R * lv / 100));
      svg.appendChild(el("polygon", { points: pts.map(p => p.join(",")).join(" "), fill: "none", stroke: lv === 100 ? AXIS : GRID }));
    });
    cfg.axes.forEach((a, i) => {
      const [x2, y2] = pt(i, R);
      svg.appendChild(el("line", { x1: cx, y1: cy, x2, y2, stroke: GRID }));
      const [lx, ly] = pt(i, R + 24);
      svg.appendChild(el("text", { x: lx, y: ly + 4, "text-anchor": "middle", fill: INK2, "font-size": 11.5, "font-weight": 650 }, a));
    });
    cfg.series.forEach((s, j) => {
      const color = s.color || SERIES[j % 8];
      const pts = s.values.map((v, i) => pt(i, R * Math.max(0, Math.min(100, v)) / 100));
      svg.appendChild(el("polygon", { points: pts.map(p => p.join(",")).join(" "), fill: color, opacity: .14 }));
      svg.appendChild(el("polygon", { points: pts.map(p => p.join(",")).join(" "), fill: "none", stroke: color, "stroke-width": 2 }));
      pts.forEach((p, i) => {
        const c = el("circle", { cx: p[0], cy: p[1], r: 4, fill: color, stroke: DOT_STROKE, "stroke-width": 1.5, cursor: "pointer" });
        c.addEventListener("mousemove", ev => showTip(`<div class="t-title">${esc(cfg.axes[i])}</div>` + tipRow(color, s.name, Math.round(s.values[i]) + "点"), ev.clientX, ev.clientY));
        c.addEventListener("mouseleave", hideTip);
        svg.appendChild(c);
      });
    });
    container.appendChild(svg);
    if (cfg.series.length > 1) legend(container, cfg.series.map((s, j) => ({ label: s.name, color: s.color || SERIES[j % 8] })));
  }

  /* ============================================================
     散布図（品目の位置取り：横=労働時間当たり所得、縦=10a所得 等）
     cfg: { points:[{label, x, y, size?, color?, tip?}], xLabel, yLabel, fmtX, fmtY }
     ============================================================ */
  function scatter(container, cfg) {
    container.innerHTML = "";
    const W = 720, H = cfg.h || 380, padL = 62, padR = 20, padT = 16, padB = 46;
    const svg = svgEl(W, H);
    const xs = cfg.points.map(p => p.x), ys = cfg.points.map(p => p.y);
    const tx = niceTicks(Math.min(0, ...xs), Math.max(...xs) * 1.08 || 1, 5);
    const ty = niceTicks(Math.min(0, ...ys), Math.max(...ys) * 1.08 || 1, 4);
    const x = v => padL + (W - padL - padR) * (v - tx.lo) / (tx.hi - tx.lo);
    const y = v => padT + (H - padT - padB) * (1 - (v - ty.lo) / (ty.hi - ty.lo));

    ty.ticks.forEach(t => {
      svg.appendChild(el("line", { x1: padL, x2: W - padR, y1: y(t), y2: y(t), stroke: t === 0 ? AXIS : GRID }));
      svg.appendChild(el("text", { x: padL - 8, y: y(t) + 3.5, "text-anchor": "end", fill: INK3, "font-size": FONT }, cfg.fmtY ? cfg.fmtY(t) : t));
    });
    tx.ticks.forEach(t => {
      svg.appendChild(el("line", { x1: x(t), x2: x(t), y1: padT, y2: H - padB, stroke: t === 0 ? AXIS : GRID }));
      svg.appendChild(el("text", { x: x(t), y: H - padB + 18, "text-anchor": "middle", fill: INK3, "font-size": FONT }, cfg.fmtX ? cfg.fmtX(t) : t));
    });
    if (cfg.xLabel) svg.appendChild(el("text", { x: (padL + W - padR) / 2, y: H - 6, "text-anchor": "middle", fill: INK3, "font-size": 11 }, cfg.xLabel));
    if (cfg.yLabel) svg.appendChild(el("text", { x: 14, y: padT + 2, fill: INK3, "font-size": 11 }, cfg.yLabel));

    cfg.points.forEach((p, i) => {
      const color = p.color || SERIES[i % 8];
      const r = p.size || 9;
      const c = el("circle", { cx: x(p.x), cy: y(p.y), r, fill: color, opacity: .88, stroke: DOT_STROKE, "stroke-width": 2, cursor: "pointer" });
      c.addEventListener("mousemove", ev => showTip(`<div class="t-title">${esc(p.label)}</div>` + (p.tip || tipRow(color, cfg.xLabel || "x", cfg.fmtX ? cfg.fmtX(p.x) : p.x) + tipRow(color, cfg.yLabel || "y", cfg.fmtY ? cfg.fmtY(p.y) : p.y)), ev.clientX, ev.clientY));
      c.addEventListener("mouseleave", hideTip);
      svg.appendChild(c);
      svg.appendChild(el("text", { x: x(p.x), y: y(p.y) - r - 6, "text-anchor": "middle", fill: INK, "font-size": 11, "font-weight": 650 }, p.label));
    });
    container.appendChild(svg);
  }

  /* ============================================================
     ヒートマップ（品目×月の労働時間など）
     cfg: { rows[], cols[], values[][], fmt, colorLo?, colorHi? }
     単色ラダー（青系）で濃淡＝量。
     ============================================================ */
  function heatmap(container, cfg) {
    container.innerHTML = "";
    const rows = cfg.rows.length, cols = cfg.cols.length;
    const cellW = 46, cellH = 34, padL = cfg.padL || 120, padT = 26;
    const W = padL + cols * cellW + 10, H = padT + rows * cellH + 8;
    const svg = svgEl(W, H);
    const flat = cfg.values.flat().filter(v => v != null);
    const max = Math.max(...flat, 1);
    // 単色シーケンシャル（青 #cde2fb → #0d366b 相当を面上で補間）
    function color(v) {
      if (v == null || v === 0) return "rgba(15,30,45,.05)";
      const t = Math.pow(v / max, 0.7);
      const c1 = [28, 92, 171], c0 = [232, 239, 250];
      const mix = c0.map((c, i) => Math.round(c + (c1[i] - c) * t));
      return `rgb(${mix.join(",")})`;
    }
    cfg.cols.forEach((c, j) => svg.appendChild(el("text", { x: padL + j * cellW + cellW / 2, y: padT - 9, "text-anchor": "middle", fill: INK3, "font-size": 10.5 }, c)));
    cfg.rows.forEach((r, i) => {
      svg.appendChild(el("text", { x: padL - 10, y: padT + i * cellH + cellH / 2 + 4, "text-anchor": "end", fill: INK2, "font-size": 11.5 }, r));
      cfg.cols.forEach((c, j) => {
        const v = cfg.values[i][j];
        const rect = el("rect", { x: padL + j * cellW + 1.5, y: padT + i * cellH + 1.5, width: cellW - 3, height: cellH - 3, rx: 5, fill: color(v), cursor: "pointer" });
        rect.addEventListener("mousemove", ev => showTip(`<div class="t-title">${esc(r)}・${esc(c)}</div>` + tipRow("#3f76d2", "", cfg.fmt ? cfg.fmt(v || 0) : (v || 0)), ev.clientX, ev.clientY));
        rect.addEventListener("mouseleave", hideTip);
        svg.appendChild(rect);
        if (v != null && v > max * 0.55) svg.appendChild(el("text", { x: padL + j * cellW + cellW / 2, y: padT + i * cellH + cellH / 2 + 3.5, "text-anchor": "middle", fill: "#fff", "font-size": 10 }, cfg.fmt ? cfg.fmt(v) : v));
      });
    });
    container.appendChild(svg);
  }

  /* ============================================================
     ウォーターフォール（収入→経費→利益の橋）
     cfg: { steps:[{label, value, total?}], fmt }
     total:true の段は累計を柱で示す
     ============================================================ */
  function waterfall(container, cfg) {
    container.innerHTML = "";
    const W = 720, H = cfg.h || 320, padL = 62, padR = 12, padT = 16, padB = 40;
    const svg = svgEl(W, H);
    let acc = 0;
    const nodes = cfg.steps.map(s => {
      if (s.total) return { ...s, from: 0, to: acc };
      const from = acc; acc += s.value;
      return { ...s, from, to: acc };
    });
    const allV = nodes.flatMap(nd => [nd.from, nd.to]);
    const { ticks, lo, hi } = niceTicks(Math.min(0, ...allV), Math.max(...allV, 1), 4);
    const y = v => padT + (H - padT - padB) * (1 - (v - lo) / (hi - lo));
    const slotW = (W - padL - padR) / nodes.length;
    const barW = Math.min(58, slotW * 0.6);

    ticks.forEach(t => {
      svg.appendChild(el("line", { x1: padL, x2: W - padR, y1: y(t), y2: y(t), stroke: t === 0 ? AXIS : GRID }));
      svg.appendChild(el("text", { x: padL - 8, y: y(t) + 3.5, "text-anchor": "end", fill: INK3, "font-size": FONT }, cfg.fmt ? cfg.fmt(t) : t));
    });

    nodes.forEach((nd, i) => {
      const cx = padL + slotW * i + slotW / 2;
      const y1 = y(Math.max(nd.from, nd.to)), y2 = y(Math.min(nd.from, nd.to));
      const v = nd.total ? nd.to : nd.value;
      const color = nd.total ? SERIES[0] : (v >= 0 ? SERIES[1] : SERIES[5]);
      const rect = el("rect", { x: cx - barW / 2, y: y1, width: barW, height: Math.max(2, y2 - y1), rx: 4, fill: color, cursor: "pointer" });
      rect.addEventListener("mousemove", ev => showTip(`<div class="t-title">${esc(nd.label)}</div>` + tipRow(color, nd.total ? "累計" : "増減", cfg.fmt ? cfg.fmt(v) : v), ev.clientX, ev.clientY));
      rect.addEventListener("mouseleave", hideTip);
      svg.appendChild(rect);
      if (i < nodes.length - 1) svg.appendChild(el("line", { x1: cx + barW / 2, x2: padL + slotW * (i + 1) + slotW / 2 - barW / 2, y1: y(nd.to), y2: y(nd.to), stroke: CONNECT, "stroke-dasharray": "3 3" }));
      const labels = nd.label.split("\n");
      labels.forEach((ln, k) => svg.appendChild(el("text", { x: cx, y: H - padB + 16 + k * 12, "text-anchor": "middle", fill: INK2, "font-size": 10.5 }, ln)));
      svg.appendChild(el("text", { x: cx, y: y1 - 6, "text-anchor": "middle", fill: INK, "font-size": 10.5, "font-weight": 650 }, cfg.fmt ? cfg.fmt(v) : v));
    });
    container.appendChild(svg);
  }

  /* ============================================================
     ドーナツではなく100%横帯（費用構成比など）
     cfg: { parts:[{label, value, color?}], fmt }
     ============================================================ */
  function bandChart(container, cfg) {
    container.innerHTML = "";
    const W = 720, H = 74;
    const svg = svgEl(W, H);
    const total = cfg.parts.reduce((a, p) => a + Math.max(0, p.value), 0) || 1;
    let x = 0;
    cfg.parts.forEach((p, i) => {
      const w = Math.max(0, p.value) / total * W;
      if (w <= 0) return;
      const color = p.color || SERIES[i % 8];
      const rect = el("rect", { x: x + 1, y: 8, width: Math.max(1, w - 2), height: 34, rx: 5, fill: color, cursor: "pointer" });
      rect.addEventListener("mousemove", ev => showTip(`<div class="t-title">${esc(p.label)}</div>` + tipRow(color, "", (cfg.fmt ? cfg.fmt(p.value) : p.value) + "（" + Math.round(p.value / total * 100) + "%）"), ev.clientX, ev.clientY));
      rect.addEventListener("mouseleave", hideTip);
      svg.appendChild(rect);
      if (w > 54) {
        svg.appendChild(el("text", { x: x + w / 2, y: 29, "text-anchor": "middle", fill: onFill(color), "font-size": 10.5, "font-weight": 650 }, p.label));
        svg.appendChild(el("text", { x: x + w / 2, y: 62, "text-anchor": "middle", fill: INK3, "font-size": 10 }, Math.round(p.value / total * 100) + "%"));
      }
      x += w;
    });
    container.appendChild(svg);
    legend(container, cfg.parts.map((p, i) => ({ label: p.label, color: p.color || SERIES[i % 8] })));
  }

  window.VIZ = { barChart, stackedBar, lineChart, hbar, radar, scatter, heatmap, waterfall, bandChart, SERIES, showTip, hideTip };
})();
