let EDGEBUFFERORDER = ['UF', 'UB', 'UR', 'UL', 'FR', 'FL', 'DF', 'DB', 'DR', 'DL'];
let CORNERBUFFERORDER = ['UFR', 'UFL', 'UBR', 'UBL', 'DFR', 'DFL'];

let EDGEBUFFER = 'UF';
let CORNERBUFFER = 'UFR';

let EXCLUDEDEDGES = getExcludedEdges("UF");
let EXCLUDEDCORNERS = getExcludedCorners("UFR");

let bt = new bufferTrainer(EDGEBUFFER, CORNERBUFFER, EXCLUDEDEDGES, EXCLUDEDCORNERS);

let nextscram = bt.getScram();
let thisscram = "";
let lastscram = "";

const canvas = document.getElementById('myCanvas');
const ctx = canvas.getContext('2d');
let vc = new VisualCube(1200, 1200, 400, -0.523598, -0.209439, 0, 3, 0.08);
let cube = new Cube();

let holdingOrientation = "";

document.addEventListener("DOMContentLoaded", function() {
    const savedValue = localStorage.getItem('holdingOrientation');
    if (savedValue !== null) {
        holdingOrientation = savedValue;
    }

    cube.identity();
    cube.move(holdingOrientation);
    vc.cubeString = cube.asString();
    vc.drawCube(ctx);
});

function applyMoves(moves) {
    cube.move(invertMoves(holdingOrientation));
    cube.move(moves);
    cube.move(holdingOrientation); 
    vc.cubeString = cube.asString();
    vc.drawCube(ctx);
}

let conn = null;

var connectSmartCube = document.getElementById("connectSmartCube");
connectSmartCube.addEventListener('click', async () => {
    try {
        if (conn) {
            await conn.disconnect();
            connectSmartCube.textContent = 'Connect Smart Cube';
            alert(`Smart cube ${conn.deviceName} disconnected`);
            conn = null;
        } else {
            conn = await connect(applyMoves);
            if (!conn) {
                alert(`Smart cube is not supported`);
            } else {
                await conn.initAsync();
                connectSmartCube.textContent = 'Disconnect Smart Cube';
                alert(`Smart cube ${conn.deviceName} connected`);
            }
        }
    } catch (e) {
        connectSmartCube.textContent = 'Connect Smart Cube';
    }
});


//////////////////////////////////////////////////////////////

function newBufferTrainer() {
    EXCLUDEDEDGES = getExcludedEdges(EDGEBUFFER);
    EXCLUDEDCORNERS = getExcludedCorners(CORNERBUFFER);
    bt = new bufferTrainer(EDGEBUFFER, CORNERBUFFER, EXCLUDEDEDGES, EXCLUDEDCORNERS);
    genScram();
    displayScram();
}

function getExcludedEdges(buffer) {
    if (buffer === "None") {
        return "All"
    }
    let bufferIndex = EDGEBUFFERORDER.indexOf(buffer);
    return EDGEBUFFERORDER.slice(0, bufferIndex);
}

function getExcludedCorners(buffer) {
    if (buffer === "None") {
        return "All"
    }
    let bufferIndex = CORNERBUFFERORDER.indexOf(buffer);
    return CORNERBUFFERORDER.slice(0, bufferIndex);
}

// Update visual cube
function updateVisualCube() {
    let scr = document.getElementById("scramble").innerHTML;

    cube.identity(); // reset cube 
    cube.move(holdingOrientation);
    console.log(vc.cubeString);
    cube.move(scr);
    vc.cubeString = cube.asString();
    vc.drawCube(ctx);

    console.log(scr);
}

// Scramble generation. 
function genScram() {
    thisscram = nextscram;
    nextscram = bt.getScram();
}

function displayScram() {
    lastscram = thisscram;
    document.getElementById("scramble").innerHTML = nextscram;
    genScram();
    updateVisualCube()
}

function lastScram() {
    document.getElementById("scramble").innerHTML = lastscram;
}


// Next scramble on space bar
document.getElementById("next").onclick = function () {
    displayScram();
};
document.addEventListener('keydown', event => {
    if (event.code === 'Space') {
        event.preventDefault();
        displayScram();
    }
    if (event.code === 'Enter') {
        event.preventDefault();
        displayScram();
    }
    if (event.code === 'Escape') {
        event.preventDefault();
        updateVisualCube();
    }
})

// Last scramble

document.getElementById("last").onclick = function () {
    lastScram();
    updateVisualCube()
};

// Selecting new buffer(s)
document.getElementById("edgebuffer").onchange = function () {
    document.getElementById("edgebuffer").blur();
    let e = document.getElementById("edgebuffer");
    let value = e.options[e.selectedIndex].value; 
    EDGEBUFFER = value;
    EXCLUDEDEDGES = getExcludedEdges(value);
    newBufferTrainer();
};

document.getElementById("cornerbuffer").onchange = function () {
    document.getElementById("cornerbuffer").blur();
    let e = document.getElementById('cornerbuffer');
    let value = e.options[e.selectedIndex].value;
    CORNERBUFFER = value;
    EXCLUDEDCORNERS = getExcludedCorners(value);
    newBufferTrainer();
};


// Change Buffer Order
new Sortable(edgebufferlist, {
    ghostClass: 'sortable-ghost',
    chosenClass: 'sortable-chosen',
});

new Sortable(cornerbufferlist, {
    ghostClass: 'sortable-ghost',
    chosenClass: 'sortable-chosen',
});

document.getElementById("confirm").onclick = function () {
    EDGEBUFFERORDER = Array.from(document.querySelectorAll("#edgebufferlist > li > a")).map(function (e) {return e.innerHTML;});
    CORNERBUFFERORDER = Array.from(document.querySelectorAll("#cornerbufferlist > li > a")).map(function (e) {return e.innerHTML;});

    let ebufferlist = Array.from(document.querySelectorAll("#edgebuffer > option"));
    for (let i = 0; i < EDGEBUFFERORDER.length - 1; i++) {
        ebufferlist[i + 1].innerHTML = EDGEBUFFERORDER[i];
        ebufferlist[i + 1].value = EDGEBUFFERORDER[i];
    }

    let cbufferlist = Array.from(document.querySelectorAll("#cornerbuffer > option"));
    for (let i = 0; i < CORNERBUFFERORDER.length - 1; i++) {
        cbufferlist[i + 1].innerHTML = CORNERBUFFERORDER[i];
        cbufferlist[i + 1].value = CORNERBUFFERORDER[i];
    }
    

    document.getElementById('edgebuffer').options[1].selected = true;
    document.getElementById('cornerbuffer').options[1].selected = true;

    let e = document.getElementById("edgebuffer");
    let value = e.options[e.selectedIndex].value; 
    EDGEBUFFER = value;
    EXCLUDEDEDGES = getExcludedEdges(value);

    let ea = document.getElementById('cornerbuffer');
    let valuea = ea.options[ea.selectedIndex].value;
    CORNERBUFFER = valuea;
    EXCLUDEDCORNERS = getExcludedCorners(valuea);

    newBufferTrainer();
}

var setBldOrientation = document.getElementById("setBldOrientation");
setBldOrientation.addEventListener('click', () => {
    holdingOrientation = prompt("Enter BLD orientation as rotation moves away from WCA orientation (empty for white green):");
    if (holdingOrientation !== null) {
        // alert(`Orientation set to: ${holdingOrientation}`);
        localStorage.setItem('holdingOrientation', holdingOrientation);

        cube.identity();
        cube.move(holdingOrientation);
        vc.cubeString = cube.asString();
        vc.drawCube(ctx);
    }
});