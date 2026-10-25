<!--
    TrueGlide Configurator - Copyright (C) 2026 TalkTrueFPV. Derived from Betaflight App.
    Free software under the GPL-3.0 license, WITHOUT ANY WARRANTY; see the LICENSE file.
-->
<template>
    <BaseTab tab-name="studio">
        <div class="content_wrapper studio-tab">
            <div class="studio-barre">
                <p class="studio-note">{{ $t("tfStudioIntro") }}</p>
                <button
                    v-if="connected"
                    type="button"
                    class="regular-button"
                    :disabled="!ready || reading"
                    @click="readBoard"
                >
                    {{ reading ? $t("tfStudioReading") : $t("tfStudioReadBoard") }}
                </button>
            </div>
            <p v-if="status" class="studio-etat">{{ status }}</p>
            <iframe ref="frame" class="studio-frame" :src="STUDIO_TAB_URL" :title="$t('tabStudio')"></iframe>
        </div>
    </BaseTab>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import BaseTab from "./BaseTab.vue";
import { i18n } from "@/js/localization";
import { useConnectionStore } from "@/stores/connection";
import { isMspCliSupported, readDumpAll } from "@/composables/useMspCliSession";
import {
    STUDIO_TAB_ORIGIN,
    STUDIO_TAB_URL,
    configurationMessage,
    isUsableDiff,
    readStudioMessage,
} from "@/js/trueglide/studio_tab.js";

const frame = ref(null);
const ready = ref(false);
const reading = ref(false);
const status = ref("");
const connectionStore = useConnectionStore();
const connected = computed(() => Boolean(connectionStore.connectionValid) && isMspCliSupported());

function onMessage(event) {
    if (frame.value && event.source === frame.value.contentWindow && readStudioMessage(event) === "ready") {
        ready.value = true;
    }
}

async function readBoard() {
    reading.value = true;
    status.value = "";
    try {
        const lines = await readDumpAll();
        if (!isUsableDiff(lines)) {
            throw new Error(i18n.getMessage("tfStudioReadEmpty"));
        }
        frame.value.contentWindow.postMessage(configurationMessage(lines), STUDIO_TAB_ORIGIN);
        status.value = i18n.getMessage("tfStudioReadDone", [lines.length]);
    } catch (error) {
        status.value = `${i18n.getMessage("tfStudioReadFailed")} ${error?.message ?? error}`;
    } finally {
        reading.value = false;
    }
}

onMounted(() => window.addEventListener("message", onMessage));
onBeforeUnmount(() => window.removeEventListener("message", onMessage));
</script>

<style scoped>
.studio-tab {
    display: flex;
    flex-direction: column;
    height: 100%;
}
.studio-barre {
    display: flex;
    align-items: center;
    gap: 12px;
    margin: 0 0 8px;
}
.studio-note {
    flex: 1;
    margin: 0;
    font-size: 13px;
    opacity: 0.8;
}
.studio-etat {
    margin: 0 0 8px;
    font-size: 13px;
}
.studio-frame {
    flex: 1;
    width: 100%;
    min-height: 600px;
    height: calc(100vh - 190px);
    border: 0;
    border-radius: 8px;
}
</style>
