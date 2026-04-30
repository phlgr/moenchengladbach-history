import { chromium } from "playwright";

const URL = process.argv[2] ?? "http://localhost:5173/";

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await ctx.newPage();

const errors: string[] = [];
page.on("pageerror", (e) => errors.push(`PAGEERROR: ${e.message}`));
page.on("requestfailed", (r) =>
  errors.push(`REQFAIL: ${r.failure()?.errorText} ${r.url()}`),
);

await page.goto(URL, { waitUntil: "networkidle", timeout: 20000 });
await page.waitForTimeout(2500);

// Zoom in past the cluster threshold, then click directly on a known feature
const result = await page.evaluate(async () => {
  const map = (window as any).__map;
  if (!map) return { err: "no map" };
  // jump to where NS-Orte cluster
  map.jumpTo({ center: [6.4429, 51.1639], zoom: 14 });
  await new Promise((r) => setTimeout(r, 1500));
  const layers = map
    .getStyle()
    .layers.filter((l: any) => l.id.endsWith("-points") && !l.id.includes("selected"))
    .map((l: any) => l.id);
  const feats = map.queryRenderedFeatures(undefined, { layers });
  if (!feats.length) return { err: "no features anywhere", zoom: map.getZoom() };
  // fire a click at the feature's pixel
  const f = feats[0];
  const lngLat = (f.geometry as any).coordinates;
  const px = map.project(lngLat);
  map.fire("click", {
    lngLat: { lng: lngLat[0], lat: lngLat[1] },
    point: px,
    originalEvent: new MouseEvent("click"),
    features: feats,
  });
  return { id: f.properties?.id, name: f.properties?.name };
});

await page.waitForTimeout(2500);

const sidebar = await page.evaluate(() => {
  const a = document.querySelector("aside");
  if (!a) return null;
  const rect = a.getBoundingClientRect();
  return {
    visible: rect.right <= window.innerWidth + 10 && rect.left < window.innerWidth,
    rect: { x: rect.x, y: rect.y, w: rect.width, h: rect.height },
    text: (a as HTMLElement).innerText.slice(0, 300),
    hasImg: !!a.querySelector("img"),
  };
});

await page.screenshot({ path: "/tmp/probe-popup.png" });
await browser.close();

console.log("result:", result);
console.log("errors:", errors);
console.log("sidebar:", sidebar);
