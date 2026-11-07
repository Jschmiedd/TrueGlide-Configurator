import { describe, expect, it } from "vitest";
import { backupFileName, compareDiffs, looksLost, settingLines } from "../../src/js/trueglide/write_guard.js";

// Audit du 06/11/2026, constats 4 à 6 : sauvegarde, comparaison, configuration perdue.
const diff = (extra = []) => [
    "# diff all",
    "# version",
    "board_name SPEEDYBEEF405MINI",
    "batch start",
    "serial UART2 64 115200 57600 0 115200",
    "aux 0 0 0 1700 2100 0 0",
    "feature GPS",
    "set p_roll = 45",
    "set craft_name = Mini",
    "set motor_poles = 14",
    "set dshot_bidir = ON",
    "set vbat_min_cell_voltage = 340",
    "set gyro_lpf1_static_hz = 0",
    "set dyn_notch_count = 1",
    "set rpm_filter_q = 800",
    ...extra,
    "save",
];

describe("write_guard", () => {
    it("ignore commentaires et identité", () => {
        expect(settingLines(diff())).not.toContain("board_name SPEEDYBEEF405MINI");
        expect(settingLines(diff())).toContain("set p_roll = 45");
    });
    it("trouve les changements depuis la récolte", () => {
        const c = compareDiffs(diff(), diff(["set d_roll = 30"]));
        expect(c.added).toEqual(["set d_roll = 30"]);
        expect(c.missing).toEqual([]);
        expect(compareDiffs(diff(), diff())).toEqual({ missing: [], added: [] });
    });
    it("repère une carte revenue aux réglages d'usine", () => {
        expect(looksLost(diff(), diff())).toBe(false);
        expect(looksLost(diff(), ["# diff all", "board_name X", "set a = 1"])).toBe(true);
        expect(looksLost(diff(), ["###ERROR"])).toBe(true);
    });
    it("nomme le fichier de sauvegarde", () => {
        expect(backupFileName("Mini Pouce", new Date("2026-11-06T18:30:05Z"))).toBe(
            "Mini_Pouce_sauvegarde_avant_envoi_2026-11-06-18-30-05.txt",
        );
    });
});

import {
    keepBackup,
    keptBackups,
    MAX_KEPT_BACKUPS,
    riskyChanges,
    verificationMessage,
    verifySent,
} from "../../src/js/trueglide/write_guard.js";

const msg = (k, a = []) => `${k}(${a.join("|")})`;

describe("contre-audit N4 : changements à risque avec la valeur d'avant", () => {
    const backup = [
        "set failsafe_procedure = GPS-RESCUE",
        "resource MOTOR 1 B06",
        "aux 0 0 0 1700 2100 0 0",
        "mixer QUADX",
        "set p_roll = 45",
    ];
    it("trouve moteurs, mélangeur, failsafe, armement, orientation", () => {
        const r = riskyChanges(
            [
                "set failsafe_procedure = DROP",
                "resource MOTOR 1 B07",
                "aux 0 0 0 1300 1700 0 0",
                "mixer QUADX1234",
                "set yaw_motors_reversed = ON",
                "feature 3D",
                "set p_roll = 50",
                "set align_board_yaw = 90",
            ],
            backup,
        );
        expect(r.map((x) => x.command)).toEqual([
            "set failsafe_procedure = DROP",
            "resource MOTOR 1 B07",
            "aux 0 0 0 1300 1700 0 0",
            "mixer QUADX1234",
            "set yaw_motors_reversed = ON",
            "feature 3D",
            "set align_board_yaw = 90",
        ]);
        expect(r[0].before).toBe("set failsafe_procedure = GPS-RESCUE");
        expect(r[1].before).toBe("resource MOTOR 1 B06");
        expect(r[2].before).toBe("aux 0 0 0 1700 2100 0 0");
        expect(r[4].before).toBeNull();
    });
    it("rien à confirmer si la valeur ne change pas ou n'est pas à risque", () => {
        expect(riskyChanges(["set failsafe_procedure = GPS-RESCUE", "set p_roll = 60"], backup)).toEqual([]);
        // audit du 07/11/2026 (F5) : un port série changé (port du récepteur) est maintenant à risque
        expect(riskyChanges(["serial UART2 64 115200 57600 0 115200"], backup).length).toBe(1);
    });
});

