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
                    v-if="connected && !offline"
                    type="button"
                    class="regular-button"
                    :disabled="!ready || busy"
                    @click="readBoard"
                >
                    {{ reading ? $t("tfStudioReading") : $t("tfStudioReadBoard") }}
                </button>
            </div>
            <p v-if="status" class="studio-etat">{{ status }}</p>
            <iframe ref="frame" class="studio-frame" :src="url" :title="$t('tabStudio')"></iframe>
        </div>
    </BaseTab>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import BaseTab from "./BaseTab.vue";
import { i18n } from "@/js/localization";
import { gui_log } from "@/js/gui_log";
import { useConnectionStore } from "@/stores/connection";
import { isMspCliSupported, readDumpAll, saveAndReconnect, send } from "@/composables/useMspCliSession";
import { OFFLINE_PATH } from "@/js/protocols/OfflineBoardSerial.js";
import FC from "@/js/fc";
import {
    cliRefused,
    commandsToSend,
    configurationMessage,
    isUsableDiff,
    readStudioMessage,
    resultMessage,
    stateMessage,
    studioOrigin,
    studioTabUrl,
} from "@/js/trueglide/studio_tab.js";

const url = studioTabUrl();
const origin = studioOrigin();
const frame = ref(null);
const ready = ref(false);
const reading = ref(false);
const sending = ref(false);
const busy = computed(() => reading.value || sending.value);
const status = ref("");
const connectionStore = useConnectionStore();
const connected = computed(() => Boolean(connectionStore.connectionValid) && isMspCliSupported());
const offline = computed(() => connectionStore.connectedTo === OFFLINE_PATH);

function post(message) {
    frame.value?.contentWindow?.postMessage(message, origin);
}

function postState() {
    post(stateMessage({ connected: connected.value, offline: offline.value, board: FC.CONFIG?.boardName }));
}

async function onMessage(event) {
    if (!frame.value || event.source !== frame.value.contentWindow) {
        return;
    }
    const m = readStudioMessage(event, origin);
    if (m?.event === "ready") {
        ready.value = true;
        postState();
    } else if (m?.command === "envoyer") {
        await sendCommands(m.id, m.texte);
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
        post(configurationMessage(lines));
        status.value = i18n.getMessage("tfStudioReadDone", [lines.length]);
    } catch (error) {
        status.value = `${i18n.getMessage("tfStudioReadFailed")} ${error?.message ?? error}`;
    } finally {
        reading.value = false;
    }
}

// Envoi d'un bloc de commandes de Studio : seulement vers une vraie carte branchée, après confirmation.
async function sendCommands(id, texte) {
    const commands = commandsToSend(texte);
    if (!connected.value || offline.value || busy.value) {
        post(resultMessage(id, false, i18n.getMessage("tfStudioSendNoBoard")));
        return;
    }
    if (!commands.length || !globalThis.confirm(i18n.getMessage("tfStudioSendConfirm", [commands.length]))) {
        post(resultMessage(id, false, i18n.getMessage("tfStudioSendCancelled")));
        return;
    }
    sending.value = true;
    try {
        for (const command of commands) {
            let refused;
            try {
                refused = cliRefused(await send(command));
            } catch (error) {
                refused = String(error?.message ?? error);
            }
            if (refused) {
                // résultat d'abord : au redémarrage, le logiciel quitte l'onglet Studio
                const text = i18n.getMessage("tfStudioSendRefused", [command, refused]);
                post(resultMessage(id, false, text));
                gui_log(text);
                // rien n'est enregistré : la carte redémarre sans sauvegarder
                const { reinitializeConnection } = await import("@/js/serial_backend.js");
                reinitializeConnection();
                return;
            }
        }
        const text = i18n.getMessage("tfStudioSendDone", [commands.length]);
        post(resultMessage(id, true, text));
        gui_log(text);
        const saved = await saveAndReconnect();
        if (!saved.ok) {
            gui_log(`${i18n.getMessage("tfStudioReadFailed")} ${saved.error?.message ?? saved.error}`);
        }
    } finally {
        sending.value = false;
    }
}

watch([connected, offline], postState);
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
