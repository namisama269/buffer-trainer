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


// connect smart cube
//////////////////////////////////////////////////////////////

var UUID_SUFFIX = '-0000-1000-8000-00805f9b34fb';
var SERVICE_UUID = '0000fff0' + UUID_SUFFIX;
var CHRCT_UUID_CUBE = '0000fff6' + UUID_SUFFIX;

var QIYI_CIC_LIST = [0x0504];
var KEYS = ['NoDg7ANAjGkEwBYCc0xQnADAVgkzGAzHNAGyRTanQi5QIFyHrjQMQgsC6QA'];

function toUuid128(uuid) {
    if (/^[0-9A-Fa-f]{4}$/.exec(uuid)) {
        uuid = "0000" + uuid + "-0000-1000-8000-00805F9B34FB";
    }
    return uuid.toUpperCase();
}

function matchUUID(uuid1, uuid2) {
    return toUuid128(uuid1) == toUuid128(uuid2);
}

function sendMessage(content) {
    var msg = [0xfe];
    msg.push(4 + content.length); // length = 1 (op) + cont.length + 2 (crc)
    for (var i = 0; i < content.length; i++) {
        msg.push(content[i]);
    }
    var crc = crc16modbus(msg);
    msg.push(crc & 0xff, crc >> 8);
    var npad = (16 - msg.length % 16) % 16;
    for (var i = 0; i < npad; i++) {
        msg.push(0);
    }
    var encMsg = [];
    var decoder = new aes128(JSON.parse(LZString.decompressFromEncodedURIComponent(KEYS[0])));
    for (var i = 0; i < msg.length; i += 16) {
        var block = msg.slice(i, i + 16);
        decoder.encrypt(block);
        for (var j = 0; j < 16; j++) {
            encMsg[i + j] = block[j];
        }
    }
    return chrct_cube.writeValue(new Uint8Array(encMsg).buffer);
}

function sendHello(mac) {
    if (!mac) {
        return;
    }
    var content = [0x00, 0x6b, 0x01, 0x00, 0x00, 0x22, 0x06, 0x00, 0x02, 0x08, 0x00];
    for (var i = 5; i >= 0; i--) {
        content.push(parseInt(mac.slice(i * 3, i * 3 + 2), 16));
    }
    return sendMessage(content);
}

let device = null;
let deviceName = "";
let chrct_cube = null;
let connected = false;

async function connect() {
    device = await navigator.bluetooth.requestDevice(
        {
            filters: [
                { namePrefix: "QY" }
            ],
            optionalServices: [SERVICE_UUID],
        }
    );

    deviceName = device.name.trim();
    // is this fixed for all qiyi smart cube?
    let mac = 'CC:A3:00:00:' + deviceName.slice(10, 12) + ':' + deviceName.slice(12, 14);

    let gatt = await device.gatt.connect();
    let service = await gatt.getPrimaryService(SERVICE_UUID);
    let chrcts = await service.getCharacteristics();

    for (var i = 0; i < chrcts.length; i++) {
        var chrct = chrcts[i];
        if (matchUUID(chrct.uuid, CHRCT_UUID_CUBE)) {
            chrct_cube = chrct;
        }
    }

    chrct_cube.addEventListener('characteristicvaluechanged', onCubeEvent);
    await chrct_cube.startNotifications();

    await sendHello(mac);
}

async function disconnect() {
    chrct_cube.removeEventListener('characteristicvaluechanged', onCubeEvent);
    chrct_cube.stopNotifications();
    device.gatt.disconnect();
}

function onCubeEvent(event) {
    var value = event.target.value;
    var encMsg = [];
    for (var i = 0; i < value.byteLength; i++) {
        encMsg[i] = value.getUint8(i);
    }
    var decoder = new aes128(JSON.parse(LZString.decompressFromEncodedURIComponent(KEYS[0])));
    var msg = [];
    for (var i = 0; i < encMsg.length; i += 16) {
        var block = encMsg.slice(i, i + 16);
        decoder.decrypt(block);
        for (var j = 0; j < 16; j++) {
            msg[i + j] = block[j];
        }
    }
    msg = msg.slice(0, msg[1]);
    if (msg.length < 3 || crc16modbus(msg) != 0) {
        return;
    }
    parseCubeData(msg);
}

function parseFacelet(faceMsg) {
    var ret = [];
    for (var i = 0; i < 54; i++) {
        ret.push("LRDUFB".charAt(faceMsg[i >> 1] >> (i % 2 << 2) & 0xf));
    }
    ret = ret.join("");
    return ret;
}

const moveMap = {
    0x1: "L'",
    0x2: "L",
    0x3: "R'",
    0x4: "R",
    0x5: "D'",
    0x6: "D",
    0x7: "U'",
    0x8: "U",
    0x9: "F'",
    0xa: "F",
    0xb: "B'",
    0xc: "B",
};

var prevMoves = [];
var lastTs = 0;

function parseCubeData(msg) {
    if (msg[0] != 0xfe) {
        console.log('[qiyicube]', 'error cube data', msg);
    }
    var opcode = msg[2];
    var ts = (msg[3] << 24 | msg[4] << 16 | msg[5] << 8 | msg[6]);
    if (opcode == 0x2) { // cube hello
        sendMessage(msg.slice(2, 7));
        batteryLevel = msg[35];
    } else if (opcode == 0x3) { // state change
        sendMessage(msg.slice(2, 7));

        var todoMoves = [[msg[34], ts]];
        while (todoMoves.length < 10) {
            var off = 91 - 5 * todoMoves.length;
            var hisTs = (msg[off] << 24 | msg[off + 1] << 16 | msg[off + 2] << 8 | msg[off + 3]);
            var hisMv = msg[off + 4];
            if (hisTs <= lastTs) {
                break;
            }
            todoMoves.push([hisMv, hisTs]);
        }
        if (todoMoves.length > 1) {
            console.log('[qiyicube]', 'miss history moves', JSON.stringify(todoMoves), lastTs);
        }

        for (let i = todoMoves.length-1; i >= 0; --i) {
            // do logged move on the cube
            cube.move(invertMoves(holdingOrientation));
            cube.move(moveMap[todoMoves[i][0]]);
            cube.move(holdingOrientation);
        }
    
        todoMoves = [];
    
        vc.cubeString = cube.asString();
        vc.drawCube(ctx);
    }
    lastTs = ts;
}

var connectSmartCube = document.getElementById("connectSmartCube");
connectSmartCube.addEventListener('click', async () => {
    try {
        if (connected) {
            await disconnect();
            connectSmartCube.textContent = 'Connect Smart Cube';
            alert(`Smart cube ${deviceName} disconnected`);
            connected = false;
        } else {
            await connect();
            connected = true;
            connectSmartCube.textContent = 'Disconnect Smart Cube';
            alert(`Smart cube ${deviceName} connected`);
        }
    } catch(e) {
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