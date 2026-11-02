// TrueGlide Configurator - Copyright (C) 2026 TalkTrueFPV. Derived from Betaflight App.
// Free software under the GPL-3.0 license, WITHOUT ANY WARRANTY; see the LICENSE file.
// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
    MAX_BOARDS,
    addBoard,
    boardLabel,
    findBoardIndex,
    listBoards,
    loadBoard,
    placeFor,
    removeBoard,
    saveBoard,
    setActiveBoard,
} from "../../src/js/trueglide/offline/store.js";

function memory() {
    const m = new Map();
    return {
        getItem: (k) => (m.has(k) ? m.get(k) : null),
        setItem: (k, v) => m.set(k, String(v)),
        removeItem: (k) => m.delete(k),
    };
}
const rec = (uid, drone, extra = {}) => ({
    format: "trueglide-carte",
    version: 1,
    date: "2026-11-02T10:00:00.000Z",
    carte: { nom: "SPEEDYBEEF405MINI", uid, drone },
    msp: {},
    writes: [],
    ...extra,
});

describe("Cartes hors ligne : jusqu'à 3 dans le navigateur", () => {
    it("garde 3 cartes, la dernière ajoutée devient active", () => {
        const s = memory();
        expect(MAX_BOARDS).toBe(3);
        addBoard(rec("a", "KarRmen"), s);
        addBoard(rec("b", "Mini Pouce"), s);
        addBoard(rec("c", "Black Hornet"), s);
        expect(listBoards(s).map((b) => b.rec.carte.drone)).toEqual(["KarRmen", "Mini Pouce", "Black Hornet"]);
        expect(loadBoard(s).carte.drone).toBe("Black Hornet");
    });

    it("une nouvelle récolte du même drone remplace sa carte (changements préparés compris)", () => {
        const s = memory();
        addBoard(rec("a", "KarRmen", { writes: [{ code: 1, payload: "00" }] }), s);
        addBoard(rec("b", "Mini Pouce"), s);
        expect(placeFor("a", s)).toBe(0);
        addBoard(rec("a", "KarRmen"), s);
        expect(listBoards(s)).toHaveLength(2);
        expect(listBoards(s)[0].rec.writes).toEqual([]);
        expect(loadBoard(s).carte.uid).toBe("a");
    });

    it("refuse une 4e carte, et accepte après une suppression", () => {
        const s = memory();
        ["a", "b", "c"].forEach((u) => addBoard(rec(u, u), s));
        expect(placeFor("d", s)).toBe(-1);
        expect(() => addBoard(rec("d", "d"), s)).toThrow(/3 cartes/);
        removeBoard(1, s);
        expect(addBoard(rec("d", "d"), s)).toBe(1);
        expect(listBoards(s).map((b) => b.rec.carte.uid)).toEqual(["a", "d", "c"]);
    });

    it("la carte active reçoit les écritures ; les autres ne changent pas", () => {
        const s = memory();
        addBoard(rec("a", "KarRmen"), s);
        addBoard(rec("b", "Mini Pouce"), s);
        setActiveBoard(0, s);
        const active = loadBoard(s);
        active.writes.push({ code: 2, payload: "01" });
        saveBoard(active, s);
        expect(listBoards(s)[0].rec.writes).toHaveLength(1);
        expect(listBoards(s)[1].rec.writes).toHaveLength(0);
        expect(findBoardIndex("b", s)).toBe(1);
        expect(findBoardIndex("zz", s)).toBe(-1);
    });

    it("reprend l'ancienne carte unique gardée avant cette version", () => {
        const s = memory();
        s.setItem("trueglide-carte-hors-ligne", JSON.stringify(rec("a", "KarRmen")));
        expect(loadBoard(s).carte.uid).toBe("a");
        addBoard(rec("b", "Mini Pouce"), s);
        expect(listBoards(s)).toHaveLength(2);
        expect(s.getItem("trueglide-carte-hors-ligne")).toBe(null);
    });

    it("nom affiché : nom du drone puis carte ; sinon le nom lu dans la récolte", () => {
        expect(boardLabel(rec("a", "KarRmen"))).toBe("KarRmen (SPEEDYBEEF405MINI)");
        // MSP2_GET_TEXT type 2 : « 02, longueur, texte »
        const old = rec("a", undefined, { msp: { "12294:02": "02074b6172526d656e" } });
        expect(boardLabel(old)).toBe("KarRmen (SPEEDYBEEF405MINI)");
        expect(boardLabel(rec("a", ""))).toBe("SPEEDYBEEF405MINI");
    });
});
