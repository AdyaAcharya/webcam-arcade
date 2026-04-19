// ═══════════════════════════════════════════════════════════════════════════
// CONFIG
// ═══════════════════════════════════════════════════════════════════════════

const COLORS = [
  { name: 'Black',  hex: '#111111' },
  { name: 'White',  hex: '#ffffff' },
  { name: 'Red',    hex: '#f44336' },
  { name: 'Blue',   hex: '#2196f3' },
  { name: 'Green',  hex: '#4caf50' },
  { name: 'Yellow', hex: '#ffeb3b' },
  { name: 'Purple', hex: '#9c27b0' },
  { name: 'Orange', hex: '#ff9800' },
  { name: 'Cyan',   hex: '#00bcd4' },
];

const MAX_HISTORY = 20;

// EMA alpha: 0 = max smooth, 1 = no smooth; 0.35 = responsive yet stable
const SMOOTH_ALPHA = 0.35;

// Frames needed to confirm a gesture switch (prevents rapid flickering)
const MODE_DEBOUNCE_FRAMES = 6;

// How far above PIP joint fingertip must be (0-1 coords) to count as extended
const EXT_MARGIN = 0.035;

// ═══════════════════════════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════════════════════════

let currentColor = '#7c6af7';
let brushSize    = 6;
let history      = [];
let future       = [];

// Gesture mode: 'draw' | 'move' | 'erase' | 'none'
let currentMode  = 'none';
let pendingMode  = 'none';   // candidate mode not yet confirmed
let pendingCount = 0;        // how many frames we've seen pendingMode

// Smoothed cursor position
let smoothX = -999;
let smoothY = -999;
let lastX   = null;
let lastY   = null;

// Drawing flags
let isDrawing  = false;
let wasErasing = false;

// ═══════════════════════════════════════════════════════════════════════════
// ELEMENTS
// ═══════════════════════════════════════════════════════════════════════════

const drawCanvas = document.getElementById('draw-canvas');
const ctx        = drawCanvas.getContext('2d');
const pipCanvas  = document.getElementById('pip-canvas');
const pipCtx     = pipCanvas.getContext('2d');
const video      = document.getElementById('webcam');
const overlay    = document.getElementById('overlay');
const statusDot  = document.getElementById('status-dot');
const statusText = document.getElementById('status-text');
const undoBtn    = document.getElementById('undo-btn');
const redoBtn    = document.getElementById('redo-btn');
const clearBtn   = document.getElementById('clear-btn');
const sizeSlider = document.getElementById('brush-size-slider');
const sizeDot    = document.getElementById('size-dot');
const pillDraw   = document.getElementById('pill-draw');
const pillMove   = document.getElementById('pill-move');
const pillErase  = document.getElementById('pill-erase');

pipCanvas.width  = 200;
pipCanvas.height = 150;

// ═══════════════════════════════════════════════════════════════════════════
// CANVAS RESIZE
// ═══════════════════════════════════════════════════════════════════════════

function resizeCanvas() {
  const TOOLBAR_H = 68;
  const imgData = ctx.getImageData(0, 0, drawCanvas.width, drawCanvas.height);
  drawCanvas.width  = window.innerWidth;
  drawCanvas.height = window.innerHeight - TOOLBAR_H;
  ctx.putImageData(imgData, 0, 0);
}

resizeCanvas();

window.addEventListener('resize', () => {
  resizeCanvas();
  resizeCursorCanvas();
});

// ═══════════════════════════════════════════════════════════════════════════
// COLOR PALETTE
// ═══════════════════════════════════════════════════════════════════════════

const palette = document.getElementById('color-palette');

COLORS.forEach(c => {
  const s = document.createElement('button');
  s.className = 'color-swatch';
  s.title = c.name;
  s.style.background = c.hex;
  if (c.hex === '#ffffff') s.style.border = '2.5px solid #444';
  s.dataset.hex = c.hex;
  if (c.hex === currentColor) s.classList.add('active');
  s.addEventListener('click', () => {
    currentColor = c.hex;
    document.querySelectorAll('.color-swatch').forEach(x => x.classList.remove('active'));
    s.classList.add('active');
    updateSizeDot();
  });
  palette.appendChild(s);
});

// ═══════════════════════════════════════════════════════════════════════════
// SIZE SLIDER
// ═══════════════════════════════════════════════════════════════════════════

function updateSizeDot() {
  const s = Math.min(brushSize, 26);
  sizeDot.style.width  = s + 'px';
  sizeDot.style.height = s + 'px';
  sizeDot.style.background = (currentMode === 'erase') ? '#888' : currentColor;
}

