// Rendu du site : pas de défilement horizontal à 390 px de large, dans les deux thèmes, et aucune image cassée.
// Usage : node verifier_rendu.cjs <url du site, ex. http://localhost:8790/>
const { chromium } = require("playwright-core");
const fs = require("fs");
const path = require("path");

const base = process.argv[2];
const site = path.resolve(__dirname, "..");
const pages = ["index.html", ...fs.readdirSync(path.join(site, "docs")).filter((f) => f.endsWith(".html")).map((f) => `docs/${f}`)];

(async () => {
    const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
    let problems = 0;
    for (const scheme of ["light", "dark"]) {
        for (const width of [390, 1440]) {
            const ctx = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: scheme });
            const p = await ctx.newPage();
            for (const page of pages) {
                await p.goto(base + page, { waitUntil: "load" });
                const r = await p.evaluate(() => ({
                    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
                    broken: [...document.images].filter((i) => i.complete && i.naturalWidth === 0 && getComputedStyle(i).display !== "none").map((i) => i.getAttribute("src")),
                }));
                if (r.overflow > 0 || r.broken.length) {
                    problems++;
                    console.log(scheme, width, page, r.overflow > 0 ? `défilement horizontal ${r.overflow}px` : "", r.broken.join(" "));
                }
            }
            await ctx.close();
        }
    }
    console.log(`${pages.length} pages, ${problems} problème(s)`);
    await browser.close();
    process.exit(problems ? 1 : 0);
})();
