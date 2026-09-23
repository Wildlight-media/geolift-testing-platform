/* Renders the homepage sample panels from demo.json (real platform output for the illustrative
   "Aurelia" brand). Plain SVG, no dependencies, so charts stay crisp at any size.
   Chart semantics follow the Wildlight system: ink = measured, orange = platform-reported. */
(function () {
  "use strict";
  var NS = "http://www.w3.org/2000/svg";
  var INK = "#0E1518", GREY = "#9AA3A7", GREY_FILL = "#D3D6D8", TEAL = "#0E7490", ORANGE = "#F97316", RULE = "rgba(14,21,24,.12)";

  function el(tag, attrs, parent) {
    var n = document.createElementNS(NS, tag);
    for (var k in attrs) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }
  function text(parent, x, y, str, attrs) {
    var t = el("text", Object.assign({ x: x, y: y }, attrs || {}), parent);
    t.textContent = str;
    return t;
  }
  function svg(container, w, h) {
    var s = el("svg", { viewBox: "0 0 " + w + " " + h, role: "img", preserveAspectRatio: "xMidYMid meet" });
    container.innerHTML = "";
    container.appendChild(s);
    return s;
  }
  function money(v, dp) {
    var a = Math.abs(v), s = v < 0 ? "−" : "";
    if (a >= 1e6) return s + "$" + (a / 1e6).toFixed(dp == null ? 2 : dp) + "M";
    if (a >= 1e3) return s + "$" + (a / 1e3).toFixed(dp == null ? 1 : dp) + "K";
    return s + "$" + Math.round(a);
  }
  function kfmt(v) { return v >= 1000 ? "$" + Math.round(v / 1000) + "k" : "$" + Math.round(v); }
  function get(obj, path) { return path.split(".").reduce(function (o, k) { return o == null ? o : o[k]; }, obj); }
  function niceMax(v, steps) {
    var raw = v / steps, mag = Math.pow(10, Math.floor(Math.log10(raw))), n = raw / mag;
    var step = (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * mag;
    return { max: step * steps, step: step };
  }

  /* ---------- hero bars (static markup driven by the brand's spec) ---------- */
  function hero() {
    var bars = document.getElementById("hero-bars"), ceil = document.getElementById("hero-ceil");
    if (!bars) return;
    var hs = [30, 36, 33, 41, 38, 47, 44, 53, 50, 60, 57, 68, 64, 76];
    var cs = [41, 49, 45, 56, 52, 64, 60, 72, 68, 82, 78, 92, 87, 96];
    hs.forEach(function (h, i) {
      var d = document.createElement("div");
      d.style.height = h + "%";
      d.style.background = "rgba(239,242,243," + (i < 6 ? ".12" : i < 10 ? ".2" : ".34") + ")";
      d.style.animationDelay = (i * 0.28).toFixed(2) + "s";
      bars.appendChild(d);
      var c = document.createElement("div");
      c.style.height = cs[i] + "%";
      c.style.borderTop = "2px solid rgba(249,115,22," + (i < 6 ? ".4" : ".75") + ")";
      c.style.animationDelay = (0.5 + i * 0.28).toFixed(2) + "s";
      ceil.appendChild(c);
    });
  }

  /* ---------- text slots ---------- */
  function fillText(d) {
    document.querySelectorAll("[data-k]").forEach(function (n) {
      var v = get(d, n.getAttribute("data-k"));
      if (v != null) n.textContent = v;
    });
    if (!d.readout.significant) document.querySelectorAll(".sig").forEach(function (n) { n.classList.add("nosig"); });
  }

  /* ---------- reported vs measured ---------- */
  function gapChart(d) {
    var c = document.getElementById("gap-chart");
    if (!c) return;
    var r = d.readout, max = Math.max(r.reported_roas, r.roi_ci_high || r.roi) * 1.15;
    function pct(v) { return (100 * v / max).toFixed(2) + "%"; }
    c.innerHTML =
      '<div class="gap-row reported"><div class="top"><span class="label">Platform-reported ROAS</span><span class="val">' + r.reported_roas_fmt + '</span></div>' +
      '<div class="gap-track"><div class="gap-fill" style="width:' + pct(r.reported_roas) + '"></div></div>' +
      '<span class="meta">What the ad platform credited to the campaign</span></div>' +
      '<div class="gap-row measured"><div class="top"><span class="label">Measured incremental ROAS</span><span class="val">' + r.roi_fmt + '</span></div>' +
      '<div class="gap-track"><div class="gap-fill" style="width:' + pct(r.roi) + '"></div>' +
      (r.roi_ci_low != null ? '<div class="ci" style="left:' + pct(Math.max(0, r.roi_ci_low)) + ';width:' + (100 * (r.roi_ci_high - Math.max(0, r.roi_ci_low)) / max).toFixed(2) + '%"></div>' : "") +
      '</div><span class="meta">Revenue that would not have happened without the spend · ' + r.roi_ci_fmt + '</span></div>';
  }

  /* ---------- design: pre-period fit ---------- */
  function fitChart(d) {
    var c = document.getElementById("fit-chart");
    if (!c) return;
    var raw = d.design.fit_series, W = 520, H = 250, L = 52, R = 8, T = 10, B = 28;
    var s = raw.slice(6).map(function (p, j) {  // 7-day trailing average: daily sales are too jittery to read
      var win = raw.slice(j, j + 7), avg = function (k) { return win.reduce(function (a, q) { return a + q[k]; }, 0) / 7; };
      return { label: p.label, test: avg("test"), control: avg("control") };
    });
    var g = svg(c, W, H), ys = s.map(function (p) { return p.test; }).concat(s.map(function (p) { return p.control; }));
    var nm = niceMax(Math.max.apply(null, ys), 4), n = s.length;
    function x(i) { return L + (W - L - R) * i / (n - 1); }
    function y(v) { return T + (H - T - B) * (1 - v / nm.max); }
    for (var v = 0; v <= nm.max + 1e-9; v += nm.step) {
      el("line", { x1: L, x2: W - R, y1: y(v), y2: y(v), stroke: v === 0 ? "rgba(14,21,24,.3)" : RULE }, g);
      text(g, L - 8, y(v) + 4, kfmt(v), { "text-anchor": "end" });
    }
    [0, Math.round((n - 1) / 2), n - 1].forEach(function (i) {
      text(g, x(i), H - 8, s[i].label, { "text-anchor": i === 0 ? "start" : i === n - 1 ? "end" : "middle" });
    });
    function path(key) { return s.map(function (p, i) { return (i ? "L" : "M") + x(i).toFixed(1) + "," + y(p[key]).toFixed(1); }).join(""); }
    el("path", { d: path("control"), fill: "none", stroke: GREY, "stroke-width": 1.5 }, g);
    el("path", { d: path("test"), fill: "none", stroke: INK, "stroke-width": 1.5 }, g);
  }

  /* ---------- design: power curve ---------- */
  function powerChart(d) {
    var c = document.getElementById("power-chart");
    if (!c) return;
    var p = d.design.power, W = 520, H = 250, L = 42, R = 12, T = 12, B = 30;
    var g = svg(c, W, H), xmax = Math.max.apply(null, p.map(function (q) { return q.lift; }));
    function x(v) { return L + (W - L - R) * v / xmax; }
    function y(v) { return T + (H - T - B) * (1 - v); }
    [0, .25, .5, .75, 1].forEach(function (v) {
      el("line", { x1: L, x2: W - R, y1: y(v), y2: y(v), stroke: v === 0 ? "rgba(14,21,24,.3)" : RULE }, g);
      text(g, L - 8, y(v) + 4, Math.round(v * 100) + "%", { "text-anchor": "end" });
    });
    p.forEach(function (q) { text(g, x(q.lift), H - 10, Math.round(q.lift * 100) + "%", { "text-anchor": "middle" }); });
    el("line", { x1: L, x2: W - R, y1: y(.8), y2: y(.8), stroke: TEAL, "stroke-dasharray": "4 4" }, g);
    text(g, W - R, y(.8) - 6, "80% target", { "text-anchor": "end", fill: TEAL });
    var dpath = p.map(function (q, i) { return (i ? "L" : "M") + x(q.lift).toFixed(1) + "," + y(q.power).toFixed(1); }).join("");
    el("path", { d: dpath, fill: "none", stroke: INK, "stroke-width": 1.5 }, g);
    p.forEach(function (q) {
      el("rect", { x: x(q.lift) - 3.5, y: y(q.power) - 3.5, width: 7, height: 7, fill: q.lift === d.design.mde ? TEAL : INK }, g);
    });
  }

  function lists(d) {
    var ml = document.getElementById("market-list"), dl = document.getElementById("donor-list");
    if (ml) ml.innerHTML = d.test.markets.map(function (m) { return "<li><span>" + m.name + "</span><span>" + (m.share * 100).toFixed(1) + "%</span></li>"; }).join("");
    if (dl) dl.innerHTML = d.design.donors.map(function (m) { return "<li><span>" + m.name + "</span><span>" + (m.weight * 100).toFixed(1) + "%</span></li>"; }).join("");
  }

  /* ---------- readout: control -> lift -> test bars ---------- */
  function barsChart(d) {
    var c = document.getElementById("bars-chart");
    if (!c) return;
    var r = d.readout, W = 420, H = 260, T = 28, B = 30, gap = 2;
    var g = svg(c, W, H), max = r.test * 1.05, bw = (W - 2 * gap) / 3;
    function h(v) { return (H - T - B) * v / max; }
    var base = H - B;
    el("rect", { x: 0, y: base - h(r.control), width: bw, height: h(r.control), fill: GREY_FILL }, g);
    el("rect", { x: bw + gap, y: base - h(r.test), width: bw, height: Math.max(3, h(r.lift)), fill: TEAL }, g);
    el("rect", { x: 2 * (bw + gap), y: base - h(r.test), width: bw, height: h(r.test), fill: INK }, g);
    el("line", { x1: 0, x2: W, y1: base, y2: base, stroke: "rgba(14,21,24,.3)" }, g);
    text(g, bw / 2, base - h(r.control) - 8, money(r.control), { "text-anchor": "middle", "class": "val" });
    text(g, bw * 1.5 + gap, base - h(r.test) - 8, money(r.lift), { "text-anchor": "middle", "class": "val" });
    text(g, bw * 2.5 + 2 * gap, base - h(r.test) - 8, money(r.test), { "text-anchor": "middle", "class": "val" });
    ["Control", "Lift", "Test"].forEach(function (l, i) { text(g, bw * (i + .5) + gap * i, H - 8, l, { "text-anchor": "middle" }); });
  }

  /* ---------- readout: cumulative revenue ---------- */
  function cumChart(d) {
    var c = document.getElementById("cum-chart");
    if (!c) return;
    var s = d.readout.cumulative, W = 520, H = 260, L = 56, R = 8, T = 10, B = 42, n = s.length;
    var g = svg(c, W, H), nm = niceMax(Math.max.apply(null, s.map(function (p) { return Math.max(p.test, p.hi || 0); })), 4);
    function x(i) { return L + (W - L - R) * i / (n - 1); }
    function y(v) { return T + (H - T - B) * (1 - v / nm.max); }
    for (var v = 0; v <= nm.max + 1e-9; v += nm.step) {
      el("line", { x1: L, x2: W - R, y1: y(v), y2: y(v), stroke: v === 0 ? "rgba(14,21,24,.3)" : RULE }, g);
      text(g, L - 8, y(v) + 4, kfmt(v), { "text-anchor": "end" });
    }
    for (var i = 9; i < n; i += 10) text(g, x(i), H - 24, String(i + 1), { "text-anchor": "middle" });
    text(g, W - R, H - 4, "days after test start", { "text-anchor": "end" });
    if (s[0].lo != null) {
      var band = s.map(function (p, i) { return (i ? "L" : "M") + x(i).toFixed(1) + "," + y(p.hi).toFixed(1); }).join("") +
        s.slice().reverse().map(function (p, j) { return "L" + x(n - 1 - j).toFixed(1) + "," + y(p.lo).toFixed(1); }).join("") + "Z";
      el("path", { d: band, fill: "rgba(154,163,167,.22)" }, g);
    }
    function path(key) { return s.map(function (p, i) { return (i ? "L" : "M") + x(i).toFixed(1) + "," + y(p[key]).toFixed(1); }).join(""); }
    el("path", { d: path("control"), fill: "none", stroke: GREY, "stroke-width": 2 }, g);
    el("path", { d: path("test"), fill: "none", stroke: INK, "stroke-width": 2 }, g);
  }

  /* ---------- form ---------- */
  function form() {
    var f = document.getElementById("check-form"), msg = document.getElementById("form-msg");
    if (!f) return;
    f.addEventListener("submit", function (e) {
      e.preventDefault();
      if (!f.checkValidity()) { msg.className = "form-msg err"; msg.textContent = "Please fill in the required fields."; f.reportValidity(); return; }
      var body = {};
      new FormData(f).forEach(function (v, k) { body[k] = v; });
      var btn = f.querySelector("button"); btn.disabled = true;
      msg.className = "form-msg"; msg.textContent = "Sending…";
      fetch(f.dataset.endpoint || "/api/leads", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body)
      }).then(function (r) {
        if (!r.ok) throw new Error(r.status);
        f.reset(); msg.className = "form-msg ok"; msg.textContent = "Got it. You'll hear back within two business days.";
      }).catch(function () {
        msg.className = "form-msg err"; msg.textContent = "That didn't go through. Email tom@wildlightmedia.com instead.";
      }).finally(function () { btn.disabled = false; });
    });
  }

  hero();
  form();
  fetch("assets/demo.json").then(function (r) { return r.json(); }).then(function (d) {
    fillText(d); gapChart(d); fitChart(d); powerChart(d); lists(d); barsChart(d); cumChart(d);
  });
})();
