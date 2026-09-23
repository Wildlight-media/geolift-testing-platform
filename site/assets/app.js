/* incrementalitytest.com page logic.
   Ported from the Claude Design prototype's logic class (renderVals etc.). Markup for the dynamic
   regions lives in regions.js (generated from the prototype by tools/convert.mjs); this file
   computes the values those templates need, owns the small bit of state, and wires events.
   Data: assets/demo.json (real platform output for the illustrative "Aurelia" brand).
   Map: assets/usmap.js (pre-rendered US paths + projected DMA points, no runtime d3). */
(function () {
  "use strict";

  var TABS = [["markets", "Markets"], ["fit", "Fit"], ["power", "Power"], ["checks", "Checks"]];
  var pct = function (v) { return Math.round(v * 1000) / 10 + "%"; };
  var line = function (pts) { return pts.map(function (p, i) { return (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1); }).join(""); };
  var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var S = { d: null, day: 45, hover: null, vw: window.innerWidth, tab: "markets" };
  var raf = null;

  /* ---------------- values (port of the prototype's renderVals) ---------------- */
  function vals() {
    var d = S.d, v = {}, tabsOn = S.vw < 760, tab = S.tab;
    var R = d.readout, cum = R.cumulative, n = cum.length, spend = R.spend, rr = R.reported_roas;

    // design-panel tabs (phones only)
    v.tabsOn = tabsOn;
    v.tabs = TABS.map(function (t) {
      return { label: t[1], active: tab === t[0], line: tab === t[0] ? "#0E1518" : "transparent", color: tab === t[0] ? "#0E1518" : "#697478",
        select: function () { S.tab = t[0]; render(["design"]); } };
    });
    var show = function (id) { return !tabsOn || tab === id; };
    v.marketsDisplay = show("markets") ? "grid" : "none";
    v.fitPowerDisplay = show("fit") || show("power") ? "grid" : "none";
    v.fitDisplay = show("fit") ? "flex" : "none";
    v.powerDisplay = show("power") ? "flex" : "none";
    v.checksDisplay = show("checks") ? "grid" : "none";
    v.clearHover = function () { if (S.hover) { S.hover = null; render(["design"]); } };

    // hero
    var day = Math.min(S.day, n);
    v.heroTicks = cum.map(function (_, i) { return { bg: i < day ? "#EFF2F3" : "rgba(239,242,243,.14)" }; });
    v.heroDayStr = String(day).padStart(2, "0");
    v.heroPhase = day >= n ? "Spend window closed · reading" : "Spend on · " + d.test.n_markets + " test markets";
    v.replayHero = startHero;
    var rep = cum.map(function (c, i) { return c.control + spend * (i + 1) / n * rr; });
    var max = rep[n - 1] * 1.06;
    var X = function (i) { return i / (n - 1) * 1000; }, Y = function (x) { return 300 - x / max * 300; };
    var k = day;
    var tp = cum.slice(0, k).map(function (c, i) { return [X(i), Y(c.test)]; });
    var cp = cum.slice(0, k).map(function (c, i) { return [X(i), Y(c.control)]; });
    v.heroTestPath = line(tp); v.heroControlPath = line(cp);
    v.heroRepPath = line(rep.slice(0, k).map(function (r, i) { return [X(i), Y(r)]; }));
    v.heroLiftArea = line(tp.concat(cp.slice().reverse())) + "Z";
    var c = cum[k - 1], topP = function (x) { return (100 - x / max * 100) + "%"; };
    v.heroCursorX = X(k - 1).toFixed(1);
    v.heroCursorPct = (X(k - 1) / 10) + "%";
    v.heroRepTop = topP(rep[k - 1]); v.heroTestTop = topP(c.test); v.heroCtrlTop = topP(c.control);
    v.heroClaimTop = topP((rep[k - 1] + c.test) / 2);
    v.heroCausedTop = topP((c.test + c.control) / 2);
    v.heroShowNotes = k >= Math.round(n / 2);
    var roiNow = (c.test - c.control) / (spend * k / n);
    var hw = Math.min(2.4, (R.roi - R.roi_ci_low) * Math.sqrt(n / k));
    var lo = Math.max(0, roiNow - hw), hi = Math.min(4, roiNow + hw);
    v.heroRoiFmt = k >= n ? R.roi_fmt : roiNow.toFixed(2) + "x";
    v.heroCiFmt = k >= n ? R.roi_ci_fmt.replace("90% CI ", "") : lo.toFixed(2) + "x–" + hi.toFixed(2) + "x";
    v.heroCiLeft = (lo / 4 * 100) + "%"; v.heroCiWidth = ((hi - lo) / 4 * 100) + "%";
    v.heroRoiLeft = (Math.max(0, Math.min(4, roiNow)) / 4 * 100) + "%";
    var sig = k >= n ? R.significant : roiNow - hw > 0;
    v.heroSigLabel = sig ? "Significant" : "Not yet readable";
    v.heroSigSq = sig ? "#EFF2F3" : "rgba(239,242,243,.35)";

    // gap
    v.gapRepPct = (Math.min(rr, 4) / 4 * 100) + "%"; v.gapRoiPct = (Math.min(R.roi, 4) / 4 * 100) + "%";
    v.gapCiLeft = (Math.max(0, R.roi_ci_low) / 4 * 100) + "%"; v.gapCiRight = (Math.min(4, R.roi_ci_high) / 4 * 100) + "%";
    v.gapCiWidth = ((Math.min(4, R.roi_ci_high) - Math.max(0, R.roi_ci_low)) / 4 * 100) + "%";

    // pre-period fit (7-day smoothing keeps daily noise from hiding the fit)
    var raw = d.design.fit_series, fs = raw.slice(6).map(function (p, j) {
      var w = raw.slice(j, j + 7), a = function (key) { return w.reduce(function (s, q) { return s + q[key]; }, 0) / 7; };
      return { label: p.label, test: a("test"), control: a("control") };
    });
    var fm = Math.max.apply(null, fs.map(function (p) { return Math.max(p.test, p.control); })) * 1.08;
    var FX = function (i) { return i / (fs.length - 1) * 1000; }, FY = function (x) { return 200 - x / fm * 200; };
    v.fitTestPath = line(fs.map(function (p, i) { return [FX(i), FY(p.test)]; }));
    v.fitCtrlPath = line(fs.map(function (p, i) { return [FX(i), FY(p.control)]; }));
    v.fitFirst = fs[0].label; v.fitMid = fs[Math.floor(fs.length / 2)].label; v.fitLast = fs[fs.length - 1].label;

    // power
    var pw = d.design.power, pmax = pw[pw.length - 1].lift;
    var PX = function (l) { return l / pmax * 1000; }, PY = function (p) { return 200 - p * 200; };
    var pp = pw.map(function (p) { return [PX(p.lift), PY(p.power)]; });
    v.powerPath = line(pp); v.powerArea = line(pp) + "L1000 200L0 200Z";
    var mde = pw.filter(function (p) { return Math.abs(p.lift - d.design.mde) < 1e-6; })[0] || pw[1];
    v.powerMdeLeft = (mde.lift / pmax * 100) + "%"; v.powerMdeTop = ((1 - mde.power) * 100) + "%";
    v.powerMdeLabel = d.design.mde_fmt + " lift · " + Math.round(mde.power * 100) + "% chance";

    // sensitivity strip: scale grows with the data, labels stay inside the track
    var smax = Math.max(250, Math.ceil(d.design.max_cpa * 1.25 / 50) * 50);
    v.sensMaxPct = (d.design.max_cpa / smax * 100) + "%"; v.sensBePct = (d.design.breakeven_cpa / smax * 100) + "%";
    v.sensMaxFmt = d.design.max_cpa_fmt; v.sensBeFmt = d.design.breakeven_cpa_fmt;

    // readout
    var bm = R.test * 1.12;
    v.barsCtrlPct = (R.control / bm * 100) + "%"; v.barsTestPct = (R.test / bm * 100) + "%";
    v.barsLiftPct = ((R.test - R.control) / bm * 100) + "%";
    v.barsCtrlFmt = R.control_fmt; v.barsTestFmt = R.test_fmt; v.barsLiftFmt = R.lift_fmt;
    var cm = cum[n - 1].test * 1.06, CY = function (x) { return 200 - x / cm * 200; };
    var ct = cum.map(function (p, i) { return [X(i), CY(p.test)]; }), cc = cum.map(function (p, i) { return [X(i), CY(p.control)]; });
    v.cumTestPath = line(ct); v.cumCtrlPath = line(cc); v.cumLiftArea = line(ct.concat(cc.slice().reverse())) + "Z";

    // lists + map
    var H = S.hover, enter = function (name) { return function () { if (S.hover !== name) { S.hover = name; render(["design"]); } }; };
    var mk = d.test.markets.slice().sort(function (a, b) { return b.share - a.share; }), ms = mk[0].share;
    v.marketList = mk.map(function (m) { return { name: m.name, pct: pct(m.share), bar: (m.share / ms * 100) + "%", bg: H === m.name ? "#EFF8FB" : "transparent", enter: enter(m.name) }; });
    var dn = d.design.donors, dm = dn[0].weight;
    v.donorList = dn.map(function (m) { return { name: m.name, pct: Math.round(m.weight * 100) + "%", bar: (m.weight / dm * 100) + "%", bg: H === m.name ? "#EFF8FB" : "transparent", enter: enter(m.name) }; });
    var all = d.design.donors_all || dn;
    v.hoverLabel = "Hover a market"; v.hoverMeta = "";
    if (H) {
      var t = mk.filter(function (m) { return m.name === H; })[0], dd = all.filter(function (m) { return m.name === H; })[0];
      v.hoverLabel = H;
      v.hoverMeta = t ? "Test · " + pct(t.share) + " of revenue" : dd ? "Control · weight " + (dd.weight * 100).toFixed(dd.weight < 0.01 ? 1 : 0) + "%" : "";
    }
    var M = window.US_MAP, xy = function (name) { return M && M.dma[name]; };
    v.mapLoading = !M; v.mapNation = M ? M.nation : ""; v.mapStates = M ? M.states : "";
    v.mapControl = all.map(function (m) {
      var p = xy(m.name); if (!p) return null;
      return { x: p[0], y: p[1], r: (5 + m.weight * 70).toFixed(1), sw: H === m.name ? 3.5 : 1.8, fill: H === m.name ? "rgba(14,116,144,.3)" : "rgba(14,116,144,.08)", enter: enter(m.name) };
    }).filter(Boolean);
    v.mapTest = mk.map(function (m) {
      var p = xy(m.name); if (!p) return null;
      return { x: p[0], y: p[1], r: (6 + m.share * 320).toFixed(1), stroke: H === m.name ? "#0E7490" : "#FFFFFF", enter: enter(m.name) };
    }).filter(Boolean);
    return v;
  }

  /* ---------------- budget-levels chart (derived from the sample readout) ---------------- */
  // Cell A is the sample test itself. Cell B (2x budget) is illustrative: the extra dollars are
  // assumed to return about half the average, which is the point the panel makes.
  function budgetHtml(d) {
    var R = d.readout, a = { s: R.spend, l: R.lift }, marg = R.roi * 0.52, b = { s: R.spend * 2, l: R.lift + R.spend * marg };
    var ymax = Math.ceil(b.l * 1.2 / 10000) * 10000, xmax = b.s / 0.9;
    var X = function (s) { return s / xmax * 1000; }, Y = function (l) { return 300 - l / ymax * 300; };
    var pX = function (s) { return (s / xmax * 100).toFixed(1) + "%"; }, pY = function (l) { return (100 - l / ymax * 100).toFixed(1) + "%"; };
    var k = function (x) { return "$" + Math.round(x / 1000) + "K"; };
    var mono = "font:400 10px/1 'IBM Plex Mono',monospace;color:#697478";
    return '<div style="display:grid;grid-template-columns:40px minmax(0,1fr);gap:6px">' +
      '<div style="position:relative;height:170px;' + mono + '"><span style="position:absolute;right:0;top:0;transform:translateY(-50%)">' + k(ymax) + '</span><span style="position:absolute;right:0;top:50%;transform:translateY(-50%)">' + k(ymax / 2) + '</span><span style="position:absolute;right:0;top:100%;transform:translateY(-50%)">$0</span></div>' +
      '<div style="position:relative;height:170px;border-left:1px solid rgba(14,21,24,.35);border-bottom:1px solid rgba(14,21,24,.35)">' +
      '<svg viewBox="0 0 1000 300" preserveAspectRatio="none" style="position:absolute;inset:0;width:100%;height:100%;overflow:visible">' +
      '<line x1="0" x2="1000" y1="150" y2="150" stroke="rgba(14,21,24,.08)" vector-effect="non-scaling-stroke"></line>' +
      '<path d="M0 300 L' + X(a.s).toFixed(1) + ' ' + Y(a.l).toFixed(1) + '" fill="none" stroke="#0E1518" stroke-width="2" vector-effect="non-scaling-stroke"></path>' +
      '<path d="M' + X(a.s).toFixed(1) + ' ' + Y(a.l).toFixed(1) + ' L' + X(b.s).toFixed(1) + ' ' + Y(b.l).toFixed(1) + '" fill="none" stroke="#0E7490" stroke-width="2" stroke-dasharray="6 4" vector-effect="non-scaling-stroke"></path></svg>' +
      '<span style="position:absolute;left:0;top:100%;width:10px;height:10px;margin:-5px 0 0 -5px;background:#FAFBFC;border:1.5px solid #697478;box-sizing:border-box"></span>' +
      '<span style="position:absolute;left:' + pX(a.s) + ';top:' + pY(a.l) + ';width:10px;height:10px;margin:-5px 0 0 -5px;background:#0E1518"></span>' +
      '<span style="position:absolute;left:' + pX(b.s) + ';top:' + pY(b.l) + ';width:10px;height:10px;margin:-5px 0 0 -5px;background:#0E7490"></span>' +
      '<span style="position:absolute;left:' + pX(a.s) + ';top:' + pY(a.l) + ';margin:10px 0 0 8px;font:400 11px/1.3 \'IBM Plex Mono\',monospace;color:#0E1518;white-space:nowrap">' + R.roi.toFixed(2) + 'x avg</span>' +
      '<span style="position:absolute;left:' + pX((a.s + b.s) / 2) + ';top:' + pY((a.l + b.l) / 2) + ';transform:translate(-100%,-100%);margin:-4px 0 0 -6px;font:400 11px/1.3 \'IBM Plex Mono\',monospace;color:#0E7490;white-space:nowrap">' + marg.toFixed(2) + 'x on the extra ' + k(R.spend) + '</span>' +
      '</div><div></div>' +
      '<div style="position:relative;height:12px;' + mono + '"><span style="position:absolute;left:0">$0</span><span style="position:absolute;left:' + pX(a.s) + ';transform:translateX(-50%)">' + k(a.s) + '</span><span style="position:absolute;left:' + pX(b.s) + ';transform:translateX(-50%)">' + k(b.s) + '</span></div></div>';
  }

  /* ---------------- rendering ---------------- */
  var mounts = {};
  function render(ids) {
    if (!S.d) return;
    var v = vals();
    (ids || Object.keys(window.REGIONS).concat(["budget"])).forEach(function (id) {
      var el = mounts[id] || (mounts[id] = document.querySelector('[data-region="' + id + '"]'));
      if (!el) return;
      var fns = [], h = function (fn) { fns.push(fn); return fns.length - 1; };
      el.innerHTML = id === "budget" ? budgetHtml(S.d) : window.REGIONS[id](v, h);
      ["click", "mouseenter", "mouseleave"].forEach(function (ev) {
        el.querySelectorAll("[data-on-" + ev + "]").forEach(function (n) {
          n.addEventListener(ev, function (e) { var f = fns[+n.getAttribute("data-on-" + ev)]; if (typeof f === "function") f(e); });
        });
      });
      fill(el);
    });
    var roi = document.getElementById("hero-roi");
    if (roi) roi.textContent = v.heroRoiFmt;
  }

  function get(o, path) { return path.split(".").reduce(function (x, k) { return x == null ? x : x[k]; }, o); }
  function fill(root) {
    root.querySelectorAll("[data-k]").forEach(function (n) {
      var val = get(S.d, n.getAttribute("data-k"));
      if (val != null) n.textContent = val;
    });
  }

  function startHero() {
    cancelAnimationFrame(raf);
    var n = S.d.readout.cumulative.length;
    if (reduceMotion) { S.day = n; render(["hero"]); return; }
    var t0 = performance.now(), dur = 6500;
    S.day = 1; render(["hero"]);
    var step = function (now) {
      var p = Math.min(1, (now - t0) / dur), day = Math.max(1, Math.round((1 - Math.pow(1 - p, 2)) * n));
      if (day !== S.day) { S.day = day; render(["hero"]); }
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
  }

  /* ---------------- form ---------------- */
  function form() {
    var f = document.getElementById("check-form"), msg = document.getElementById("form-msg"), low = document.getElementById("low-volume");
    if (!f) return;
    f.addEventListener("change", function (e) {
      if (e.target.name === "orders_per_day" && low) low.hidden = e.target.value !== "Under 100";
    });
    f.addEventListener("submit", function (e) {
      e.preventDefault();
      var btn = f.querySelector('button[type="submit"]');
      if (!f.checkValidity()) {
        msg.style.color = "#B45309"; msg.textContent = "Please fill in name, work email, brand, revenue, and orders per day."; return;
      }
      var data = {}; new FormData(f).forEach(function (val, key) { data[key] = val; });
      if (data.website) return;
      btn.disabled = true; btn.textContent = "Sending…"; msg.textContent = "";
      fetch("/api/leads", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) })
        .then(function (r) { if (!r.ok) throw new Error(r.status); f.reset(); if (low) low.hidden = true;
          msg.style.color = "#0E7490"; msg.textContent = "Thanks. You'll hear back within two business days."; })
        .catch(function () { msg.style.color = "#B45309"; msg.textContent = "That didn't go through. Email tom@wildlightmedia.com instead."; })
        .finally(function () { btn.disabled = false; btn.textContent = "Check my fit"; });
    });
  }

  /* ---------------- boot ---------------- */
  form();
  var lastW = window.innerWidth, rt;
  window.addEventListener("resize", function () {
    if (window.innerWidth === lastW) return;
    lastW = S.vw = window.innerWidth;
    clearTimeout(rt); rt = setTimeout(function () { render(["design"]); }, 120);
  });
  fetch("assets/demo.json").then(function (r) { return r.json(); }).then(function (d) {
    S.d = d; S.day = d.readout.cumulative.length;
    fill(document.body);
    render();
    startHero();
  });
})();
