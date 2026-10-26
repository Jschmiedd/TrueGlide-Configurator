<!--
    TrueGlide Configurator - Copyright (C) 2026 TalkTrueFPV. Derived from Betaflight App.
    Free software under the GPL-3.0 license, WITHOUT ANY WARRANTY; see the LICENSE file.
-->
<template>
    <BaseTab tab-name="trueglide_tune">
        <div class="content_wrapper">
            <div class="tab_title">{{ $t("tabTrueGlideTune") }}</div>

            <div class="flex gap-2 mb-4">
                <UButton
                    :label="$t('tftuneTabDrone')"
                    :variant="page === 'drone' ? 'solid' : 'subtle'"
                    :color="page === 'drone' ? 'primary' : 'neutral'"
                    @click="page = 'drone'"
                />
                <UButton
                    :label="$t('tftuneTabAnalyse')"
                    :variant="page === 'analyse' ? 'solid' : 'subtle'"
                    :color="page === 'analyse' ? 'primary' : 'neutral'"
                    @click="page = 'analyse'"
                />
            </div>

            <!-- Caractéristiques du drone : communes aux deux pages -->
            <UiBox :title="$t('tftuneDroneTitle')" :help="$t('tftuneDroneHelp')" class="mb-4">
                <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <label v-for="f in champsNombres" :key="f.k" class="text-sm">
                        {{ $t(f.label) }}
                        <UInputNumber v-model="d[f.k]" :min="f.min" :max="f.max" :step="f.step" size="xs" class="w-full" />
                    </label>
                    <label class="text-sm"
                        >{{ $t("tftuneChassis") }}
                        <USelect v-model="d.chassis" :items="chassisListe" size="xs" class="w-full" />
                    </label>
                    <label class="text-sm"
                        >{{ $t("tftuneStyle") }}
                        <USelect v-model="d.style" :items="styles" size="xs" class="w-full" />
                    </label>
                    <label class="text-sm"
                        >{{ $t("tftuneFrame") }}
                        <USelect v-model="d.qualite" :items="qualites" size="xs" class="w-full" />
                    </label>
                    <label class="text-sm"
                        >{{ $t("tftunePwm") }}
                        <USelect v-model="d.pwmEsc" :items="pwms" size="xs" class="w-full" />
                    </label>
                    <label class="text-sm"
                        >{{ $t("tftuneEsc") }}
                        <USelect v-model="d.esc" :items="escs" size="xs" class="w-full" />
                    </label>
                    <label class="text-sm flex items-center gap-2 mt-5">
                        <USwitch v-model="d.capteurCourant" size="sm" /> {{ $t("tftuneCurrentSensor") }}
                    </label>
                    <p v-if="d.capteurCourant && courantCarte === 0" class="text-sm text-(--warning-700) md:col-span-2">
                        {{ $t("tftuneNoCurrentMeter") }}
                    </p>
                    <label class="text-sm flex items-center gap-2 mt-5">
                        <USwitch v-model="d.serieBranchee" size="sm" /> {{ $t("tftuneSerialWire") }}
                    </label>
                </div>
                <p class="text-sm mt-3">
                    {{ $t("tftuneProfiles", { pid: (FC.CONFIG?.profile ?? 0) + 1, rate: (FC.CONFIG?.rateProfile ?? 0) + 1 }) }}
                </p>
                <p class="text-sm mt-1">
                    {{ $t("tftuneBoard") }} <b>{{ carteNom || "?" }}</b>
                    <span v-if="carte"> — {{ carte.mcu }}, {{ (carte.g || []).join(", ") }}, {{ carte.m }} {{ $t("tftuneMotorOutputs") }}</span>
                    <span v-else class="text-warning-700"> — {{ $t("tftuneBoardUnknown") }}</span>
                </p>
            </UiBox>
            <UiBox type="warning" class="mb-4">
                <p class="text-sm">{{ $t("tfSafetyNotice") }}</p>
            </UiBox>

            <UiBox v-if="manquants.length" type="warning" highlight class="mb-4">
                <p class="text-sm">{{ $t("tftuneMissing") }} <code>{{ manquants.join(", ") }}</code></p>
                <div class="flex gap-2 mt-2">
                    <UButton :label="$t('tftuneApplyWithout')" :disabled="occupe" @click="appliquer(enAttente, true)" />
                    <UButton :label="$t('tftuneCancel')" color="neutral" variant="subtle" @click="manquants = []" />
                </div>
            </UiBox>

            <!-- Réglage du drone -->
            <template v-if="page === 'drone'">
                <UiBox v-if="erreur" type="error" highlight class="mb-4"
                    ><p class="text-sm">{{ erreur }}</p></UiBox
                >
                <template v-else-if="rec">
                    <UiBox :title="$t('tftuneResultTitle')" class="mb-4">
                        <div class="flex flex-wrap gap-6 mb-3 text-sm">
                            <div>
                                {{ $t("tftuneProtocol") }}<br /><b class="text-lg">{{ rec.protocole.protocole }}</b>
                            </div>
                            <div v-if="rec.protocole.boucle">
                                {{ $t("tftuneLoop") }}<br /><b class="text-lg">{{ rec.protocole.boucle / 1000 }} kHz</b>
                            </div>
                        </div>
                        <table class="w-full text-sm">
                            <thead>
                                <tr class="text-left">
                                    <th>{{ $t("tftuneAxis") }}</th>
                                    <th>P</th>
                                    <th>I</th>
                                    <th>D</th>
                                    <th>D max</th>
                                    <th>FF</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr v-for="a in axes" :key="a.k">
                                    <td>{{ $t(a.label) }}</td>
                                    <td>{{ rec.pids[a.k].P }}</td>
                                    <td>{{ rec.pids[a.k].I }}</td>
                                    <td>{{ rec.pids[a.k].D }}</td>
                                    <td>{{ rec.pids[a.k].Dmax }}</td>
                                    <td>{{ rec.pids[a.k].F }}</td>
                                </tr>
                            </tbody>
                        </table>
                        <div v-for="(m, i) in verifErreurs" :key="'e' + i" class="msg alerte">{{ m }}</div>
                        <div v-for="(m, i) in rec.avertissements" :key="'a' + i" class="msg conseil">{{ m }}</div>
                        <div v-for="(m, i) in rec.notes" :key="'n' + i" class="msg note">{{ m }}</div>
                    </UiBox>
                    <UiBox :title="$t('tftuneDetailTitle')" class="mb-4">
                        <table class="w-full text-sm">
                            <tbody>
                                <tr v-for="x in rec.reglages" :key="x.nom">
                                    <td><code>{{ x.nom }}</code></td>
                                    <td>{{ x.valeur }}</td>
                                    <td>{{ x.pourquoi }}</td>
                                </tr>
                            </tbody>
                        </table>
                    </UiBox>
                </template>
            </template>

            <!-- Analyse de la configuration de la carte -->
            <template v-else>
                <UiBox v-if="analyse.etat === 'lecture'" class="mb-4"
                    ><p class="text-sm">{{ $t("tftuneReading") }}</p></UiBox
                >
                <UiBox v-else-if="analyse.etat === 'erreur'" type="error" highlight class="mb-4"
                    ><p class="text-sm">{{ analyse.erreur }}</p></UiBox
                >
                <template v-else-if="analyse.etat === 'ok'">
                    <UiBox :title="`${analyse.cfg.carte || '?'} · ${analyse.cfg.version || '?'}`" class="mb-4">
                        <div v-for="(c, i) in analyse.controles" :key="i" :class="['msg', c.niveau]">{{ c.texte }}</div>
                    </UiBox>
                    <UiBox :title="`${$t('tftuneGapsTitle')} (${analyse.ecarts.length})`" class="mb-4">
                        <p v-if="!analyse.ecarts.length" class="text-sm">{{ $t("tftuneNoGap") }}</p>
                        <table v-else class="w-full text-sm">
                            <thead>
                                <tr class="text-left">
                                    <th>{{ $t("tftuneSetting") }}</th>
                                    <th>{{ $t("tftuneCurrent") }}</th>
                                    <th>{{ $t("tftuneProposed") }}</th>
                                    <th></th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr v-for="x in analyse.ecarts" :key="x.nom">
                                    <td><code>{{ x.nom }}</code></td>
                                    <td>{{ x.actuel }}</td>
                                    <td>{{ x.propose }}</td>
                                    <td>{{ x.pourquoi }}</td>
                                </tr>
                            </tbody>
                        </table>
                    </UiBox>
                </template>
            </template>
        </div>
        <div class="content_toolbar toolbar_fixed_bottom">
            <template v-if="page === 'drone'">
                <UButton
                    :label="$t('tftuneApply')"
                    :disabled="!rec || verifErreurs.length > 0 || occupe"
                    @click="appliquer(commandesReglage)"
                />
            </template>
            <template v-else>
                <UButton
                    :label="$t('tftuneReadBoard')"
                    color="neutral"
                    variant="subtle"
                    :disabled="occupe"
                    @click="analyser"
                />
                <UButton
                    :label="$t('tftuneApplyGaps')"
                    :disabled="analyse.etat !== 'ok' || !analyse.ecarts.length || occupe"
                    @click="appliquer(commandesEcarts)"
                />
            </template>
        </div>
    </BaseTab>
