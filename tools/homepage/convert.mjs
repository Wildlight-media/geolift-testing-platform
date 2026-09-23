// Converts the Claude Design prototype (.dc.html) into the production static page.
//  - static markup is copied verbatim (inline styles preserved)
//  - style-hover="..." becomes a generated class with :hover rules in site.css
//  - dynamic regions (anything containing {{ }}, <sc-if>, <sc-for>) become JS render functions,
//    emitted to regions.js, with the region replaced by an empty mount <div data-region="rN">.
// Usage: node convert.mjs <prototype.dc.html> <outDir>
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [src, out] = process.argv.slice(2);
const raw = readFileSync(src, 'utf8');
let body = raw.slice(raw.indexOf('</helmet>') + 9, raw.indexOf('<script type="text/x-dc"'));
body = body.replace(/<\/?x-dc>/g, '').trim();


// ---- 0. line-preserving preprocessing of parts that are better static --------------------------
{
  const L = body.split('\n');
  const REV = ['Under $250K', '$250K–$1M', '$1M–$5M', '$5M+'], ORD = ['Under 100', '100–500', '500–2,000', '2,000+'];
  const opts = (name, list) => list.map((o) => '<label class="seg"><input type="radio" name="' + name + '" value="' + o + '" required>' + o + '</label>').join('');
  const set = (n, from, to) => { if (!L[n - 1].includes(from)) throw new Error('preprocess miss at ' + n + ': ' + from); L[n - 1] = L[n - 1].replace(from, to); };
  // nav: links become CSS-hidden below 900px instead of a JS conditional
  set(4, L[3].trim(), ''); set(12, '</sc-if>', '');
  set(5, '<div style=', '<div class="nav-links-wide" style=');
  // rhythm breaks are always on in production
  set(284, L[283].trim(), ''); set(291, '</sc-if>', ''); set(468, L[467].trim(), ''); set(479, '</sc-if>', '');
  // hero ROI is driven by the animation, not the data-k filler
  set(80, 'data-k="readout.roi_fmt" ', 'id="hero-roi" ');
  // form: static segmented radios, static note/button/status; JS only toggles and sets text
  set(606, ' onSubmit="{{ submitForm }}"', '');
  L[612] = opts('monthly_revenue', REV); L[616] = opts('orders_per_day', ORD);
  L[618] = L[618].replace(/<sc-if[^>]*>/, '').replace('</sc-if>', '').replace('<p style=', '<p id="low-volume" hidden style=');
  set(624, '{{ submitLabel }}', 'Check my fit');
  set(625, 'color:{{ formMsgColor }}">{{ formMsg }}', 'color:#0E7490">');
  body = L.join('\n');
}

// ---- 1. hover styles -> classes -------------------------------------------------------------
const hoverRules = new Map();
body = body.replace(/\sstyle-hover="([^"]*)"/g, (_, css) => {
  if (!hoverRules.has(css)) hoverRules.set(css, 'hv' + (hoverRules.size + 1));
  return ` data-hv="${hoverRules.get(css)}"`;
});
// merge data-hv into class attribute (elements here have no class attr in the prototype)
body = body.replace(/ data-hv="(hv\d+)"/g, ' class="$1"');
const hoverCss = [...hoverRules].map(([css, cls]) =>
  `.${cls}:hover{${css.split(';').filter(Boolean).map((d) => d.trim() + ' !important').join(';')}}`).join('\n');

