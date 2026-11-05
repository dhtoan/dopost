// Renders the annotated README tour images (English and Vietnamese) from the
// canonical product screenshots in assets/screenshots.
//
//   bun scripts/readme-tour/render.mjs
//
// Edit the callouts in screens.mjs, then run it again after the screenshots change.
//
// Callout boxes use the screenshot's 2000-pixel-wide coordinate space.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

import { languages, screens } from "./screens.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const screenshotDirectory = join(root, "assets/screenshots");
const outputDirectory = join(root, "assets/readme");
const CANVAS_WIDTH = 2000;
const OUTPUT_SCALE = 0.8;

function escapeHTML(value) {
  return value.replace(
    /[&<>"]/g,
    (character) => `&#${character.charCodeAt(0)};`,
  );
}

function pageHTML(screen, language, image) {
  const placed = [];
  const callouts = screen.callouts
    .map(({ box: [x, y, width, height] }, index) => {
      const badgeX = Math.max(4, x - 22);
      let badgeY = Math.max(4, y - 22);
      // A badge that lands on an earlier one moves to its box's bottom-left corner.
      if (
        placed.some(([px, py]) => Math.hypot(px - badgeX, py - badgeY) < 56)
      ) {
        badgeY = y + height - 22;
      }
      placed.push([badgeX, badgeY]);
      return `<div class="box" style="left:${x}px;top:${y}px;width:${width}px;height:${height}px"></div>
<div class="badge" style="left:${badgeX}px;top:${badgeY}px">${index + 1}</div>`;
    })
    .join("\n");
  const legend = screen.callouts
    .map(
      (callout, index) =>
        `<li><span class="number">${index + 1}</span><div><strong>${escapeHTML(
          callout[language].title,
        )}</strong><p>${escapeHTML(callout[language].text)}</p></div></li>`,
    )
    .join("\n");
  return `<!doctype html><html lang="${language}"><head><meta charset="utf-8"><style>
:root { --accent: #c2410c; --ink: #1c1917; --muted: #57534e; --paper: #faf8f5; --line: #e7e2db; }
* { box-sizing: border-box; margin: 0; }
body { width: ${CANVAS_WIDTH}px; background: var(--paper); color: var(--ink);
  font-family: "Segoe UI", "Noto Sans", "Helvetica Neue", Arial, sans-serif; }
header { padding: 48px 56px 32px; }
.eyebrow { color: var(--accent); font-size: 22px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
h1 { font-size: 46px; line-height: 1.15; margin-top: 10px; }
header p { color: var(--muted); font-size: 26px; line-height: 1.45; margin-top: 12px; max-width: 1600px; }
.shot { position: relative; margin: 0 56px; border: 1px solid var(--line); border-radius: 18px; overflow: hidden;
  box-shadow: 0 12px 40px rgb(28 25 23 / .08); }
.shot img { display: block; width: 100%; }
.frame { position: absolute; inset: 0; transform: scale(${(CANVAS_WIDTH - 112) / CANVAS_WIDTH}); transform-origin: 0 0; }
.box { position: absolute; border: 4px solid var(--accent); border-radius: 12px; background: rgb(194 65 12 / .06); }
.badge { position: absolute; width: 44px; height: 44px; border-radius: 50%; background: var(--accent); color: #fff;
  font-size: 24px; font-weight: 700; display: grid; place-items: center; box-shadow: 0 0 0 4px #fff; }
ol { list-style: none; padding: 40px 56px 56px; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 26px 48px; }
li { display: flex; gap: 18px; align-items: flex-start; }
.number { flex: none; width: 40px; height: 40px; border-radius: 50%; background: var(--accent); color: #fff;
  font-size: 22px; font-weight: 700; display: grid; place-items: center; margin-top: 2px; }
strong { font-size: 26px; }
li p { color: var(--muted); font-size: 23px; line-height: 1.45; margin-top: 4px; }
</style></head><body>
<header><div class="eyebrow">${escapeHTML(screen[language].eyebrow)}</div>
<h1>${escapeHTML(screen[language].title)}</h1><p>${escapeHTML(screen[language].summary)}</p></header>
<div class="shot"><img src="data:image/webp;base64,${image}" alt=""><div class="frame">${callouts}</div></div>
<ol>${legend}</ol></body></html>`;
}

// Set README_TOUR_BROWSER_CHANNEL=chrome to use an installed Chrome instead of Playwright's build.
const browser = await chromium.launch({
  channel: process.env.README_TOUR_BROWSER_CHANNEL,
});
try {
  const page = await browser.newPage({
    viewport: { width: CANVAS_WIDTH, height: 1000 },
    deviceScaleFactor: OUTPUT_SCALE,
  });
  for (const language of languages) {
    await mkdir(join(outputDirectory, language), { recursive: true });
    for (const screen of screens) {
      const image = (
        await readFile(join(screenshotDirectory, `${screen.source}-light.webp`))
      ).toString("base64");
      await page.setContent(pageHTML(screen, language, image), {
        waitUntil: "load",
      });
      const png = await page.screenshot({ fullPage: true, type: "png" });
      // Chromium encodes WebP; the PNG round-trips through a canvas to keep files small.
      const webp = await page.evaluate(async (data) => {
        const bitmap = await createImageBitmap(
          await (await fetch(`data:image/png;base64,${data}`)).blob(),
        );
        const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
        canvas.getContext("2d").drawImage(bitmap, 0, 0);
        const blob = await canvas.convertToBlob({
          type: "image/webp",
          quality: 0.86,
        });
        return [...new Uint8Array(await blob.arrayBuffer())];
      }, png.toString("base64"));
      const file = join(outputDirectory, language, `${screen.id}.webp`);
      await writeFile(file, Uint8Array.from(webp));
      console.log(`${file} (${Math.round(webp.length / 1024)} KB)`);
    }
  }
} finally {
  await browser.close();
}
