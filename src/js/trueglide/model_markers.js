/*
 * TrueGlide Configurator - Copyright (C) 2026 TalkTrueFPV. Derived from Betaflight App.
 * Free software under the GPL-3.0 license, WITHOUT ANY WARRANTY; see the LICENSE file.
 */

// Markers drawn over the 3D model of the Setup tab in the top view: motor numbers and the front of the craft.
// Coordinates are in the model's own units (resources/models/*.gltf, before the x15 scale of model.js).
// The model's nose points away from the user (-Z); +X is the right side; +Y is up.

// Tilt of the model wrapper for the top view (radians): the far side (nose) rises so the frame is seen from above.
export const TOP_VIEW_TILT = 0.55;

// Motor hubs of quad_x.gltf, measured on the model (centre of each motor bell, just above it).
// Numbering is Betaflight's Quad X: 1 rear right, 2 front right, 3 rear left, 4 front left.
const QUAD_X_MOTORS = [
    { motor: 1, position: [2.47, 0.95, 2.45] },
    { motor: 2, position: [2.85, 0.95, -1.61] },
    { motor: 3, position: [-2.47, 0.95, 2.45] },
    { motor: 4, position: [-2.85, 0.95, -1.61] },
];

// Keyed by mixer name, not by model file: Quad +, Quad X 1234 and Octo X8 reuse quad_x.gltf with another motor order,
// so they get no numbers rather than wrong ones.
const MOTORS_BY_MIXER = {
    "Quad X": QUAD_X_MOTORS,
};

/**
 * Motor markers for a mixer, or an empty list when its motor layout on the model is not known.
 * @param {string} mixerName name from mixerList in model.js (e.g. "Quad X")
 */
export function motorMarkers(mixerName) {
    return MOTORS_BY_MIXER[mixerName] ?? [];
}

/**
 * Point just beyond the nose of a model, from its bounding box in model units.
 * @param {{min: number[], max: number[]}} box
 */
export function frontMarker(box) {
    const length = box.max[2] - box.min[2];
    return [(box.min[0] + box.max[0]) / 2, box.max[1], box.min[2] - length * 0.02];
}