// ---- 2. tokenize into a tree so sc-if/sc-for nest correctly -----------------------------------
function parse(html) {
  const root = { type: 'root', children: [] }, stack = [root];
  const re = /<(\/?)(sc-if|sc-for)\b([^>]*)>/g;
  let last = 0, m;
  while ((m = re.exec(html))) {
    if (m.index > last) stack.at(-1).children.push({ type: 'text', text: html.slice(last, m.index) });
    last = re.lastIndex;
    if (m[1]) { stack.pop(); continue; }
    const attrs = Object.fromEntries([...m[3].matchAll(/([\w-]+)="([^"]*)"/g)].map((a) => [a[1], a[2]]));
    const node = { type: m[2], attrs, children: [] };
    stack.at(-1).children.push(node); stack.push(node);
  }
  if (last < html.length) stack.at(-1).children.push({ type: 'text', text: html.slice(last) });
  return root;
}
const hole = (s) => s.replace(/^\{\{\s*|\s*\}\}$/g, '');

// ---- 3. compile a subtree to a JS template-literal expression ---------------------------------
// Scope: loop variables are referenced bare (m.name); everything else is v.name.
function expr(name, scope) {
  if (name === 'true' || name === 'false') return name;
  const head = name.split('.')[0];
  return scope.includes(head) ? name : 'v.' + name;
}
const EVENT_ATTR = /\s(on[A-Z]\w*)="\{\{\s*([\w.]+)\s*\}\}"/g;
const BOOL_ATTR = /\s(checked|selected|disabled)="\{\{\s*([\w.]+)\s*\}\}"/g;
function compileText(t, scope) {
  let s = t.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');
  s = s.replace(EVENT_ATTR, (_, ev, fn) => ` data-on-${ev.slice(2).toLowerCase()}="\${h(${expr(fn, scope)})}"`);
  s = s.replace(BOOL_ATTR, (_, a, x) => `\${${expr(x, scope)} ? ' ${a}' : ''}`);
  s = s.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, x) => `\${${expr(x, scope)}}`);
  return s;
}
function compile(node, scope) {
  return node.children.map((c) => {
    if (c.type === 'text') return compileText(c.text, scope);
    if (c.type === 'sc-if') return `\${${expr(hole(c.attrs.value), scope)} ? \`${compile(c, scope)}\` : ''}`;
    if (c.type === 'sc-for') {
      const as = c.attrs.as;
      return `\${(${expr(hole(c.attrs.list), scope)} || []).map((${as}) => \`${compile(c, [...scope, as])}\`).join('')}`;
    }
  }).join('');
}

// ---- 4. carve dynamic regions out of top-level static markup ----------------------------------
// A region is a maximal run of top-level lines that contain template syntax, expanded so the
// region starts and ends on balanced element boundaries (we pick explicit line ranges below).
const lines = body.split('\n');
const REGIONS = JSON.parse(readFileSync(join(out, 'regions.json'), 'utf8')); // [{id, start, end}] 1-based, inclusive, relative to body lines
const regionSrc = {};
for (const r of [...REGIONS].sort((a, b) => b.start - a.start)) {
  const chunk = lines.slice(r.start - 1, r.end).join('\n');
  regionSrc[r.id] = chunk;
  lines.splice(r.start - 1, r.end - r.start + 1, `<div data-region="${r.id}" style="display:contents"></div>`);
}
let staticHtml = lines.join('\n');
if (/\{\{|<sc-(if|for)/.test(staticHtml)) {
  const bad = staticHtml.split('\n').map((l, i) => [i + 1, l]).filter(([, l]) => /\{\{|<sc-/.test(l)).slice(0, 8);
  console.error('Template syntax left in static markup:\n' + bad.map(([i, l]) => i + ': ' + l.slice(0, 140)).join('\n'));
  process.exit(1);
}
const fns = Object.entries(regionSrc).map(([id, chunk]) =>
  `  ${id}: (v, h) => \`${compile(parse(chunk), [])}\``).join(',\n');
writeFileSync(join(out, 'regions.js'), `/* Generated by convert.mjs from the Claude Design prototype. Do not edit by hand;\n   change the prototype or convert.mjs and regenerate. */\nwindow.REGIONS = {\n${fns}\n};\n`);
writeFileSync(join(out, 'body.html'), staticHtml);
writeFileSync(join(out, 'hover.css'), hoverCss + '\n');
console.log('regions', Object.keys(regionSrc).join(','), '| hover rules', hoverRules.size, '| body lines', lines.length);