sizeSlider.addEventListener('input', () => {
  brushSize = parseInt(sizeSlider.value);
  updateSizeDot();
});

updateSizeDot();

// ═══════════════════════════════════════════════════════════════════════════
// UNDO / REDO / CLEAR
// ═══════════════════════════════════════════════════════════════════════════

function saveState() {
  history.push(drawCanvas.toDataURL());
  if (history.length > MAX_HISTORY) history.shift();
  future = [];
  updateButtons();
}

function undo() {
  if (!history.length) return;
  future.push(drawCanvas.toDataURL());
  if (future.length > MAX_HISTORY) future.shift();
  loadState(history.pop());
  updateButtons();
}

function redo() {
  if (!future.length) return;
  history.push(drawCanvas.toDataURL());
  loadState(future.pop());
  updateButtons();
}

function loadState(dataURL) {
  const img = new Image();
  img.onload = () => {
    ctx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
    ctx.drawImage(img, 0, 0);
  };
  img.src = dataURL;
}

function updateButtons() {
  undoBtn.disabled = history.length === 0;
  redoBtn.disabled = future.length === 0;
}

undoBtn.addEventListener('click', undo);
redoBtn.addEventListener('click', redo);
clearBtn.addEventListener('click', () => {
  saveState();
  ctx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
});

document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
  if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) { e.preventDefault(); redo(); }
});

// ═══════════════════════════════════════════════════════════════════════════
// DRAWING
// ═══════════════════════════════════════════════════════════════════════════

function drawLine(x1, y1, x2, y2, erasing) {
  ctx.save();
  if (erasing) {
    ctx.globalCompositeOperation = 'destination-out';
    ctx.strokeStyle = 'rgba(0,0,0,1)';
    ctx.lineWidth   = brushSize * 3;
  } else {
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = currentColor;
    ctx.lineWidth   = brushSize;
  }
  ctx.lineCap  = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.restore();
}

// ═══════════════════════════════════════════════════════════════════════════
// CURSOR CANVAS (overlaid, pointer-events: none)
// ═══════════════════════════════════════════════════════════════════════════

const cursorCanvas = document.createElement('canvas');
cursorCanvas.style.cssText = `
  position: fixed;
  top: 68px;
  left: 0;
  width: 100%;
  height: calc(100% - 68px);
  pointer-events: none;
  z-index: 10;
`;
document.body.appendChild(cursorCanvas);
const cursorCtx = cursorCanvas.getContext('2d');

function resizeCursorCanvas() {
  cursorCanvas.width  = window.innerWidth;
  cursorCanvas.height = window.innerHeight - 68;
}
resizeCursorCanvas();

// ═══════════════════════════════════════════════════════════════════════════
// RENDER LOOP — cursor visuals
// ═══════════════════════════════════════════════════════════════════════════

function renderLoop() {
  cursorCtx.clearRect(0, 0, cursorCanvas.width, cursorCanvas.height);

  if (smoothX > 0) {
    let col, r;

    if (currentMode === 'draw') {
      col = currentColor;
      r   = brushSize * 0.5;
    } else if (currentMode === 'erase') {
      col = '#f76a8a';
      r   = brushSize * 1.5;
    } else {
      col = '#4caf87';
      r   = 8;
    }

    // Outer ring
    cursorCtx.save();
    cursorCtx.strokeStyle = col;
    cursorCtx.lineWidth   = 1.5;
    cursorCtx.globalAlpha = 0.55;
    cursorCtx.beginPath();
    cursorCtx.arc(smoothX, smoothY, Math.max(r + 8, 14), 0, Math.PI * 2);
    cursorCtx.stroke();
    cursorCtx.restore();

    // Inner dot
    cursorCtx.save();
    cursorCtx.fillStyle   = col;
    cursorCtx.globalAlpha = currentMode === 'draw' ? 1 : 0.75;
    cursorCtx.beginPath();
    cursorCtx.arc(smoothX, smoothY, currentMode === 'draw' ? 5 : 4, 0, Math.PI * 2);
    cursorCtx.fill();
    cursorCtx.restore();

    // Active draw ring
    if (currentMode === 'draw' && isDrawing) {
      cursorCtx.save();
      cursorCtx.strokeStyle = col;
      cursorCtx.lineWidth   = 2.5;
      cursorCtx.globalAlpha = 0.9;
      cursorCtx.beginPath();
      cursorCtx.arc(smoothX, smoothY, r + 4, 0, Math.PI * 2);
      cursorCtx.stroke();
      cursorCtx.restore();
    }

    // Eraser preview square
    if (currentMode === 'erase') {
      const er = brushSize * 1.5;
      cursorCtx.save();
      cursorCtx.strokeStyle = '#f76a8a';
      cursorCtx.lineWidth   = 1.5;
      cursorCtx.globalAlpha = 0.5;
      cursorCtx.strokeRect(smoothX - er, smoothY - er, er * 2, er * 2);
      cursorCtx.restore();
    }
  }

  requestAnimationFrame(renderLoop);
}

