app.beginUndoGroup("Subtle Character Shift");

var comp = app.project.activeItem;

if (!(comp instanceof CompItem)) {
    alert("Open a composition and select a text layer.");
    throw new Error("No composition.");
}

if (comp.selectedLayers.length !== 1) {
    alert("Select exactly ONE text layer.");
    throw new Error("Wrong selection.");
}

var textLayer = comp.selectedLayers[0];

if (textLayer.matchName !== "ADBE Text Layer") {
    alert("The selected layer is not a text layer.");
    throw new Error("Not a text layer.");
}

var positionAmount = [2, 5]; // pixels
var rotationAmount = 1.0;    // degrees
var wigglesPerSecond = 3.0;

var textProps = textLayer.property("ADBE Text Properties");
var animators = textProps.property("ADBE Text Animators");


var posAnimator = animators.addProperty("ADBE Text Animator");
posAnimator.name = "Subtle Position Shift";

var posProps = posAnimator.property("ADBE Text Animator Properties");
var pos = posProps.addProperty("ADBE Text Position 3D");

pos.setValue(positionAmount);

// Add Wiggly Selector
var posSelectors = posAnimator.property("ADBE Text Selectors");
var posWiggle = posSelectors.addProperty("ADBE Text Wiggly Selector");

// Set wiggle speed
var wiggleSpeed = posWiggle.property("ADBE Text Temporal Freq");

if (wiggleSpeed) {
    wiggleSpeed.setValue(wigglesPerSecond);
}

var rotAnimator = animators.addProperty("ADBE Text Animator");
rotAnimator.name = "Subtle Rotation Shift";

var rotProps = rotAnimator.property("ADBE Text Animator Properties");
var rot = rotProps.addProperty("ADBE Text Rotation");

rot.setValue(rotationAmount);

// Add Wiggly Selector
var rotSelectors = rotAnimator.property("ADBE Text Selectors");
var rotWiggle = rotSelectors.addProperty("ADBE Text Wiggly Selector");

// Set wiggle speed
var rotSpeed = rotWiggle.property("ADBE Text Temporal Freq");

if (rotSpeed) {
    rotSpeed.setValue(wigglesPerSecond);
}

app.endUndoGroup();

alert(
    "Done!\n\n" +
    "Position: ±" + positionAmount[0] + " px\n" +
    "Rotation: ±" + rotationAmount + "°\n" +
    "Speed: " + wigglesPerSecond + " wiggles/sec"
);