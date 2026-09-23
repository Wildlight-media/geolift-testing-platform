# Homepage build tools

The public homepage (`site/`) is ported from a Claude Design prototype (`Incrementality Test Site.dc.html`).

Regenerate after a design revision:

```bash
node convert.mjs "<path>/Incrementality Test Site.dc.html" .   # -> body.html, regions.js, hover.css
node build_page.mjs ../../site                                   # -> site/index.html, site/assets/site.css, site/assets/regions.js
```

- `convert.mjs` copies static markup verbatim, turns `style-hover` into CSS classes, and compiles the
  dynamic regions listed in `regions.json` (hero, gap, design panel, readout) into render functions.
  Line numbers in `regions.json` and the preprocessing step refer to the prototype body; update them if
  the prototype's structure changes (the scripts fail loudly if a marker is missing).
- `build_page.mjs` assembles the page, makes the budget chart and design record data-driven, and writes CSS.
- `build_map.mjs` pre-renders the US map and projects every DMA in `dma_ranks.txt`
  (`npm i d3-geo@3 topojson-client@3`; needs `states-albers-10m.json` from us-atlas and
  `nielsentopo.json` from github.com/simzou/nielsen-dma). Output: `site/assets/usmap.js`.
- Page logic lives in `site/assets/app.js`; all numbers come from `site/assets/demo.json`.