</template>

<script setup>
import { computed, onMounted, onUnmounted, reactive, ref, watch } from "vue";
import i18next from "i18next";
import BaseTab from "./BaseTab.vue";
import UiBox from "@/components/elements/UiBox.vue";
import FC from "@/js/fc";
import MSP from "@/js/msp";
import MSPCodes from "@/js/msp/MSPCodes";
import { gui_log } from "@/js/gui_log";
import { i18n } from "@/js/localization";
import { send, readDumpAll, saveAndReconnect, isMspCliSupported } from "@/composables/useMspCliSession";
import TFTune from "@/js/trueglide/studio/tune.js";
import TFAnalyse from "@/js/trueglide/studio/analyse.js";
import TF_SETTINGS from "@/js/trueglide/studio/settings_db.js";
import TF_CARTES from "@/js/trueglide/studio/cartes.js";

const page = ref("drone");

// Langue des explications calculées (modules de Studio) : celle de l'application, français ou anglais.
function langueApp() {
    return (i18n.getCurrentLocale() || "en").startsWith("fr") ? "fr" : "en";
}
const langue = ref(langueApp());
function appliquerLangue() {
    for (const m of [TFTune, TFAnalyse]) {
        m.langue?.(langue.value);
    }
}
appliquerLangue();
const surLangue = () => {
    langue.value = langueApp();
    appliquerLangue();
};
i18next.on("languageChanged", surLangue);
onUnmounted(() => i18next.off("languageChanged", surLangue));
const occupe = ref(false);

