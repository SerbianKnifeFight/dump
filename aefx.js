app.beginUndoGroup("you know i mean business when i bring out the colored masks");

var comp = app.project.activeItem;

if (!(comp instanceof CompItem)) {
    alert("Open a composition first.");
    throw new Error("No composition.");
}

if (comp.selectedLayers.length !== 1) {
    alert("Select exactly ONE shape layer.");
    throw new Error("Wrong selection.");
}

var layer = comp.selectedLayers[0];

if (layer.matchName !== "ADBE Vector Layer") {
    alert("The selected layer is not a Shape Layer.");
    throw new Error("Not a shape layer.");
}


var movementAmount = 1.0;   // pixels
var movementSpeed  = 2.0;   // times per second

var distortionAmount = 2.0; // pixels
var distortionSize   = 25.0;

var glitchFPS = 8;           // how often distortion can change

var position = layer.transform.position;

position.expression =
    "wiggle(" +
    movementSpeed +
    "," +
    movementAmount +
    ")";


var effects = layer.property("ADBE Effect Parade");

var distort = effects.addProperty("ADBE Turbulent Displace");

if (distort) {

    distort.name = "Tiny Shape Glitch";

    // Amount
    var amount = distort.property("Amount");

    if (amount) {
        amount.setValue(distortionAmount);

        // Make the distortion occasionally jump slightly,
        // rather than being perfectly smooth.
        amount.expression =
            "posterizeTime(" + glitchFPS + ");" +
            "wiggle(2," + (distortionAmount * 0.6) + ")";
    }

    // Size
    var size = distort.property("Size");

    if (size) {
        size.setValue(distortionSize);
    }

    // Evolution
    var evolution = distort.property("Evolution");

    if (evolution) {
        evolution.expression =
            "posterizeTime(" + glitchFPS + ");" +
            "time * 180";
    }

    // Complexity
    var complexity = distort.property("Complexity");

    if (complexity) {
        complexity.setValue(1.0);
    }
}

app.endUndoGroup();

alert(
    "Subtle shape glitch added!\n\n" +
    "Tiny position movement + edge distortion."
);