(function directionalAfterimage() {

    function buildUI() {
        var win = new Window("dialog", "Directional Afterimage");
        win.orientation = "column";
        win.alignChildren = ["fill", "top"];
        win.spacing = 10;
        win.margins = 16;

        function addSlider(group, labelText, min, max, value, isInt) {
            var row = group.add("group");
            row.orientation = "row";
            row.alignChildren = ["left", "center"];
            var label = row.add("statictext", undefined, labelText);
            label.preferredSize.width = 140;
            var slider = row.add("slider", undefined, value, min, max);
            slider.preferredSize.width = 160;
            var edit = row.add("edittext", undefined, isInt ? String(value) : value.toFixed(2));
            edit.characters = 6;

            slider.onChanging = function () {
                edit.text = isInt ? String(Math.round(slider.value)) : slider.value.toFixed(2);
            };
            edit.onChange = function () {
                var v = parseFloat(edit.text);
                if (isNaN(v)) v = value;
                if (v < min) v = min;
                if (v > max) v = max;
                slider.value = v;
                edit.text = isInt ? String(Math.round(v)) : v.toFixed(2);
            };
            return { slider: slider, edit: edit };
        }

        var mainGroup = win.add("panel", undefined, "Trail Settings");
        mainGroup.orientation = "column";
        mainGroup.alignChildren = ["fill", "top"];
        mainGroup.margins = 12;

        var trailCount = addSlider(mainGroup, "Echo count", 1, 20, 6, true);
        var delayFrames = addSlider(mainGroup, "Delay per echo (frames)", 1, 10, 2, true);
        var driftDistance = addSlider(mainGroup, "Drift per echo (px)", 0, 200, 25, false);
        var decayFactor = addSlider(mainGroup, "Decay factor (0-1)", 0.1, 0.95, 0.75, false);
        var directionAngle = addSlider(mainGroup, "Direction (deg, 0=right)", 0, 360, 0, true);

        var bidiGroup = win.add("group");
        bidiGroup.orientation = "row";
        var bidiCheck = bidiGroup.add("checkbox", undefined, "Bidirectional (mirror opposite direction too)");
        bidiCheck.value = false;

        var belowGroup = win.add("group");
        belowGroup.orientation = "row";
        var belowCheck = belowGroup.add("checkbox", undefined, "Place echoes below original (recommended)");
        belowCheck.value = true;

        var btnGroup = win.add("group");
        btnGroup.orientation = "row";
        btnGroup.alignment = "right";
        var cancelBtn = btnGroup.add("button", undefined, "Cancel", { name: "cancel" });
        var okBtn = btnGroup.add("button", undefined, "Apply", { name: "ok" });

        var result = null;

        okBtn.onClick = function () {
            result = {
                trailCount: Math.round(trailCount.slider.value),
                delayFrames: Math.round(delayFrames.slider.value),
                driftDistance: driftDistance.slider.value,
                decayFactor: decayFactor.slider.value,
                directionAngle: directionAngle.slider.value,
                bidirectional: bidiCheck.value,
                placeBelow: belowCheck.value
            };
            win.close(1);
        };
        cancelBtn.onClick = function () {
            win.close(0);
        };

        var shown = win.show();
        if (shown !== 1) return null;
        return result;
    }

    function directionVector(angleDeg) {
        var rad = angleDeg * Math.PI / 180;
        return [Math.cos(rad), Math.sin(rad)];
    }

    function buildPositionExpression(originalName, delayInSeconds, offsetX, offsetY) {
        return [
            'var srcLayer = thisComp.layer("' + originalName + '");',
            'var sampleTime = time - ' + delayInSeconds.toFixed(6) + ';',
            'if (sampleTime < srcLayer.inPoint) sampleTime = srcLayer.inPoint;',
            'var srcPos = srcLayer.transform.position.valueAtTime(sampleTime);',
            'srcPos + [' + offsetX.toFixed(3) + ', ' + offsetY.toFixed(3) + '];'
        ].join('\n');
    }

    function buildOpacityExpression(baseOpacityExprSource, decay, index) {
        return [
            'var srcLayer = thisComp.layer("' + baseOpacityExprSource + '");',
            'var baseOp = srcLayer.transform.opacity.value;',
            'baseOp * Math.pow(' + decay.toFixed(4) + ', ' + index + ');'
        ].join('\n');
    }

    function applyToLayer(comp, srcLayer, settings) {
        var origName = srcLayer.name;
        var frameDuration = 1 / comp.frameRate;

        var directions = [settings.directionAngle];
        if (settings.bidirectional) {
            directions.push((settings.directionAngle + 180) % 360);
        }

        for (var d = 0; d < directions.length; d++) {
            var angle = directions[d];
            var vec = directionVector(angle);
            var suffix = settings.bidirectional ? (d === 0 ? "_A" : "_B") : "";

            for (var i = 1; i <= settings.trailCount; i++) {
                var echo = srcLayer.duplicate();
                echo.name = origName + "_Echo" + suffix + i;

                if (settings.placeBelow) {
                    echo.moveAfter(srcLayer); 
                }
                var delaySeconds = settings.delayFrames * i * frameDuration;
                var offsetX = vec[0] * settings.driftDistance * i;
                var offsetY = vec[1] * settings.driftDistance * i;

                echo.transform.position.expression =
                    buildPositionExpression(origName, delaySeconds, offsetX, offsetY);

                echo.transform.opacity.expression =
                    buildOpacityExpression(origName, settings.decayFactor, i);
            }
        }
    }
    var comp = app.project.activeItem;
    if (!comp || !(comp instanceof CompItem)) {
        alert("Open a composition and select at least one layer first.");
        return;
    }
    var selectedLayers = comp.selectedLayers;
    if (!selectedLayers || selectedLayers.length === 0) {
        alert("Select at least one layer in the timeline first.");
        return;
    }

    var settings = buildUI();
    if (!settings) return; // user cancelled

    app.beginUndoGroup("Directional Afterimage");
    try {
        for (var i = 0; i < selectedLayers.length; i++) {
            applyToLayer(comp, selectedLayers[i], settings);
        }
    } catch (err) {
        alert("Directional Afterimage error: " + err.toString());
    }
    app.endUndoGroup();

})();
