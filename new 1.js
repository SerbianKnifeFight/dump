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

// How much of each beat is spent moving
var movePercent = 0.20;
var moveLength = beatLength * movePercent;

// ─────────────────────────────────────────────
// FIND THE 3 VIDEOS
// ─────────────────────────────────────────────

var vids = [];

for (var i = 1; i <= comp.numLayers; i++) {
    if (comp.layer(i).name == layerName) {
        vids.push(comp.layer(i));
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
// THEIR CURRENT POSITIONS ARE THE 3 SLOTS
// ─────────────────────────────────────────────

var slots = [
    vids[0].position.value,
    vids[1].position.value,
    vids[2].position.value
];

// Remove existing position animation
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

// Current slot of each video
var state = [0, 1, 2];

var t = comp.displayStartTime + beatLength;

// ─────────────────────────────────────────────
// CREATE BEAT MOVEMENT
// ─────────────────────────────────────────────

while (t < comp.duration) {

    // Rotate:
    // A → B
    // B → C
    // C → A

    var oldState = [
        state[0],
        state[1],
        state[2]
    ];

    state = [
        oldState[2],
        oldState[0],
        oldState[1]
    ];

    for (var i = 0; i < 3; i++) {

        var pos = vids[i].position;

        var from = slots[oldState[i]];
        var to   = slots[state[i]];

        // Start of movement
        pos.setValueAtTime(t, from);

        // End of movement
        pos.setValueAtTime(t + moveLength, to);

        // Smooth the movement
        var startKey = pos.nearestKeyIndex(t);
        var endKey = pos.nearestKeyIndex(t + moveLength);

        pos.setInterpolationTypeAtKey(
            startKey,
            KeyframeInterpolationType.BEZIER,
            KeyframeInterpolationType.BEZIER
        );

        pos.setInterpolationTypeAtKey(
            endKey,
            KeyframeInterpolationType.BEZIER,
            KeyframeInterpolationType.BEZIER
        );
    }

    t += beatLength;
}

app.endUndoGroup();

alert(
    "Carousel created!\n\n" +
    "BPM: " + bpm +
    "\nMovement: " +
    Math.round(movePercent * 100) +
    "% of each beat"
);