const DEFAUT = {
    pouces: 5, kv: 1900, cellules: 6, masse: 700, poles: 14, courantEsc: 0, chassis: "quadx",
    style: "freestyle", qualite: "normal", pwmEsc: 24, esc: "bluejay", capteurCourant: true, serieBranchee: false,
};
let memo = {};
try {
    memo = JSON.parse(localStorage.getItem("tf-drone") || "{}");
} catch {
    memo = {};
}
const d = reactive({ ...DEFAUT, ...memo });
watch(d, () => {
    try {
        localStorage.setItem("tf-drone", JSON.stringify(d));
    } catch {
        // stockage indisponible : le formulaire reste utilisable
    }
});

const champsNombres = [
    { k: "pouces", label: "tftuneProp", min: 1.2, max: 15, step: 0.1 },
    { k: "kv", label: "tftuneKv", min: 100, max: 30000, step: 10 },
    { k: "cellules", label: "tftuneCells", min: 1, max: 14, step: 1 },
    { k: "masse", label: "tftuneMass", min: 15, max: 20000, step: 1 },
    { k: "poles", label: "tftunePoles", min: 4, max: 64, step: 2 },
    { k: "courantEsc", label: "tftuneEscCurrent", min: 0, max: 250, step: 1 },
];
const chassisListe = computed(() => {
    void langue.value;
    return Object.keys(TFTune.CHASSIS).map((k) => ({ label: TFTune.CHASSIS[k].nom, value: k }));
});
const styles = computed(() => {
    void langue.value;
    return Object.keys(TFTune.STYLES).map((k) => ({ label: TFTune.STYLES[k].nom, value: k }));
});
const qualites = [
    { label: i18n.getMessage("tftuneFrameNormal"), value: "normal" },
    { label: i18n.getMessage("tftuneFrameSoft"), value: "bruyant" },
    { label: i18n.getMessage("tftuneFrameStiff"), value: "rigide" },
];
const pwms = [
    { label: "24 kHz", value: 24 },
    { label: "48 kHz +", value: 48 },
];
const escs = computed(() => {
    void langue.value;
    return Object.keys(TFTune.ESC).map((k) => ({ label: TFTune.ESC[k].nom, value: k }));
});
const axes = [
    { k: "roll", label: "tftuneRoll" },
    { k: "pitch", label: "tftunePitch" },
    { k: "yaw", label: "tftuneYaw" },
];

// La carte branchée est reconnue par son nom de configuration (board_name).
const carteNom = computed(() => (FC.CONFIG?.boardName || FC.CONFIG?.targetName || "").toUpperCase());
const carte = computed(() => TF_CARTES[carteNom.value] || null);

function entree() {
    return { ...d, carte: carte.value, speeder: { angle: null, vitesse: null, mix: false } };
}

const erreur = ref("");
const rec = computed(() => {
    void langue.value; // recalcul quand la langue change
    try {
        erreur.value = "";
        return TFTune.recommander(entree());
    } catch (e) {
        erreur.value = e.message;
        return null;
    }
});
const verifErreurs = computed(() => (rec.value ? TFTune.verifier(rec.value.reglages, TF_SETTINGS) : []));
const commandesReglage = computed(() =>
    rec.value ? TFTune.versCli(rec.value).split("\n").filter((l) => l.trim() && !l.startsWith("#") && l !== "save") : [],
);