describe("contre-audit (constat 6) : relecture réglage par réglage", () => {
    const get = (table) => async (c) => {
        const name = c.replace(/^get\s+/, "");
        return name in table ? [`${name} = ${table[name]}`] : ["###ERROR: get: unknown"];
    };
    it("signale une valeur différente de celle envoyée", async () => {
        const r = await verifySent(
            ["set p_roll = 50", "set small_angle = 30"],
            [],
            get({ p_roll: "50", small_angle: "180" }),
        );
        expect(r.checked).toBe(2);
        expect(r.mismatches).toEqual(["small_angle : envoyé 30, relu 180"]);
    });
    it("ne relit pas un réglage d'un autre profil, compte les lignes retrouvées dans le diff", async () => {
        const r = await verifySent(
            ["feature GPS", "profile 2", "set p_roll = 50", "serial UART3 2 115200 57600 0 115200"],
            ["feature GPS"],
            get({ p_roll: "50" }),
        );
        expect(r).toEqual({ checked: 1, mismatches: [], unchecked: 2 });
    });
    it("message : jamais « tout en place » sans relecture réelle", () => {
        expect(verificationMessage({ verified: true, checked: 0, mismatches: [], unchecked: 3 }, "f.txt", msg)).toBe(
            "tfVerifyNotRead(3|f.txt)",
        );
        expect(verificationMessage({ verified: true, checked: 0, mismatches: [], unchecked: 0 }, "f.txt", msg)).toBe(
            "tfVerifyNone()",
        );
        expect(
            verificationMessage({ verified: true, checked: 2, mismatches: ["x"], unchecked: 0 }, "f.txt", msg),
        ).toMatch(/^tfVerifyMismatch/);
        expect(verificationMessage({ verified: false }, "f.txt", msg)).toBe("tfOfflineSentNotVerified(f.txt)");
        expect(verificationMessage({ verified: true, lost: true }, "f.txt", msg)).toBe("tfOfflineSentLost(f.txt)");
        expect(verificationMessage({ verified: true, checked: 3, mismatches: [], unchecked: 0 }, "f.txt", msg)).toBe(
            "tfVerifyAllOk(3)",
        );
    });
});

describe("contre-audit (constat 4) : sauvegarde aussi gardée dans le navigateur", () => {
    it("garde les 10 dernières, la plus récente d'abord", () => {
        const store = new Map();
        const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
        for (let i = 0; i < 12; i++) {
            keepBackup(`f${i}.txt`, [`set a = ${i}`], storage);
        }
        const list = keptBackups(storage);
        expect(list).toHaveLength(MAX_KEPT_BACKUPS);
        expect(list[0].file).toBe("f11.txt");
        expect(list[0].lines).toEqual(["set a = 11"]);
    });
});

describe("contre-audit (mineur) : rxfail compte comme réglage à risque", () => {
    it("rxfail changé : question avec la ligne d'avant", () => {
        const r = riskyChanges(["rxfail 3 s 1500"], ["rxfail 3 h"]);
        expect(r).toEqual([{ command: "rxfail 3 s 1500", before: "rxfail 3 h" }]);
    });
});

import { runPendingVerification, savePendingVerification } from "../../src/js/trueglide/write_guard.js";

describe("relecture à la connexion suivante (Connexion automatique coupée)", () => {
    const memoire = () => {
        const m = new Map();
        return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k) };
    };
    const backup = Array.from({ length: 12 }, (_, i) => `set r${i} = ${i}`);
    it("relit seulement la même carte, une seule fois", async () => {
        const storage = memoire();
        savePendingVerification(
            { uid: "AAA", commands: ["set craft_name = AUDIT"], backupLines: backup, file: "f.txt" },
            storage,
        );
        const sendFn = async (c) => (c === "diff all" ? [...backup, "set craft_name = AUDIT"] : ["craft_name = AUDIT"]);
        expect(await runPendingVerification("BBB", { sendFn, storage })).toBeNull();
        const r = await runPendingVerification("AAA", { sendFn, storage });
        expect(r).toMatchObject({
            verified: true,
            lost: false,
            checked: 1,
            mismatches: [],
            unchecked: 0,
            file: "f.txt",
        });
        expect(await runPendingVerification("AAA", { sendFn, storage })).toBeNull();
    });
    it("signale un réglage pas en place et une carte revenue aux réglages d'usine", async () => {
        const storage = memoire();
        savePendingVerification(
            { uid: "AAA", commands: ["set craft_name = AUDIT"], backupLines: backup, file: "f.txt" },
            storage,
        );
        const r = await runPendingVerification("AAA", {
            sendFn: async (c) => (c === "diff all" ? backup : ["craft_name = Mini"]),
            storage,
        });
        expect(r.mismatches).toEqual(["craft_name : envoyé AUDIT, relu Mini"]);
        savePendingVerification(
            { uid: "AAA", commands: ["set craft_name = AUDIT"], backupLines: backup, file: "f.txt" },
            storage,
        );
        const r2 = await runPendingVerification("AAA", { sendFn: async () => ["# diff all", "board_name X"], storage });
        expect(r2.lost).toBe(true);
    });
});

describe("relecture : CLI muet juste après le redémarrage", () => {
    it("réessaie, puis compte « non relu », jamais « en place »", async () => {
        let n = 0;
        const getFn = async () => {
            n++;
            if (n < 3) {
                throw new Error("CLI pas prêt");
            }
            return ["craft_name = Mini Pouce"];
        };
        const r = await verifySent(["set craft_name = Mini Pouce"], [], getFn);
        expect(r).toEqual({ checked: 1, mismatches: [], unchecked: 0 });
        const r2 = await verifySent(["set craft_name = Mini Pouce"], [], async () => {
            throw new Error("muet");
        });
        expect(r2).toEqual({ checked: 0, mismatches: [], unchecked: 1 });
        expect(verificationMessage({ verified: true, ...r2 }, "f.txt", msg)).toBe("tfVerifyNotRead(1|f.txt)");
    }, 10000);
});
