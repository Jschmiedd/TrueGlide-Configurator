<!--
    TrueGlide Configurator - Copyright (C) 2026 TalkTrueFPV. Derived from Betaflight App.
    Free software under the GPL-3.0 license, WITHOUT ANY WARRANTY; see the LICENSE file.
    TrueGlide : préparer la carte hors ligne, depuis le tableau de bord (récolte, fichier carte).
-->
<template>
    <UiBox :title="$t('tfOfflineTitle')">
        <p v-if="offline" class="text-sm">{{ msg("tfOfflineConnected", [label, date]) }}</p>
        <p v-else class="text-sm">{{ $t("tfOfflineHarvestHelp") }}</p>
        <template v-if="!offline && writes">
            <p v-if="check.ok && portsProblem" class="text-sm mt-2 font-semibold text-(--error-700)">
                {{ msg("tfOfflinePortsRefused", [portsProblem]) }}
            </p>
            <p v-else-if="check.ok" class="text-sm mt-2 font-semibold">{{ msg("tfOfflinePending", [writes]) }}</p>
            <p v-else class="text-sm mt-2">
                {{
                    check.reason === "profil"
                        ? msg("tfOfflineOtherProfile", [writes, profileText])
                        : msg(check.reason === "carte" ? "tfOfflineOtherBoard" : "tfOfflineOtherFirmware", [
                              writes,
                              label,
                          ])
                }}
            </p>
        </template>
        <div class="flex flex-wrap gap-2 mt-3">
            <UButton
                v-if="!offline && writes && check.ok && !portsProblem"
                :disabled="state.sending || state.running"
                size="sm"
                color="warning"
                @click="sendNow"
            >
                {{ $t("tfOfflineSend") }}
            </UButton>
            <UButton v-if="!offline" :disabled="state.running || state.sending" size="sm" @click="start">
                {{ $t("tfOfflineHarvest") }}
            </UButton>
            <UButton v-if="board" color="neutral" variant="soft" size="sm" @click="download">
                {{ $t("tfOfflineDownload") }}
            </UButton>
        </div>
        <!-- TrueGlide: the offline boards kept in this browser (at most 3) -->
        <div v-if="boards.length" class="mt-3 text-sm">
            <p class="font-semibold">{{ msg("tfOfflineKept", [boards.length, MAX_BOARDS]) }}</p>
            <ul class="mt-1">
                <li v-for="b in boards" :key="b.index" class="flex flex-wrap items-center gap-2 py-0.5">
                    <span :class="{ 'font-semibold': b.index === boardIndex }">{{ boardLabel(b.rec) }}</span>
                    <span class="opacity-70">{{ msg("tfOfflineKeptLine", [dateOf(b.rec), pendingOf(b.rec)]) }}</span>
                    <UButton
                        size="xs"
                        color="error"
                        variant="soft"
                        :disabled="offline || state.running || state.sending"
                        @click="remove(b)"
                    >
                        {{ $t("tfOfflineRemove") }}
                    </UButton>
                </li>
            </ul>
        </div>
    </UiBox>
</template>

<script setup>
import { computed } from "vue";
import { i18n } from "@/js/localization";
import UiBox from "@/components/elements/UiBox.vue";
import { useConnectionStore } from "@/stores/connection";
import { OFFLINE_PATH } from "@/js/protocols/OfflineBoardSerial.js";
import {
    MAX_BOARDS,
    boardLabel,
    findBoardIndex,
    listBoards,
    placeFor,
    removeBoard,
} from "@/js/trueglide/offline/store.js";
import { boardChanged } from "@/js/trueglide/offline/harvest_state.js";
import { offlineState as state } from "@/js/trueglide/offline/harvest_state.js";
import { boardIdentity, sameBoard } from "@/js/trueglide/offline/identity.js";
import { describePrepared } from "@/js/trueglide/offline/describe.js";
import { recordingSerialProblem } from "@/js/trueglide/offline/serial_rules.js";
import MSPCodes from "@/js/msp/MSPCodes.js";
import FC from "@/js/fc";

// textes avec $1, $2… ; Vue échappe déjà le texte affiché : pas de second échappement (dates « 25/10/2026 »)
const msg = (key, args = []) =>
    i18n.getMessage(key, {
        ...Object.fromEntries(args.map((v, i) => [i + 1, v])),
        interpolation: { escapeValue: false },
    });
