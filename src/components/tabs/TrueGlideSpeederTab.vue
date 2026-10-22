<!--
    TrueGlide Configurator - Copyright (C) 2026 TalkTrueFPV. Derived from Betaflight App.
    Free software under the GPL-3.0 license, WITHOUT ANY WARRANTY; see the LICENSE file.
-->
<template>
    <TrueGlideTab tab-name="tf_speeder" title="tabTfSpeeder" :sections="['speeder']">
        <template #extra="{ edited }">
            <UiBox v-if="'speeder_cruise_angle' in edited" :title="$t('tfSpeederDiagramTitle')">
                <TrueGlideSpeederDiagram v-if="cruiseAngle(edited) !== null" :angle="cruiseAngle(edited)" />
                <p v-if="transitionTime(edited) !== null" class="text-sm font-semibold">
                    {{
                        $t("tfSpeederTransitionTime", {
                            angle: cruiseAngle(edited),
                            rate: edited.speeder_transition_rate,
                            time: transitionTime(edited),
                        })
                    }}
                </p>
                <ul class="text-sm list-disc ps-5 flex flex-col gap-1">
                    <li>{{ $t("tfSpeederExplainEngage") }}</li>
                    <li>{{ $t("tfSpeederExplainRelease") }}</li>
                    <li>{{ $t("tfSpeederExplainImmediate") }}</li>
                    <li>{{ $t("tfSpeederExplainFpvMix") }}</li>
                </ul>
                <p class="text-sm text-(--warning-700)">{{ $t("tfSpeederFirstFlight") }}</p>
            </UiBox>
        </template>
    </TrueGlideTab>
</template>

<script setup>
import TrueGlideTab from "./TrueGlideTab.vue";
import TrueGlideSpeederDiagram from "./TrueGlideSpeederDiagram.vue";
import UiBox from "@/components/elements/UiBox.vue";

// Firmware limits of speeder_cruise_angle: nothing is drawn for a value the firmware would refuse.
const MIN_ANGLE = 10;
const MAX_ANGLE = 80;

function cruiseAngle(edited) {
    const angle = Number(edited.speeder_cruise_angle);
    return Number.isInteger(angle) && angle >= MIN_ANGLE && angle <= MAX_ANGLE ? angle : null;
}

// Time from hover to cruise (and back) at speeder_transition_rate, the ramp speed of the firmware
function transitionTime(edited) {
    const angle = cruiseAngle(edited);
    const rate = Number(edited.speeder_transition_rate);
    if (angle === null || !Number.isFinite(rate) || rate <= 0) {
        return null;
    }
    return (angle / rate).toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}
</script>