renderLoop();

// ═══════════════════════════════════════════════════════════════════════════
// GESTURE DETECTION HELPERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Is the finger extended?
 * Smaller y = higher on screen = finger pointing up.
 */
function isExtended(tip, pip, margin = EXT_MARGIN) {
  return (pip.y - tip.y) > margin;
}

/**
 * Is the finger clearly curled?
 */
function isCurled(tip, pip, margin = EXT_MARGIN * 0.5) {
  return (tip.y - pip.y) > -margin;
}

/**
 * Detect gesture from MediaPipe hand landmarks.
 *
 * Key landmarks:
 *   lm[8]  index tip,  lm[6]  index PIP
 *   lm[12] middle tip, lm[10] middle PIP
 *   lm[16] ring tip,   lm[14] ring PIP
 *   lm[20] pinky tip,  lm[18] pinky PIP
 *
 * Returns: 'draw' | 'move' | 'erase' | 'unknown'
 */
function detectGesture(lm) {
  const indexUp  = isExtended(lm[8],  lm[6]);
  const middleUp = isExtended(lm[12], lm[10]);
  const ringUp   = isExtended(lm[16], lm[14]);
  const pinkyUp  = isExtended(lm[20], lm[18]);

  const indexDown  = isCurled(lm[8],  lm[6]);
  const middleDown = isCurled(lm[12], lm[10]);
  const ringDown   = isCurled(lm[16], lm[14]);
  const pinkyDown  = isCurled(lm[20], lm[18]);

  // DRAW: Only index finger extended
  if (indexUp && middleDown && ringDown && pinkyDown) {
    return 'draw';
  }

  // MOVE: All four fingers extended (open hand)
  if (indexUp && middleUp && ringUp && pinkyUp) {
    return 'move';
  }

  // ERASE: All fingers curled (fist)
  if (indexDown && middleDown && ringDown && pinkyDown) {
    return 'erase';
  }

  return 'unknown';
}

// ═══════════════════════════════════════════════════════════════════════════
// MODE MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Apply debounced mode switching.
 * A new mode is only accepted after MODE_DEBOUNCE_FRAMES consecutive frames.
 */
function applyMode(rawGesture) {
  if (rawGesture === 'unknown') return; // hold current mode

  if (rawGesture === pendingMode) {
    pendingCount++;
  } else {
    pendingMode  = rawGesture;
    pendingCount = 1;
  }

  if (pendingCount >= MODE_DEBOUNCE_FRAMES && rawGesture !== currentMode) {
    // Save stroke on leaving draw mode
    if (currentMode === 'draw' && isDrawing) {
      saveState();
      isDrawing = false;
      lastX = null; lastY = null;
    }
    // Save on leaving erase mode
    if (currentMode === 'erase' && wasErasing) {
      saveState();
      wasErasing = false;
      lastX = null; lastY = null;
    }

    currentMode = rawGesture;
    updateModePills();
    updateSizeDot();
  }
}