const analyse = reactive({ etat: "", erreur: "", cfg: null, controles: [], ecarts: [] });
// « simplified_tuning apply » recalcule PID et filtres depuis les curseurs : seulement si un curseur change,
// pour ne pas écraser des PID réglés à la main quand l'écart ne porte que sur le protocole moteur par exemple.
const commandesEcarts = computed(() => {
    if (!analyse.ecarts.length) {
        return [];
    }
    const sets = analyse.ecarts.map((x) => `set ${x.nom} = ${x.propose}`);
    return analyse.ecarts.some((x) => x.nom.startsWith("simplified_")) ? [...sets, "simplified_tuning apply"] : sets;
});

async function analyser() {
    if (!isMspCliSupported()) {
        analyse.etat = "erreur";
        analyse.erreur = i18n.getMessage("tftuneNoCli");
        return;
    }
    analyse.etat = "lecture";
    occupe.value = true;
    try {
        const texte = (await readDumpAll()).join("\n");
        const cfg = TFAnalyse.lire(texte);
        analyse.cfg = cfg;
        analyse.controles = TFAnalyse.controler(cfg, TF_SETTINGS, entree(), TF_CARTES, cfg.firmware);
        analyse.ecarts = rec.value ? TFAnalyse.ecarts(cfg, TF_SETTINGS, rec.value.reglages) : [];
        analyse.etat = "ok";
    } catch (e) {
        analyse.etat = "erreur";
        analyse.erreur = String(e?.message ?? e);
    } finally {
        occupe.value = false;
    }
}

const manquants = ref([]);
const enAttente = ref([]);

function nomDe(commande) {
    const m = /^set\s+([a-z0-9_]+)\s*=/.exec(commande);
    return m ? m[1] : null;
}

// Réglages absents du firmware branché (ex. pas de DShot sur la carte ou dans le simulateur) : CLI « get <nom> ».
async function absents(commandes) {
    const out = [];
    for (const c of commandes) {
        const nom = nomDe(c);
        if (nom && !(await send(`get ${nom}`)).some((l) => l.startsWith(`${nom} =`))) {
            out.push(nom);
        }
    }
    return out;
}

async function appliquer(commandes, sansManquants = false) {
    if (!commandes.length) {
        return;
    }
    occupe.value = true;
    try {
        if (!sansManquants) {
            const a = await absents(commandes);
            if (a.length) {
                manquants.value = a;
                enAttente.value = commandes;
                occupe.value = false;
                return;
            }
        } else {
            commandes = commandes.filter((c) => !manquants.value.includes(nomDe(c)));
            manquants.value = [];
        }
        for (const c of commandes) {
            const reponse = await send(c);
            const faute = reponse.find((l) => l.startsWith("###ERROR") || /Invalid|out of range|Unknown/i.test(l));
            if (faute) {
                throw new Error(`${c} : ${faute}`);
            }
        }
    } catch (e) {
        gui_log(`${i18n.getMessage("tftuneApplyError")} ${e.message}`);
        occupe.value = false;
        return;
    }
    gui_log(i18n.getMessage("tftuneApplied"));
    occupe.value = false;
    await saveAndReconnect();
}

// Capteur de courant réglé sur la carte (onglet Alimentation) : 0 = aucun. Sans lui, power_guard_current n'agit pas.
const courantCarte = ref(null);
async function lireCapteurCourant() {
    try {
        await MSP.promise(MSPCodes.MSP_BATTERY_CONFIG);
        courantCarte.value = FC.BATTERY_CONFIG?.currentMeterSource ?? null;
        if (!("capteurCourant" in memo) && courantCarte.value !== null) {
            d.capteurCourant = courantCarte.value !== 0;
        }
    } catch {
        courantCarte.value = null;
    }
}

onMounted(() => {
    lireCapteurCourant();
    if (page.value === "analyse") {
        analyser();
    }
});
// Changement de langue : les contrôles déjà lus sont recalculés dans la nouvelle langue.
watch(langue, () => {
    if (analyse.etat === "ok" && analyse.cfg) {
        analyse.controles = TFAnalyse.controler(analyse.cfg, TF_SETTINGS, entree(), TF_CARTES, analyse.cfg.firmware);
        analyse.ecarts = rec.value ? TFAnalyse.ecarts(analyse.cfg, TF_SETTINGS, rec.value.reglages) : [];
    }
});
watch(page, (p) => {
    if (p === "analyse" && !analyse.etat) {
        analyser();
    }
});
</script>

<style scoped>
.msg {
    padding: 6px 10px;
    border-radius: 6px;
    margin: 6px 0;
    border-left: 4px solid;
    font-size: 0.875rem;
}
.msg.alerte {
    border-color: var(--error-500);
}
.msg.conseil {
    border-color: var(--warning-500);
}
.msg.ok {
    border-color: var(--success-500);
}
.msg.note {
    border-color: var(--primary-500);
}
th,
td {
    padding: 4px 6px;
    border-bottom: 1px solid var(--surface-400);
    vertical-align: top;
}
</style>
