/* Картинки для ВК и ОК, нарисованные кодом (SVG -> Chromium). Higgsfield не используется.
   Запуск: NODE_PATH=/opt/node-tools/node_modules node tools/release-art.js
   Кладёт в release/vk/: icons/icon-576.png (и 278, 150, 75), favicon-32.png,
   snippet-1120x630.png, catalog-banner-1120x630 нет (сниппет и есть обложка). */
"use strict";
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");
const OUT = path.resolve(__dirname, "..", "release", "vk");
fs.mkdirSync(path.join(OUT, "icons"), { recursive: true });

// Детерминированные "звёзды"
function rnd(seed) { let s = seed; return () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296; }
function stars(w, h, n, seed, rMax, avoid) {
  const r = rnd(seed); let out = "";
  for (let i = 0; i < n; i++) {
    const x = r() * w, y = r() * h, s = 0.5 + r() * rMax, o = 0.35 + r() * 0.65;
    if (avoid && avoid(x, y)) continue;
    out += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${s.toFixed(2)}" fill="#fff6d8" opacity="${o.toFixed(2)}"/>`;
  }
  return out;
}
const MOON = (cx, cy, r) => `
  <circle cx="${cx}" cy="${cy}" r="${r * 2.3}" fill="url(#glow)"/>
  <mask id="cut"><rect x="${cx - r * 3}" y="${cy - r * 3}" width="${r * 6}" height="${r * 6}" fill="#fff"/>
    <circle cx="${cx + r * 0.55}" cy="${cy - r * 0.25}" r="${r * 0.85}" fill="#000"/></mask>
  <circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#gold)" mask="url(#cut)"/>`;
const DEFS = `<defs>
  <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0a1230"/><stop offset=".55" stop-color="#142257"/><stop offset="1" stop-color="#2a1f5e"/></linearGradient>
  <radialGradient id="glow"><stop offset="0" stop-color="#ffe7a8" stop-opacity=".2"/><stop offset="1" stop-color="#ffe7a8" stop-opacity="0"/></radialGradient>
  <linearGradient id="gold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffe3a0"/><stop offset="1" stop-color="#f1bd5c"/></linearGradient></defs>`;

function iconSvg(n) {
  const s = n / 576;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${n}" height="${n}" viewBox="0 0 576 576">${DEFS}
  <rect width="576" height="576" fill="url(#sky)"/>
  ${stars(576, 576, 46, 7, 2.4, (x, y) => Math.hypot(x - 288, y - 270) < 190)}
  ${MOON(288, 270, 150)}
  <path d="M410 120l9 24 24 9-24 9-9 24-9-24-24-9 24-9z" fill="#ffe7a8"/>
  <path d="M142 400l6 15 15 6-15 6-6 15-6-15-15-6 15-6z" fill="#ffe7a8" opacity=".85"/>
  <path d="M0 470 Q144 430 288 462 T576 450 V576 H0z" fill="#1b1a4d" opacity=".9"/>
  <path d="M0 505 Q150 470 300 500 T576 488 V576 H0z" fill="#241f5e"/>
  </svg>`;
}
function faviconSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">${DEFS}
  <rect width="32" height="32" rx="6" fill="#142257"/>
  <mask id="cut"><rect width="32" height="32" fill="#fff"/><circle cx="21" cy="12" r="9" fill="#000"/></mask>
  <circle cx="14.5" cy="16.5" r="10" fill="url(#gold)" mask="url(#cut)"/>
  <circle cx="24.5" cy="22.5" r="1.4" fill="#ffe7a8"/></svg>`;
}
function snippetSvg() {
  const W = 1120, H = 630;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${DEFS}
  <rect width="${W}" height="${H}" fill="url(#sky)"/>
  ${stars(W, H, 120, 11, 2.6, (x, y) => x < 640 && y > 130 && y < 500)}
  <g transform="translate(900 280)">${MOON(0, 0, 130)}</g>
  <path d="M1010 110l10 28 28 10-28 10-10 28-10-28-28-10 28-10z" fill="#ffe7a8"/>
  <path d="M640 120l7 18 18 7-18 7-7 18-7-18-18-7 18-7z" fill="#ffe7a8" opacity=".8"/>
  <text x="70" y="270" font-family="'DejaVu Serif', Georgia, serif" font-weight="700" font-size="128" fill="#ffd98c">Сонник</text>
  <text x="76" y="352" font-family="'DejaVu Sans', Arial, sans-serif" font-size="44" fill="#f5f2ea">Что означает ваш сон</text>
  <g font-family="'DejaVu Sans', Arial, sans-serif" font-size="30" fill="#cdd3ea">
    <text x="76" y="440">250 снов  ·  сон дня  ·  открытки</text></g>
  <rect x="76" y="480" width="400" height="62" rx="31" fill="url(#gold)"/>
  <text x="276" y="522" text-anchor="middle" font-family="'DejaVu Sans', Arial, sans-serif" font-weight="700" font-size="30" fill="#1a1532">Узнать толкование</text>
  <path d="M0 580 Q280 545 560 575 T1120 560 V630 H0z" fill="#1b1a4d" opacity=".9"/>
  </svg>`;
}

(async () => {
  const b = await chromium.launch();
  async function render(svg, w, h, file) {
    const p = await b.newPage({ viewport: { width: w, height: h } });
    await p.setContent(`<body style="margin:0;background:#000">${svg}</body>`);
    await p.screenshot({ path: path.join(OUT, file), omitBackground: false, clip: { x: 0, y: 0, width: w, height: h } });
    await p.close();
  }
  for (const n of [576, 278, 150, 75]) await render(iconSvg(n), n, n, `icons/icon-${n}.png`);
  await render(faviconSvg(), 32, 32, "favicon-32.png");
  await render(snippetSvg(), 1120, 630, "snippet-1120x630.png");
  await b.close();
  console.log("готово");
})();
