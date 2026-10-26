<!--
    TrueGlide Configurator - Copyright (C) 2026 TalkTrueFPV. Derived from Betaflight App.
    Free software under the GPL-3.0 license, WITHOUT ANY WARRANTY; see the LICENSE file.
    TrueGlide : bandeau de la carte hors ligne, visible dans tous les onglets (récolte en cours, récolte finie,
    connecté à la carte hors ligne).
-->
<template>
    <div v-if="state.running" class="tf-offline-bar tf-offline-bar--busy">
        <strong>{{ msg("tfOfflineHarvesting", [state.step, state.total, $t(state.tab || "tabDashboard")]) }}</strong>
        <span>{{ $t("tfOfflineHarvestWait") }}</span>
    </div>
    <div v-else-if="state.preparing" class="tf-offline-bar tf-offline-bar--busy">
        <strong>{{ $t("tfOfflinePreparing") }}</strong>
    </div>
    <div v-else-if="offline" class="tf-offline-bar tf-offline-bar--offline">
        <strong>{{ msg("tfOfflineConnected", [board?.carte?.nom || "?", date]) }}</strong>
        <span>{{ msg("tfOfflineWrites", [writes]) }}</span>
        <span v-if="simulated">{{ $t("tfOfflineSimulated") }}</span>
        <span v-else-if="board?.simulee?.erreur">{{
            msg("tfOfflineSimulatedUnavailable", [board.simulee.erreur])
        }}</span>
        <span v-if="notReread">{{ msg("tfOfflineNotReread", [notReread]) }}</span>
    </div>
    <div v-else-if="state.sending" class="tf-offline-bar tf-offline-bar--busy">
        <strong>{{ $t("tfOfflineSending") }}</strong>
    </div>
    <div v-else-if="state.sent" class="tf-offline-bar" :class="{ 'tf-offline-bar--busy': !state.sentOk }">
        <span>{{ state.sent }}</span>
        <UButton size="xs" color="neutral" variant="soft" @click="state.sent = ''">{{ $t("close") }}</UButton>
    </div>
    <div v-else-if="state.done || state.error" class="tf-offline-bar">
        <span v-if="state.done">{{ msg("tfOfflineHarvested", [state.done]) }}</span>
        <span v-else>{{ $t("tfOfflineHarvestFailed") }} {{ state.error }}</span>
        <UButton size="xs" color="neutral" variant="soft" @click="close">{{ $t("close") }}</UButton>
    </div>
    <div v-if="state.running || state.sending || state.preparing" class="tf-offline-shield"></div>
</template>

<script setup>
import { computed } from "vue";
import { i18n } from "@/js/localization";
import { useConnectionStore } from "@/stores/connection";
import { OFFLINE_PATH } from "@/js/protocols/OfflineBoardSerial.js";
import { loadBoard } from "@/js/trueglide/offline/store.js";
import { offlineState as state } from "@/js/trueglide/offline/harvest_state.js";

// textes avec $1, $2… ; Vue échappe déjà le texte affiché : pas de second échappement (dates « 25/10/2026 »)
const msg = (key, args = []) =>
    i18n.getMessage(key, {
        ...Object.fromEntries(args.map((v, i) => [i + 1, v])),
        interpolation: { escapeValue: false },
    });
const connectionStore = useConnectionStore();
const offline = computed(() => connectionStore.connectedTo === OFFLINE_PATH);
const board = computed(() => {
    state.version; // dependency
    return loadBoard();
});
const date = computed(() => (board.value?.date ? new Date(board.value.date).toLocaleString() : "?"));
// carte simulée : commandes tirées des « dump all » ; sinon, écritures gardées par la carte hors ligne
const simulated = computed(() => Boolean(board.value?.simulee?.eeprom));
const writes = computed(
    () => (simulated.value ? board.value.simulee.commandes?.length : board.value?.writes?.length) ?? 0,
);
const notReread = computed(() => board.value?.notReread?.length ?? 0);

function close() {
    state.done = "";
    state.error = "";
}
</script>

<style scoped>
.tf-offline-bar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px 14px;
    margin: 0 16px 8px;
    padding: 8px 12px;
    border-radius: 8px;
    border-left: 4px solid var(--ui-primary);
    background: var(--surface-200, rgba(127, 127, 127, 0.12));
    font-size: 13px;
}
.tf-offline-bar--busy {
    border-left-color: var(--warning-500, #e3b341);
    position: relative;
    z-index: 51;
}
.tf-offline-bar--offline {
    border-left-color: var(--warning-500, #e3b341);
}
/* pendant la récolte, le logiciel change d'onglet tout seul : pas de clic qui l'interromprait */
.tf-offline-shield {
    position: fixed;
    inset: 0;
    z-index: 50;
    background: rgba(0, 0, 0, 0.08);
    cursor: progress;
}
</style>
