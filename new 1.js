app.beginUndoGroup("Pyanoo Beat Carousel");

var comp = app.project.activeItem;

if (!(comp instanceof CompItem)) {
    alert("Open your composition first.");
    throw new Error("No composition selected.");
}

var layerName = "pyanoo.mp4";

// ─────────────────────────────────────────────
// SETTINGS
// ─────────────────────────────────────────────

var bpm = parseFloat(prompt("BPM:", "120"));

if (isNaN(bpm) || bpm <= 0) {
    alert("Invalid BPM.");
    throw new Error("Invalid BPM.");
}

var beatLength = 60 / bpm;

// Percentage of each beat used for movement.
// 0.20 = movement lasts 20% of the beat.
var movePercent = 0.20;

var moveLength = beatLength * movePercent;

// ─────────────────────────────────────────────
// FIND THE 3 VIDEOS
// ─────────────────────────────────────────────

var vids = [];

for (var i = 1; i <= comp.numLayers; i++) {
    var layer = comp.layer(i);

    if (layer.name == layerName) {
        vids.push(layer);
    }
}

if (vids.length != 3) {
    alert(
        "Expected exactly 3 layers named:\n\n" +
        layerName +
        "\n\nFound: " + vids.length
    );
    throw new Error("Wrong number of layers.");
}

// ─────────────────────────────────────────────
// CURRENT POSITIONS = CAROUSEL SLOTS
// ─────────────────────────────────────────────

var slots = [
    vids[0].position.value,
    vids[1].position.value,
    vids[2].position.value
];

// Remove existing position keyframes
for (var i = 0; i < 3; i++) {

    var pos = vids[i].position;

    while (pos.numKeys > 0) {
        pos.removeKey(1);
    }

    pos.setValueAtTime(
        comp.displayStartTime,
        slots[i]
    );
}

// ─────────────────────────────────────────────
// INITIAL SLOT ASSIGNMENTS
// ─────────────────────────────────────────────

var state = [0, 1, 2];

var t = comp.displayStartTime + beatLength;

// ─────────────────────────────────────────────
// BEAT LOOP
// ─────────────────────────────────────────────

while (t < comp.duration) {

    // Rotate:
    // 0 → 1
    // 1 → 2
    // 2 → 0

    state = [
        state[2],
        state[0],
        state[1]
    ];

    var startTime = t;
    var endTime = t + moveLength;

    for (var i = 0; i < 3; i++) {

        var pos = vids[i].position;

        // Current position at the beat
        var from = pos.valueAtTime(startTime - 0.001);

        // New carousel slot
        var to = slots[state[i]];

        // Start
        pos.setValueAtTime(startTime, from);

        // End
        pos.setValueAtTime(endTime, to);

        // Smooth movement
        var k1 = pos.nearestKeyIndex(startTime);
        var k2 = pos.nearestKeyIndex(endTime);

        pos.setInterpolationTypeAtKey(
            k1,
            KeyframeInterpolationType.BEZIER,
            KeyframeInterpolationType.BEZIER
        );

        pos.setInterpolationTypeAtKey(
            k2,
            KeyframeInterpolationType.BEZIER,
            KeyframeInterpolationType.BEZIER
        );
    }

    t += beatLength;
}

app.endUndoGroup();

alert(
    "Pyanoo carousel created!\n\n" +
    "BPM: " + bpm +
    "\nMovement: " + Math.round(movePercent * 100) +
    "% of each beat"
);