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
  // jump to a known stone area
  map.jumpTo({ center: [6.4312, 51.1962], zoom: 16 });
  await new Promise((r) => setTimeout(r, 1500));
  // query the entire viewport for points
  const feats = map.queryRenderedFeatures(undefined, {
    layers: ["stolpersteine-points"],
  });
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

const popup = await page.evaluate(() => {
  const p = document.querySelector(".maplibregl-popup");
  if (!p) return null;
  return {
    text: (p as HTMLElement).innerText.slice(0, 300),
    hasImg: !!p.querySelector("img"),
  };
});

await page.screenshot({ path: "/tmp/probe-popup.png" });
await browser.close();

console.log("result:", result);
console.log("errors:", errors);
console.log("popup:", popup);
