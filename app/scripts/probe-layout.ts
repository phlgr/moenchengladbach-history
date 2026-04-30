import { chromium } from "playwright";
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await ctx.newPage();
await page.goto("http://localhost:5173/", { waitUntil: "networkidle", timeout: 20000 });
await page.waitForTimeout(2500);
const m = await page.evaluate(() => {
  const headerCard = document.querySelector("header > div") as HTMLElement | null;
  const layerToggle = document.querySelector("aside, nav") as HTMLElement | null;
  // Find LayerToggle by content
  const buttons = Array.from(document.querySelectorAll("button"));
  const stolpButton = buttons.find(b => b.innerText.includes("STOLPERSTEINE"));
  const lt = stolpButton?.closest('[class*="akte-grain"]') as HTMLElement | null;
  return {
    header: headerCard ? headerCard.getBoundingClientRect() : null,
    toggle: lt ? lt.getBoundingClientRect() : null,
  };
});
await browser.close();
console.log(JSON.stringify(m, null, 2));
