app.beginUndoGroup("Beat Carousel");

var comp = app.project.activeItem;
if (!(comp instanceof CompItem)) {
    alert("Open a composition first.");
    throw new Error();
}

var layerName = prompt("Name of the 3 video layers:", "video");
var audio = comp.layer("Audio Amplitude");

if (!audio) {
    alert("No 'Audio Amplitude' layer found.\nRun Convert Audio to Keyframes first.");
    throw new Error();
}

// Find the 3 matching layers
var vids = [];
for (var i = 1; i <= comp.numLayers; i++) {
    var l = comp.layer(i);
    if (l.name == layerName && vids.length < 3)
        vids.push(l);
}

if (vids.length != 3) {
    alert("Couldn't find exactly 3 layers named '" + layerName + "'.");
    throw new Error();
}

// Their current positions become the 3 carousel slots
var slots = [
    vids[0].position.value,
    vids[1].position.value,
    vids[2].position.value
];

// Audio amplitude
var amp = audio.effect("Both Channels")("Slider");

var threshold = 35; // Increase/decrease for sensitivity
var minBeatGap = 0.20; // seconds between beats

// Find amplitude peaks
var beats = [];
var lastBeat = -999;

for (var k = 2; k < amp.numKeys; k++) {
    var prev = amp.keyValue(k - 1);
    var cur  = amp.keyValue(k);
    var next = amp.keyValue(k + 1);

    if (cur > threshold && cur >= prev && cur >= next) {
        var t = amp.keyTime(k);

        if (t - lastBeat >= minBeatGap) {
            beats.push(t);
            lastBeat = t;
        }
    }
}

// Clear existing position animation
for (var v = 0; v < 3; v++) {
    var pos = vids[v].position;
    while (pos.numKeys > 0)
        pos.removeKey(1);
}

// Initial positions
var state = [0, 1, 2];

for (var v = 0; v < 3; v++)
    vids[v].position.setValueAtTime(0, slots[state[v]]);

// Rotate positions on every beat
for (var b = 0; b < beats.length; b++) {

    // 0 -> 1 -> 2 -> 0
    state = [
        state[2],
        state[0],
        state[1]
    ];

    for (var v = 0; v < 3; v++) {
        var p = vids[v].position;
        var key = p.addKey(beats[b]);
        p.setValueAtKey(key, slots[state[v]]);

        // Make the jump instant
        p.setInterpolationTypeAtKey(
            key,
            KeyframeInterpolationType.HOLD,
            KeyframeInterpolationType.HOLD
        );
    }
}

app.endUndoGroup();

alert("Carousel created!\nDetected " + beats.length + " beats.");