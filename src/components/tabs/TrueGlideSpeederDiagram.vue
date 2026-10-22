<!--
    TrueGlide Configurator - Copyright (C) 2026 TalkTrueFPV. Derived from Betaflight App.
    Free software under the GPL-3.0 license, WITHOUT ANY WARRANTY; see the LICENSE file.
-->
<template>
    <div class="speeder-diagram">
        <svg :viewBox="`0 0 ${W} ${H}`" role="img" :aria-label="$t('tfSpeederCruise', { angle: angle })">
            <!-- left: hover, fuselage vertical -->
            <g class="guide">
                <line :x1="HOVER_X" :y1="PIVOT_Y - 150" :x2="HOVER_X" :y2="PIVOT_Y + 150" />
                <line :x1="CRUISE_X" :y1="PIVOT_Y - 150" :x2="CRUISE_X" :y2="PIVOT_Y + 150" />
                <line :x1="CRUISE_X - 170" :y1="PIVOT_Y" :x2="CRUISE_X + 186" :y2="PIVOT_Y" />
            </g>
            <text class="label" :x="HOVER_X + 6" :y="PIVOT_Y - 140">{{ $t("tfSpeederVertical") }}</text>
            <text class="label" text-anchor="end" :x="CRUISE_X - 6" :y="PIVOT_Y - 140">
                {{ $t("tfSpeederVertical") }}
            </text>
            <text class="label" text-anchor="end" :x="CRUISE_X + 186" :y="PIVOT_Y - 6">
                {{ $t("tfSpeederHorizontal") }}
            </text>

            <image :href="sideView" :x="HOVER_X - IMG_W / 2" :y="PIVOT_Y - IMG_H / 2" :width="IMG_W" :height="IMG_H" />

            <!-- right: cruise, fuselage tilted forward by the cruise angle around the model centre -->
            <image
                :href="sideView"
                :x="CRUISE_X - IMG_W / 2"
                :y="PIVOT_Y - IMG_H / 2"
                :width="IMG_W"
                :height="IMG_H"
                :transform="`rotate(${angle} ${CRUISE_X} ${PIVOT_Y})`"
            />
            <path class="arc" :d="arcPath" />
            <text class="angle" :x="arcLabel.x" :y="arcLabel.y">A = {{ angle }}°</text>

            <text class="label" text-anchor="end" :x="CRUISE_X + 186" :y="H - 12">
                {{ $t("tfSpeederFlightDirection") }} ▶
            </text>
        </svg>
        <div class="captions">
            <span>{{ $t("tfSpeederHover") }}</span>
            <span>{{ $t("tfSpeederCruise", { angle: angle }) }}</span>
        </div>
    </div>
</template>

<script setup>
import { computed } from "vue";
import sideView from "@/images/trueglide/speeder_v2v_cote.png";

// Side view rendered from the V2V 3" model: nose up, image centre = model centre (rotation pivot).
const props = defineProps({
    angle: { type: Number, required: true },
});

const W = 660;
const H = 380;
const PIVOT_Y = 180;
const HOVER_X = 160;
const CRUISE_X = 470;
const IMG_H = 230;
const IMG_W = (IMG_H * 734) / 773;
const ARC_R = 135;

const angle = computed(() => props.angle);

const arcEnd = computed(() => {
    const a = (props.angle * Math.PI) / 180;
    return { x: CRUISE_X + ARC_R * Math.sin(a), y: PIVOT_Y - ARC_R * Math.cos(a) };
});

const arcPath = computed(
    () => `M ${CRUISE_X} ${PIVOT_Y - ARC_R} A ${ARC_R} ${ARC_R} 0 0 1 ${arcEnd.value.x} ${arcEnd.value.y}`,
);

// label just outside the middle of the arc
const arcLabel = computed(() => {
    const a = (props.angle * Math.PI) / 360;
    return { x: CRUISE_X + (ARC_R + 14) * Math.sin(a), y: PIVOT_Y - (ARC_R + 14) * Math.cos(a) };
});
</script>

<style scoped>
.speeder-diagram svg {
    width: 100%;
    height: auto;
    display: block;
}
.guide line {
    stroke: var(--ui-text-muted);
    stroke-width: 1;
    stroke-dasharray: 4 4;
    opacity: 0.7;
}
.label {
    fill: var(--ui-text-muted);
    font-size: 12px;
}
.arc {
    fill: none;
    stroke: var(--ui-primary);
    stroke-width: 2.5;
}
.angle {
    fill: var(--ui-primary);
    font-size: 16px;
    font-weight: 700;
}
.captions {
    display: grid;
    grid-template-columns: 1fr 1fr;
    text-align: center;
    font-size: 0.8rem;
    color: var(--ui-text-muted);
}
</style>
