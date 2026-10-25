<!--
    TrueGlide Configurator - Copyright (C) 2026 TalkTrueFPV. Derived from Betaflight App.
    Free software under the GPL-3.0 license, WITHOUT ANY WARRANTY; see the LICENSE file.
    TrueGlide : préparer la carte hors ligne, depuis le tableau de bord (récolte, fichier carte).
-->
<template>
    <UiBox :title="$t('tfOfflineTitle')">
        <p v-if="offline" class="text-sm">{{ msg("tfOfflineConnected", [board?.carte?.nom || "?", date]) }}</p>
        <p v-else class="text-sm">{{ $t("tfOfflineHarvestHelp") }}</p>
        <div class="flex flex-wrap gap-2 mt-3">
            <UButton v-if="!offline" :disabled="state.running" size="sm" @click="start">
                {{ $t("tfOfflineHarvest") }}
            </UButton>
            <UButton v-if="board" color="neutral" variant="soft" size="sm" @click="download">
                {{ $t("tfOfflineDownload") }}
            </UButton>
        </div>
    </UiBox>
</template>

<script setup>
import { computed } from "vue";
import { i18n } from "@/js/localization";
import UiBox from "@/components/elements/UiBox.vue";
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

async function start() {
    const { harvest } = await import("@/js/trueglide/offline/harvest.js");
    await harvest();
}

function download() {
    const b = board.value;
    if (!b) {
        return;
    }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(b, null, 1)], { type: "application/json" }));
    a.download = `${b.carte?.nom || "carte"}_${(b.date || "").slice(0, 10)}.trueglide-carte.json`;
    a.click();
    URL.revokeObjectURL(a.href);
}
</script>
