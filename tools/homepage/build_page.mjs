// Assembles site/index.html + site/assets/site.css + site/assets/regions.js from the Claude Design
// prototype. Run from tools/homepage:
//   node convert.mjs "<path>/Incrementality Test Site.dc.html" .   (writes body.html, regions.js, hover.css)
//   node build_page.mjs ../../site
import { readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';

const site = process.argv[2];
let body = readFileSync('body.html', 'utf8');
const swap = (from, to) => { if (!body.includes(from)) throw new Error('build_page: not found: ' + from.slice(0, 80)); body = body.replace(from, to); };

// Budget-levels chart becomes a data-driven region (drawn by app.js from the sample readout).
const bStart = body.indexOf('<div style="display:grid;grid-template-columns:40px minmax(0,1fr);gap:6px">');
const bEnd = body.indexOf('<ul aria-label="Budget test design"');
if (bStart < 0 || bEnd < bStart) throw new Error('budget chart block not found');
body = body.slice(0, bStart) + '<div data-region="budget" style="display:contents"></div>\n' + body.slice(bEnd);

// Design record values come from demo.json.
const ddk = (text, key) => {
  const at = body.indexOf('>' + text + '</dd>');
  const open = body.lastIndexOf('<dd ', at);
  if (at < 0 || open < 0) throw new Error('design record entry not found: ' + text);
  body = body.slice(0, open) + '<dd data-k="' + key + '" ' + body.slice(open + 4, at) + '>—</dd>' + body.slice(at + text.length + 6);
};
ddk('Apr 2, 2026 · 4 days before launch', 'design.record.locked');
ddk('Revenue, test markets, 45 days + 14 post', 'design.record.metric');
ddk('10 test · 27 control, fixed', 'design.record.markets');

const head = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Incrementality Testing — Wildlight Media</title>
<meta name="description" content="Geo-lift incrementality testing from Wildlight Media. Find out what your ads actually caused, measured against markets that didn't see them.">
<meta property="og:title" content="Incrementality Testing — Wildlight Media">
<meta property="og:description" content="Platforms report the sales they touched. A geo-lift test measures the sales your spend actually caused.">
<meta property="og:type" content="website">
<meta property="og:url" content="https://incrementalitytest.com/">
<meta property="og:image" content="https://incrementalitytest.com/assets/og.png">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="assets/favicon.png">
<link rel="apple-touch-icon" href="assets/apple-touch-icon.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Archivo:ital,wght@0,300;0,400;0,500;0,600;1,400&family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@400;500;600&display=swap" rel="stylesheet">
<link rel="stylesheet" href="assets/site.css">
</head>
<body>
`;
const tail = `
<script src="assets/usmap.js" defer></script>
<script src="assets/regions.js" defer></script>
<script src="assets/app.js" defer></script>
</body>
</html>
`;
writeFileSync(join(site, 'index.html'), head + body.replace(/src="incrementalitytest\/wim-logo-white.png"/g, 'src="assets/wim-logo-white.png"') + tail);

const css = `/* incrementalitytest.com. Layout and type are inline in index.html (ported 1:1 from the Claude Design
   prototype); this file holds the base reset, hover states, and the few rules inline styles can't express. */
*{box-sizing:border-box}
html{scroll-behavior:smooth;scroll-padding-top:64px;-webkit-text-size-adjust:100%}
body{margin:0;background:#EFF2F3;color:#111A1E;font:400 16px/1.6 'IBM Plex Sans',system-ui,sans-serif;-webkit-font-smoothing:antialiased}
h1,h2,h3,p{margin:0;text-wrap:pretty}
a{color:#0E7490}
a:hover{color:#0B4A5E}
img{max-width:100%}
summary{list-style:none;cursor:pointer}
summary::-webkit-details-marker{display:none}
details[open] summary span:last-child{transform:rotate(45deg)}
:focus-visible{outline:1px solid #0E7490;outline-offset:2px}
[hidden]{display:none!important}
button:disabled{opacity:.6;cursor:progress}

/* nav: text links only on wide screens */
@media (max-width:899px){.nav-links-wide{display:none!important}}

/* form: segmented radio buttons (selected state via :has, radios stay focusable) */
.seg{position:relative;display:flex;align-items:center;justify-content:center;min-height:46px;padding:0 10px;border:1px solid rgba(14,21,24,.28);background:#FFFFFF;border-radius:2px;cursor:pointer;font:400 14px/1.2 'IBM Plex Sans',sans-serif;color:#0E1518;text-align:center}
.seg input{position:absolute;opacity:0;width:1px;height:1px;margin:0}
.seg:hover{border-color:#0E1518}
.seg:has(input:checked){background:#0E1518;border-color:#0E1518;color:#EFF2F3}
.seg:has(input:focus-visible){outline:1px solid #0E7490;outline-offset:2px}
input[type=text],input[type=email],textarea{outline:none}
input[type=text]:focus,input[type=email]:focus,textarea:focus{border-color:#0E7490!important}

/* hover states generated from the prototype's style-hover attributes */
${readFileSync('hover.css', 'utf8')}
@media (prefers-reduced-motion: reduce){html{scroll-behavior:auto}}
`;
writeFileSync(join(site, 'assets', 'site.css'), css);
copyFileSync('regions.js', join(site, 'assets', 'regions.js'));
console.log('built index.html', Math.round((head + body + tail).length / 1024) + 'KB');
