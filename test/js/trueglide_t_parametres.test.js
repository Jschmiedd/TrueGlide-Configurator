import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import i18next from "i18next";

// $t de i18next-vue ne convertit pas un tableau en $1, $2 (contrairement à i18n.getMessage) :
// $t("cle", [a, b]) afficherait la mauvaise valeur et « {{2}} ». Forme correcte : { 1: a, 2: b }.
function fichiersVue(dossier) {
    return fs.readdirSync(dossier, { withFileTypes: true }).flatMap((e) => {
        const p = path.join(dossier, e.name);
        if (e.isDirectory()) return fichiersVue(p);
        return e.name.endsWith(".vue") ? [p] : [];
    });
}

describe("$t dans les composants Vue", () => {
    it("n'utilise jamais un tableau de paramètres", () => {
        const fautifs = fichiersVue(path.resolve(__dirname, "../../src/components")).filter((f) =>
            /\$t\(\s*["'][\w.]+["']\s*,\s*\[/.test(fs.readFileSync(f, "utf8")),
        );
        expect(fautifs).toEqual([]);
    });

    it("la forme { 1, 2 } remplit bien $1 et $2", async () => {
        const inst = i18next.createInstance();
        await inst.init({ lng: "fr", resources: { fr: { translation: { k: "de {{1}} à {{2}}" } } } });
        expect(inst.t("k", { 1: 1000, 2: 1300 })).toBe("de 1000 à 1300");
        expect(inst.t("k", [1000, 1300])).not.toBe("de 1000 à 1300");
    });
});