function updateModePills() {
  pillDraw.classList.toggle('active',  currentMode === 'draw');
  pillMove.classList.toggle('active',  currentMode === 'move');
  pillErase.classList.toggle('active', currentMode === 'erase');

  if (currentMode === 'draw') {
    statusDot.className = 'active';
    statusText.textContent = 'Draw mode';
  } else if (currentMode === 'move') {
    statusDot.className = 'ready';
    statusText.textContent = 'Move mode';
  } else if (currentMode === 'erase') {
    statusDot.className = 'active';
    statusText.textContent = 'Erase mode';
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SMOOTHING — Exponential Moving Average (EMA)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * EMA smoothing to reduce jitter.
 * alpha=0.35 → smooth with ~3-frame lag.
 */
function smooth(rawX, rawY) {
  if (smoothX < 0) {
    smoothX = rawX;
    smoothY = rawY;
  } else {
    smoothX = SMOOTH_ALPHA * rawX + (1 - SMOOTH_ALPHA) * smoothX;
    smoothY = SMOOTH_ALPHA * rawY + (1 - SMOOTH_ALPHA) * smoothY;
  }
  return { x: smoothX, y: smoothY };
}

// ═══════════════════════════════════════════════════════════════════════════
// MEDIAPIPE SETUP
// ═══════════════════════════════════════════════════════════════════════════

function setStep(id, done) {
  const el = document.getElementById(id);
  el.querySelector('span').className   = done ? 'check' : 'wait';
  el.querySelector('span').textContent = done ? '✓' : '○';
}

const hands = new Hands({
  locateFile: f => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${f}`
});

hands.setOptions({
  maxNumHands: 1,
  modelComplexity: 1,
  minDetectionConfidence: 0.72,
  minTrackingConfidence: 0.65
});

// Main result callback
hands.onResults(results => {
  const W = pipCanvas.width;
  const H = pipCanvas.height;

  // Draw mirrored webcam frame in PIP
  pipCtx.save();
  pipCtx.scale(-1, 1);
  pipCtx.drawImage(results.image, -W, 0, W, H);
  pipCtx.restore();

  if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
    const lm = results.multiHandLandmarks[0];

    // Draw skeleton on PIP
    drawConnectors(pipCtx, lm, HAND_CONNECTIONS, { color: 'rgba(124,106,247,0.55)', lineWidth: 1.5 });
    drawLandmarks(pipCtx, lm, { color: '#f76a8a', lineWidth: 1, radius: 2 });

    // Highlight index fingertip on PIP
    const itx = (1 - lm[8].x) * W;
    const ity = lm[8].y * H;
    pipCtx.save();
    pipCtx.fillStyle  = '#7c6af7';
    pipCtx.shadowColor = '#7c6af7';
    pipCtx.shadowBlur  = 8;
    pipCtx.beginPath();
    pipCtx.arc(itx, ity, 5, 0, Math.PI * 2);
    pipCtx.fill();
    pipCtx.restore();

    // Map index fingertip to drawing canvas coords (mirrored)
    const cW  = drawCanvas.width;
    const cH  = drawCanvas.height;
    const rawX = (1 - lm[8].x) * cW;
    const rawY = lm[8].y * cH;

    const { x: fx, y: fy } = smooth(rawX, rawY);

    // Gesture detection + mode debounce
    const gesture = detectGesture(lm);
    applyMode(gesture);

    // Act based on current mode
    if (currentMode === 'draw') {
      if (!isDrawing) {
        lastX = fx; lastY = fy;
        isDrawing = true;
      } else {
        drawLine(lastX, lastY, fx, fy, false);
        lastX = fx; lastY = fy;
      }
    } else if (currentMode === 'erase') {
      if (!wasErasing) {
        lastX = fx; lastY = fy;
        wasErasing = true;
      } else {
        drawLine(lastX, lastY, fx, fy, true);
        lastX = fx; lastY = fy;
      }
    } else {
      // Move mode: save any active stroke
      if (isDrawing)  { saveState(); isDrawing  = false; lastX = null; lastY = null; }
      if (wasErasing) { saveState(); wasErasing = false; lastX = null; lastY = null; }
    }

  } else {
    // No hand detected
    smoothX = -999; smoothY = -999;

    if (isDrawing)  { saveState(); isDrawing  = false; }
    if (wasErasing) { saveState(); wasErasing = false; }
    lastX = null; lastY = null;

    currentMode  = 'none';
    pendingMode  = 'none';
    pendingCount = 0;
    pillDraw.classList.remove('active');
    pillMove.classList.remove('active');
    pillErase.classList.remove('active');
    statusDot.className    = 'ready';
    statusText.textContent = 'Show your hand…';
  }
});

setStep('step-mp', true);

// ═══════════════════════════════════════════════════════════════════════════
// CAMERA START
// ═══════════════════════════════════════════════════════════════════════════

async function startCamera() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
      audio: false
    });
    video.srcObject = stream;
    setStep('step-cam', true);

    const camera = new Camera(video, {
      onFrame: async () => { await hands.send({ image: video }); },
      width: 640,
      height: 480
    });

    setStep('step-model', true);
    await camera.start();

    setTimeout(() => {
      overlay.classList.add('hidden');
      statusDot.className    = 'ready';
      statusText.textContent = 'Show your hand…';
    }, 600);

  } catch (err) {
    console.error(err);
    overlay.querySelector('.ov-sub').textContent    = 'Camera access denied — please allow camera';
    overlay.querySelector('.ov-spinner').style.display = 'none';
  }
}

window.addEventListener('load', () => setTimeout(startCamera, 500));
