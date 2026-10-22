// Captures des onglets du logiciel pour la documentation (Playwright).
// Usage : [THEMES=dark|light] node captures.cjs <url du logiciel> <dossier de sortie> [slug ...]
// Le logiciel doit pouvoir joindre le simulateur TRUEGLIDE (SITL) par ws://localhost:5800.
// Pour chaque page de pages.json : fenêtre de 1440 px de large, onglet entier, <slug>.png (sombre) et <slug>-clair.png.
//   mode "hors"    : logiciel non connecté
//   mode "sitl"    : connecté au simulateur TRUEGLIDE
//   mode "virtuel" : mode virtuel du logiciel (onglets que le simulateur n'a pas : OSD, émetteur vidéo, LED, servos)
const { chromium } = require("playwright-core");
const fs = require("fs");
const path = require("path");

const [url, out, ...only] = process.argv.slice(2);
const pages = JSON.parse(fs.readFileSync(path.join(__dirname, "pages.json"), "utf8"))
    .groupes.flatMap((g) => g.pages)
    .filter((p) => p.onglet && (!only.length || only.includes(p.slug)));
fs.mkdirSync(out, { recursive: true });
const W = 1440;
const H = 900;

async function dismiss(p) {
    for (let i = 0; i < 3; i++) {
        const ok = p
            .locator("[role=dialog] button, [role=alertdialog] button")
            .filter({ hasText: /^\s*(OK|Fermer|J'ai compris|Compris)\s*$/i })
            .first();
        if (await ok.isVisible().catch(() => false)) {
            await ok.click().catch(() => {});
            await p.waitForTimeout(500);
        } else {
            break;
        }
    }
}

// whole tab: grow the window to the tallest scrolling area, then capture
async function shot(p, file) {
    await p.waitForTimeout(500);
    const h = await p.evaluate(() => {
        let m = document.documentElement.scrollHeight;
        for (const e of document.querySelectorAll("main, main *, #content, #content *")) {
            const cs = getComputedStyle(e);
            if (e.scrollHeight > e.clientHeight + 5 && /(auto|scroll)/.test(cs.overflowY)) {
                m = Math.max(m, e.scrollHeight + e.getBoundingClientRect().top + 40);
            }
        }
        return Math.min(Math.ceil(m), 9000);
    });
    if (h > H) {
        await p.setViewportSize({ width: W, height: h });
        await p.waitForTimeout(800);
    }
    await p.screenshot({ path: file });
    await p.setViewportSize({ width: W, height: H });
}

async function openTab(p, label) {
    const re = new RegExp(`^\\s*${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`);
    await p.locator("nav a, nav button, aside a, aside button").filter({ hasText: re }).first().click({ timeout: 8000 });
    await p.waitForTimeout(4000);
    await dismiss(p);
}

async function session(browser, scheme, mode, list) {
    if (!list.length) {
        return;
    }
    const settings = { expertMode: true, darkTheme: 2 };
    if (mode === "sitl") {
        Object.assign(settings, {
            showManualMode: true,
            showVirtualMode: false,
            automaticDevOptions: false,
            portOverride: "ws://localhost:5800",
        });
    }
    if (mode === "virtuel") {
        Object.assign(settings, { showVirtualMode: true, showManualMode: false, automaticDevOptions: false });
    }
    const ctx = await browser.newContext({ viewport: { width: W, height: H }, locale: "fr-FR", colorScheme: scheme });
    await ctx.addInitScript((s) => {
        for (const [k, v] of Object.entries(s)) {
            localStorage.setItem(k, JSON.stringify({ [k]: v }));
        }
    }, settings);
    const p = await ctx.newPage();
    p.on("pageerror", (e) => console.log("erreur de page", e.message));
    await p.goto(url, { waitUntil: "networkidle" });
    await p.waitForTimeout(2500);
    await dismiss(p);
    if (mode !== "hors") {
        // the automatic port choice sometimes misses at start-up: reload until the connected menu appears
        const connected = p.locator("nav a, nav button, aside a, aside button").filter({ hasText: /^\s*Ports\s*$/ });
        for (let attempt = 1; attempt <= 4 && !(await connected.isVisible().catch(() => false)); attempt++) {
            if (attempt > 1) {
                await p.reload({ waitUntil: "networkidle" });
                await p.waitForTimeout(2500 * attempt);
                await dismiss(p);
            }
            await p.locator(".tg-connect__round").nth(1).click();
            await p.waitForTimeout(9000);
            await dismiss(p);
        }
        // the guided setup banner is hidden so the captures show the tab itself
        const hide = p.getByRole("button", { name: "Masquer le guide" });
        if (await hide.isVisible().catch(() => false)) {
            await hide.click();
            await p.waitForTimeout(500);
        }
    }
    for (const page of list) {
        try {
            await openTab(p, page.menu);
            const file = path.join(out, scheme === "dark" ? `${page.slug}.png` : `${page.slug}-clair.png`);
            await shot(p, file);
            console.log(scheme, mode, page.slug, "ok");
        } catch (e) {
            console.log(scheme, mode, page.slug, "ÉCHEC", e.message.split("\n")[0]);
        }
    }
    await ctx.close();
    // the simulator takes one connection at a time
    await new Promise((r) => setTimeout(r, 2500));
}

(async () => {
    const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
    const schemes = (process.env.THEMES || "dark,light").split(",");
    for (const scheme of schemes) {
        for (const mode of ["hors", "sitl", "virtuel"]) {
            await session(
                browser,
                scheme,
                mode,
                pages.filter((p) => p.mode === mode),
            );
        }
    }
    await browser.close();
})();
