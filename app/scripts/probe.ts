import { chromium } from "playwright";

const URL = process.argv[2] ?? "http://localhost:5173/";

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 1280, height: 800 },
});
const page = await ctx.newPage();

const errors: string[] = [];
const consoleLogs: string[] = [];
const failed: string[] = [];

page.on("pageerror", (e) => errors.push(`PAGEERROR: ${e.message}`));
page.on("console", (msg) =>
  consoleLogs.push(`${msg.type().toUpperCase()}: ${msg.text()}`),
);
page.on("requestfailed", (r) =>
  failed.push(`${r.failure()?.errorText} ${r.url()}`),
);

await page.goto(URL, { waitUntil: "networkidle", timeout: 20000 });
await page.waitForTimeout(3000);

const map = await page.evaluate(() => {
  const c = document.querySelector(".maplibregl-canvas");
  const map = document.querySelector(".maplibregl-map");
  const container = document.querySelector("main > div.absolute.inset-0");
  const inner = container?.firstElementChild;
  return {
    hasCanvas: !!c,
    hasMap: !!map,
    canvasSize: c
      ? { w: (c as HTMLCanvasElement).width, h: (c as HTMLCanvasElement).height }
      : null,
    mapSize: map
      ? {
          w: (map as HTMLElement).offsetWidth,
          h: (map as HTMLElement).offsetHeight,
        }
      : null,
    containerSize: container
      ? {
          w: (container as HTMLElement).offsetWidth,
          h: (container as HTMLElement).offsetHeight,
        }
      : null,
    innerSize:
      inner && inner instanceof HTMLElement
        ? { w: inner.offsetWidth, h: inner.offsetHeight }
        : null,
    bodyHeight: document.body.offsetHeight,
    bodyWidth: document.body.offsetWidth,
    htmlClasses: document.documentElement.className,
    mainHTML: document.querySelector("main")?.outerHTML.slice(0, 500),
  };
});

await page.screenshot({ path: "/tmp/probe.png", fullPage: false });

await browser.close();

console.log("=== console ===");
for (const l of consoleLogs) console.log(l);
console.log("=== pageerrors ===");
for (const e of errors) console.log(e);
console.log("=== request failed ===");
for (const f of failed) console.log(f);
console.log("=== dom ===");
console.log(JSON.stringify(map, null, 2));
console.log("screenshot saved: /tmp/probe.png");
