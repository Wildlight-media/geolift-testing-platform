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
  function kfmt(v) { var k = v / 1000; return v >= 1000 ? "$" + (k % 1 ? k.toFixed(1) : k) + "k" : "$" + Math.round(v); }
  // Draw at the container's real pixel width so 11px labels stay 11px on phones.
  function cw(c, fallback) { return Math.max(280, Math.round(c.clientWidth || fallback)); }
  function get(obj, path) { return path.split(".").reduce(function (o, k) { return o == null ? o : o[k]; }, obj); }
  function niceMax(v, steps) {
    var raw = v / steps, mag = Math.pow(10, Math.floor(Math.log10(raw))), n = raw / mag;
    var step = (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * mag;
    return { max: step * steps, step: step };
  }

  /* ---------- hero: live read (claimed vs measured vs control) ---------- */
  // Built from the same sample test as the readout below: the last four weeks before launch and
  // the 45 test days, 7-day smoothed. The orange line scales the measured lift up to what the
  // platform reported, i.e. the revenue the platform would have you believe the campaign added.
  function heroChart(d) {
    var c = document.getElementById("hero-chart");
    if (!c) return;
    var pre = d.design.fit_series.slice(-34).map(function (p) { return { t: p.test, c: p.control }; });
    var cum = d.readout.cumulative, post = cum.map(function (p, i) {
      return { t: p.test - (i ? cum[i - 1].test : 0), c: p.control - (i ? cum[i - 1].control : 0) };
    });
    var raw = pre.concat(post), s = [];
    for (var i = 6; i < raw.length; i++) {
      var w = raw.slice(i - 6, i + 1);
      s.push({ t: w.reduce(function (a, q) { return a + q.t; }, 0) / 7, c: w.reduce(function (a, q) { return a + q.c; }, 0) / 7 });
    }
    var launch = pre.length - 6, k = d.readout.reported_roas / d.readout.roi, n = s.length;
    s.forEach(function (p, i) { p.r = i < launch ? p.t : p.c + (p.t - p.c) * k; });
    var W = cw(c, 520), H = Math.round(W * 0.5), L = 4, R = 104, T = 14, B = 26;
    var g = svg(c, W, H), hi = Math.max.apply(null, s.map(function (p) { return Math.max(p.r, p.t, p.c); }));
    var lo = Math.min.apply(null, s.map(function (p) { return Math.min(p.t, p.c); }));
    var ymin = lo * 0.82, ymax = hi * 1.04;
    function x(i) { return L + (W - L - R) * i / (n - 1); }
    function y(v) { return T + (H - T - B) * (1 - (v - ymin) / (ymax - ymin)); }
    [0.25, 0.5, 0.75].forEach(function (f) {
      el("line", { x1: L, x2: W - R, y1: T + (H - T - B) * f, y2: T + (H - T - B) * f, stroke: "rgba(239,242,243,.07)" }, g);
    });
    el("line", { x1: L, x2: W - R, y1: H - B, y2: H - B, stroke: "rgba(239,242,243,.3)" }, g);
    var lx = x(launch);
    el("rect", { x: lx, y: T, width: W - R - lx, height: H - T - B, fill: "rgba(239,242,243,.035)" }, g);
    el("line", { x1: lx, x2: lx, y1: T - 4, y2: H - B, stroke: "rgba(239,242,243,.4)", "stroke-dasharray": "2 3" }, g);
    text(g, lx + 8, T + 8, "CAMPAIGN ON", { "class": "tag-label" });
    text(g, L, H - 8, "4 weeks before");
    text(g, W - R, H - 8, "45 test days", { "text-anchor": "end" });
    function path(key, from) {
      return s.slice(from).map(function (p, i) { return (i ? "L" : "M") + x(i + from).toFixed(1) + "," + y(p[key]).toFixed(1); }).join("");
    }
    function line(dpath, stroke, extra, delay) {
      var p = el("path", Object.assign({ d: dpath, fill: "none", stroke: stroke, "stroke-width": 2, "stroke-linejoin": "round" }, extra || {}), g);
      var len = Math.ceil(p.getTotalLength ? p.getTotalLength() : 2000);
      if (!extra || !extra["stroke-dasharray"]) { p.setAttribute("class", "hp-draw"); p.style.setProperty("--len", len); p.style.animationDelay = (delay || 0) + "s"; }
      return p;
    }
    line(path("c", 0), "rgba(239,242,243,.55)", { "stroke-dasharray": "4 3", "stroke-width": 1.5 });
    line(path("r", launch), "#F97316", null, 1.1);
    line(path("t", 0), "#EFF2F3", null, 0);
    var e = s[n - 1], pct = function (v) { return "+" + Math.round((v / e.c - 1) * 100) + "%"; };
    [[e.r, "#F97316", pct(e.r) + " claimed"], [e.t, "#EFF2F3", pct(e.t) + " measured"]].forEach(function (q, i) {
      var t = text(g, W - R + 10, y(q[0]) + 4, q[2], { fill: q[1], "class": "hp-fade" });
      t.style.animationDelay = (2.2 + i * 0.2) + "s";
    });
    var tc = text(g, W - R + 10, y(e.c) + 16, "control", { "class": "hp-fade" }); tc.style.animationDelay = "2.6s";
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
    var raw = d.design.fit_series, W = cw(c, 520), H = 250, L = 52, R = 8, T = 10, B = 28;
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
    var p = d.design.power, W = cw(c, 520), H = 250, L = 42, R = 12, T = 12, B = 30;
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

  /* ---------- design: detection sensitivity (max detectable CPA vs break-even) ---------- */
  function sensChart(d) {
    var c = document.getElementById("sens-chart");
    if (!c || !d.design.max_cpa) return;
    var mx = d.design.max_cpa, be = d.design.breakeven_cpa, top = mx * 1.25;
    var W = cw(c, 560), H = 92, L = 2, R = 2, y0 = 40, bh = 14;
    var g = svg(c, W, H);
    function x(v) { return L + (W - L - R) * v / top; }
    el("rect", { x: x(0), y: y0, width: x(top) - x(0), height: bh, fill: "rgba(14,21,24,.06)" }, g);
    el("rect", { x: x(0), y: y0, width: x(mx) - x(0), height: bh, fill: "#EFF8FB", stroke: "rgba(14,116,144,.55)" }, g);
    el("line", { x1: x(mx), x2: x(mx), y1: y0 - 10, y2: y0 + bh + 10, stroke: TEAL, "stroke-width": 2 }, g);
    el("line", { x1: x(be), x2: x(be), y1: y0 - 10, y2: y0 + bh + 10, stroke: INK, "stroke-width": 2 }, g);
    var narrow = W < 520;
    // On phones the two labels would collide: break-even goes under the bar, the max stays above.
    text(g, x(be), narrow ? y0 + bh + 22 : y0 - 16, "Break-even " + d.design.breakeven_cpa_fmt, { "text-anchor": x(be) < 90 ? "start" : "middle", "class": "val" });
    text(g, x(mx), y0 - 16, "Max detectable " + d.design.max_cpa_fmt, { "text-anchor": x(mx) > W - 120 ? "end" : "middle", fill: TEAL, "class": "val" });
    if (!narrow) {
      text(g, x(0), y0 + bh + 22, "$0", { "text-anchor": "start" });
      text(g, x(mx) / 2, y0 + bh + 22, "detectable", { "text-anchor": "middle", fill: TEAL });
      text(g, x(top), y0 + bh + 22, "cost per incremental order", { "text-anchor": "end" });
    }
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
    var r = d.readout, W = cw(c, 420), H = 260, T = 28, B = 30, gap = 2;
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
    var s = d.readout.cumulative, W = cw(c, 520), H = 260, L = 56, R = 8, T = 10, B = 42, n = s.length;
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

  form();
  fetch("assets/demo.json").then(function (r) { return r.json(); }).then(function (d) {
    fillText(d); gapChart(d); lists(d);
    var draw = function () { heroChart(d); fitChart(d); powerChart(d); sensChart(d); barsChart(d); cumChart(d); };
    draw();
    var t, lastW = window.innerWidth;
    window.addEventListener("resize", function () {
      if (window.innerWidth === lastW) return; lastW = window.innerWidth;
      clearTimeout(t); t = setTimeout(draw, 150);
    });
  });
})();
