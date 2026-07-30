app.beginUndoGroup("Pyanoo Beat Carousel");

var comp = app.project.activeItem;

if (!(comp instanceof CompItem)) {
    alert("Open your composition first.");
    app.endUndoGroup();
    throw new Error("No composition selected.");
}

// ─────────────────────────────────────────────
// SETTINGS
// ─────────────────────────────────────────────

var layerName = "pyanoo.mp4";

var bpm = parseFloat(
    prompt("BPM:", "120")
);

if (isNaN(bpm) || bpm <= 0) {
    alert("Invalid BPM.");
    app.endUndoGroup();
    throw new Error("Invalid BPM.");
}

var beatLength = 60 / bpm;

// ─────────────────────────────────────────────
// FIND THE THREE VIDEOS
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

    app.endUndoGroup();
    throw new Error("Wrong number of video layers.");
}

// ─────────────────────────────────────────────
// SAVE THEIR CURRENT POSITIONS
// These become our carousel slots.
// ─────────────────────────────────────────────

var slots = [
    vids[0].position.value,
    vids[1].position.value,
    vids[2].position.value
];

// ─────────────────────────────────────────────
// REMOVE EXISTING POSITION KEYFRAMES
// ─────────────────────────────────────────────

for (var i = 0; i < 3; i++) {

    var pos = vids[i].position;

    while (pos.numKeys > 0) {
        pos.removeKey(1);
    }
}

// ─────────────────────────────────────────────
// CURRENT SLOT ASSIGNMENTS
//
// Video 0 starts in slot 0
// Video 1 starts in slot 1
// Video 2 starts in slot 2
// ─────────────────────────────────────────────

var state = [0, 1, 2];

// Put the videos in their original positions
for (var i = 0; i < 3; i++) {
    vids[i].position.setValueAtTime(
        comp.displayStartTime,
        slots[state[i]]
    );
}

// ─────────────────────────────────────────────
// MAKE BEAT KEYFRAMES
// ─────────────────────────────────────────────

var t = comp.displayStartTime + beatLength;

while (t < comp.duration) {

    // Rotate the carousel:
    //
    // 0 → 1
    // 1 → 2
    // 2 → 0

    state = [
        state[2],
        state[0],
        state[1]
    ];

    for (var i = 0; i < 3; i++) {

        var pos = vids[i].position;

        pos.setValueAtTime(
            t,
            slots[state[i]]
        );

        // Make the transition instantaneous
        var key = pos.nearestKeyIndex(t);

        pos.setInterpolationTypeAtKey(
            key,
            KeyframeInterpolationType.HOLD,
            KeyframeInterpolationType.HOLD
        );
    }

    t += beatLength;
}

app.endUndoGroup();

alert(
    "Pyanoo carousel created!\n\n" +
    "BPM: " + bpm +
    "\nBeat: " + beatLength.toFixed(3) + " seconds"
);