const connectionStore = useConnectionStore();
const offline = computed(() => connectionStore.connectedTo === OFFLINE_PATH);
const boards = computed(() => {
    state.version; // dependency
    return listBoards();
});
// carte branchée : sa propre carte hors ligne (même numéro unique) ; sinon (ou hors ligne) la carte active
const boardIndex = computed(() => {
    if (!offline.value) {
        const own = findBoardIndex(boardIdentity(FC.CONFIG).uid);
        if (own >= 0) {
            return own;
        }
    }
    return boards.value.find((b) => b.active)?.index ?? -1;
});
const board = computed(() => boards.value.find((b) => b.index === boardIndex.value)?.rec ?? null);
const label = computed(() => boardLabel(board.value));
const pendingOf = (rec) => rec?.simulee?.commandes?.length || (rec?.writes?.length ?? 0);
const dateOf = (rec) => (rec?.date ? new Date(rec.date).toLocaleString() : "?");
// carte simulée : commandes tirées des « dump all » ; sinon, écritures gardées par la carte hors ligne
const writes = computed(() => board.value?.simulee?.commandes?.length || (board.value?.writes?.length ?? 0));
const check = computed(() => (board.value ? sameBoard(board.value.carte, boardIdentity(FC.CONFIG)) : { ok: false }));
// ports que la vraie carte refuserait : pas d'envoi (la carte simulée fait tourner le vrai firmware, elle juge seule)
const portsProblem = computed(() =>
    board.value && !board.value.simulee?.commandes?.length ? recordingSerialProblem(board.value, MSPCodes) : null,
);
// profils au moment de la récolte (numérotés à partir de 1 comme dans le Configurator) ; « ? » si le fichier ne les a pas
const profileText = computed(() => {
    const c = board.value?.carte;
    const n = (v) => (Number.isInteger(v) ? v + 1 : "?");
    return `PID ${n(c?.profil)}, rates ${n(c?.profilRate)}`;
});
const date = computed(() => (board.value?.date ? new Date(board.value.date).toLocaleString() : "?"));

async function start() {
    // la récolte remplace la carte hors ligne de ce drone (même numéro unique), sinon prend une place libre
    const place = placeFor(boardIdentity(FC.CONFIG).uid);
    if (place < 0) {
        globalThis.alert(msg("tfOfflineFull", [MAX_BOARDS]));
        return;
    }
    const replaced = boards.value.find((b) => b.index === place)?.rec;
    const pending = pendingOf(replaced);
    // changements préparés pas encore envoyés : ils seraient perdus
    if (pending && !globalThis.confirm(msg("tfOfflineHarvestDiscard", [pending]))) {
        return;
    }
    const { harvest } = await import("@/js/trueglide/offline/harvest.js");
    await harvest();
}

// question avant l'envoi : le nombre, la liste de ce qui partira, et le profil de la vraie carte s'il change
function sendQuestion() {
    const d = describePrepared(board.value, MSPCodes);
    let text = msg("tfOfflineSendConfirm", [writes.value]);
    text += `\n\n${msg("tfOfflineSendList")}\n${d.lignes.join("\n")}`;
    if (d.reste) {
        text += `\n${msg("tfOfflineSendMore", [d.reste])}`;
    }
    if (d.profils) {
        const parts = [];
        if (d.profils.pid !== null) {
            parts.push(msg("tfOfflineSendProfilePid", [d.profils.pid]));
        }
        if (d.profils.rates !== null) {
            parts.push(msg("tfOfflineSendProfileRates", [d.profils.rates]));
        }
        text += `\n\n${msg("tfOfflineSendProfiles", [parts.join(", ")])}`;
    }
    return text;
}

async function sendNow() {
    if (!globalThis.confirm(sendQuestion())) {
        return;
    }
    state.sending = true;
    state.sent = "";
    const { sendPrepared } = await import("@/js/trueglide/offline/send.js");
    const r = await sendPrepared();
    state.sending = false;
    state.sentOk = r.ok;
    if (r.ok) {
        state.sent = msg("tfOfflineSent", [r.count]);
    } else if (r.reason === "refus") {
        state.sent = msg("tfOfflineSendRefused", [r.write?.cli ?? r.write?.code, r.reply]);
    } else {
        state.sent = `${msg("tfOfflineSendFailed")} ${r.reply ?? r.reason}`;
    }
    state.version++;
}

function remove(b) {
    const pending = pendingOf(b.rec);
    const text = pending ? msg("tfOfflineRemoveConfirmPending", [boardLabel(b.rec), pending]) : msg("tfOfflineRemoveConfirm", [boardLabel(b.rec)]);
    if (!globalThis.confirm(text)) {
        return;
    }
    removeBoard(b.index);
    boardChanged();
}

function download() {
    const b = board.value;
    if (!b) {
        return;
    }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(b, null, 1)], { type: "application/json" }));
    const name = (b.carte?.drone || b.carte?.nom || "carte").replace(/[^A-Za-z0-9_-]+/g, "_");
    a.download = `${name}_${(b.date || "").slice(0, 10)}.trueglide-carte.json`;
    a.click();
    URL.revokeObjectURL(a.href);
}
</script>
