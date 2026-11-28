// TrueGlide (audit du 06/11/2026, mineurs) : failsafe « Tombe » confirmé, power_guard_current bas confirmé,
// fonds Google seulement après accord, CSP du logiciel, polices du site hébergées sur le site.
import { describe, it, expect, beforeEach, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { dropNeedsConfirm } from "../../src/js/trueglide/failsafe_guard.js";
import { lowCurrentLimit, riskyChanges } from "../../src/js/trueglide/write_guard.js";
import { chooseLayer, defaultMapLayer, googleTilesAllowed } from "../../src/js/utils/map.js";

describe("failsafe Tombe (DROP)", () => {
    it("confirmation seulement quand DROP vient d'être choisi", () => {
        expect(dropNeedsConfirm(0, 1)).toBe(true);
        expect(dropNeedsConfirm(2, 1)).toBe(true);
        expect(dropNeedsConfirm(1, 1)).toBe(false);
        expect(dropNeedsConfirm(1, 0)).toBe(false);
        expect(dropNeedsConfirm(null, 0)).toBe(false);
    });
});

describe("power_guard_current bas", () => {
    it("1 à 9 A : confirmation ; 0 (arrêt) et 10 A et plus : non", () => {
        expect(lowCurrentLimit(["set power_guard_current = 2"])).toBe(2);
        expect(lowCurrentLimit(["set power_guard_current = 9"])).toBe(9);
        expect(lowCurrentLimit(["set power_guard_current = 0"])).toBe(null);
        expect(lowCurrentLimit(["set power_guard_current = 10"])).toBe(null);
        expect(lowCurrentLimit(["set power_guard_esc_temp = 2"])).toBe(null);
    });
    it("hors ligne et Studio : la valeur basse est un changement à risque", () => {
        const r = riskyChanges(["set power_guard_current = 2"], ["set power_guard_current = 60"]);
        expect(r.map((x) => x.command)).toEqual(["set power_guard_current = 2"]);
        expect(riskyChanges(["set power_guard_current = 40"], [])).toEqual([]);
    });
});

describe("fonds de carte Google", () => {
    beforeEach(() => localStorage.clear());
    it("sans accord : plan OpenStreetMap, aucune URL Google activée", () => {
        expect(googleTilesAllowed()).toBe(false);
        expect(defaultMapLayer("satellite")).toBe("street");
        const inst = { enableGoogle: vi.fn() };
        expect(chooseLayer("satellite", inst, () => false)).toBe("street");
        expect(inst.enableGoogle).not.toHaveBeenCalled();
        expect(googleTilesAllowed()).toBe(false);
    });
    it("avec accord : satellite, gardé pour ce navigateur", () => {
        const inst = { enableGoogle: vi.fn() };
        expect(chooseLayer("hybrid", inst, () => true)).toBe("hybrid");
        expect(inst.enableGoogle).toHaveBeenCalled();
        expect(googleTilesAllowed()).toBe(true);
        expect(defaultMapLayer("satellite")).toBe("satellite");
        const ask = vi.fn(() => false);
        expect(chooseLayer("satellite", { enableGoogle() {} }, ask)).toBe("satellite");
        expect(ask).not.toHaveBeenCalled();
    });
    it("plan : jamais de question", () => {
        const ask = vi.fn();
        expect(chooseLayer("street", {}, ask)).toBe("street");
        expect(ask).not.toHaveBeenCalled();
    });
    it("map.js : aucune URL Google écrite en dur dans une source créée sans accord", () => {
        const src = fs.readFileSync(path.resolve(__dirname, "../../src/js/utils/map.js"), "utf8");
        expect(src).toMatch(/url: googleOk \? GOOGLE_URLS\.satellite : undefined/);
        expect(src).toMatch(/url: googleOk \? GOOGLE_URLS\.hybrid : undefined/);
    });
});

describe("CSP et polices", () => {
    it("le logiciel déclare une CSP sans script extérieur", () => {
        const html = fs.readFileSync(path.resolve(__dirname, "../../src/index.html"), "utf8");
        const csp = html.match(/Content-Security-Policy" content="([^"]+)"/)[1];
        const script = csp.match(/script-src ([^;]+);/)[1];
        // seulement ce site ; 'unsafe-eval' : Vue compile le modèle de <app> au démarrage (page blanche sans lui)
        expect(script.split(/\s+/).sort()).toEqual(["'self'", "'unsafe-eval'", "'wasm-unsafe-eval'"]);
        expect(script).not.toMatch(/unsafe-inline|https?:|\*/);
        expect(csp).toMatch(/object-src 'none'/);
        expect(csp).toMatch(/base-uri 'self'/);
    });
    it("le site ne charge plus de police Google", () => {
        const dir = path.resolve(__dirname, "../../site");
        const pages = [];
        const walk = (d) =>
            fs.readdirSync(d, { withFileTypes: true }).forEach((e) => {
                const p = path.join(d, e.name);
                if (e.isDirectory()) walk(p);
                else if (p.endsWith(".html")) pages.push(p);
            });
        walk(dir);
        expect(pages.length).toBeGreaterThan(5);
        for (const p of pages) {
            expect(fs.readFileSync(p, "utf8")).not.toMatch(/fonts\.(googleapis|gstatic)\.com/);
        }
        expect(fs.existsSync(path.join(dir, "fonts/polices.css"))).toBe(true);
    });
});
