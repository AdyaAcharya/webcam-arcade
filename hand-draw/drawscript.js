// ── CONFIG ──────────────────────────────────────────────────────────────────
const COLORS = [
  { name: 'Black',  hex: '#111111' },
  { name: 'White',  hex: '#ffffff' },
  { name: 'Red',    hex: '#f44336' },
  { name: 'Blue',   hex: '#2196f3' },
  { name: 'Green',  hex: '#4caf50' },
  { name: 'Yellow', hex: '#ffeb3b' },
  { name: 'Purple', hex: '#9c27b0' },
  { name: 'Orange', hex: '#ff9800' },
];
const MAX_HISTORY     = 20;
const PINCH_THRESHOLD = 40;

// ── STATE ────────────────────────────────────────────────────────────────────
let currentColor = '#111111';
let brushSize    = 6;
let isEraser     = false;
let isDrawing    = false;
let wasPinched   = false;
let cursorX = -999, cursorY = -999;
let lastX = null, lastY = null;
let history = [], future = [];

// ── ELEMENTS ─────────────────────────────────────────────────────────────────
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
const btnBrush   = document.getElementById('btn-brush');
const btnEraser  = document.getElementById('btn-eraser');
const sizeSlider = document.getElementById('brush-size-slider');
const sizeDot    = document.getElementById('size-dot');
const pinchLed   = document.getElementById('pinch-led');
const pinchText  = document.getElementById('pinch-text');
const pinchWrap  = document.getElementById('pinch-indicator');

// ── CANVAS RESIZE ─────────────────────────────────────────────────────────────
function resizeCanvas() {
  const TOOLBAR_H = 68;
  const w = window.innerWidth;
  const h = window.innerHeight - TOOLBAR_H;
  // Preserve current drawing
  const img = ctx.getImageData(0, 0, drawCanvas.width, drawCanvas.height);
  drawCanvas.width  = w;
  drawCanvas.height = h;
  ctx.putImageData(img, 0, 0);
}
resizeCanvas();
window.addEventListener('resize', resizeCanvas);

// ── COLOR PALETTE ─────────────────────────────────────────────────────────────
const palette = document.getElementById('color-palette');
COLORS.forEach(c => {
  const s = document.createElement('button');
  s.className = 'color-swatch';
  s.title = c.name;
  s.style.background = c.hex;
  if (c.hex === '#ffffff') s.style.border = '2.5px solid #444';
  s.dataset.hex = c.hex;
  if (c.hex === currentColor) s.classList.add('active');
  s.addEventListener('click', () => selectColor(c.hex, s));
  palette.appendChild(s);
});

function selectColor(hex, el) {
  currentColor = hex;
  isEraser = false;
  document.querySelectorAll('.color-swatch').forEach(x => x.classList.remove('active'));
  el.classList.add('active');
  btnBrush.classList.add('active');
  btnEraser.classList.remove('active');
  updateSizeDot();
}

// ── TOOL BUTTONS ──────────────────────────────────────────────────────────────
btnBrush.addEventListener('click', () => {
  isEraser = false;
  btnBrush.classList.add('active');
  btnEraser.classList.remove('active');
});
btnEraser.addEventListener('click', () => {
  isEraser = true;
  btnEraser.classList.add('active');
  btnBrush.classList.remove('active');
});

// ── SIZE SLIDER ───────────────────────────────────────────────────────────────
sizeSlider.addEventListener('input', () => {
  brushSize = parseInt(sizeSlider.value);
  updateSizeDot();
});

function updateSizeDot() {
  const s = Math.min(brushSize, 26);
  sizeDot.style.width      = s + 'px';
  sizeDot.style.height     = s + 'px';
  sizeDot.style.background = isEraser ? '#888' : currentColor;
}
updateSizeDot();

// ── UNDO / REDO ───────────────────────────────────────────────────────────────
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
  const prev = history.pop();
  loadState(prev);
  updateButtons();
}

function redo() {
  if (!future.length) return;
  history.push(drawCanvas.toDataURL());
  const next = future.pop();
  loadState(next);
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

// ── DRAWING ───────────────────────────────────────────────────────────────────
function drawLine(x1, y1, x2, y2) {
  ctx.save();
  ctx.globalCompositeOperation = isEraser ? 'destination-out' : 'source-over';
  ctx.strokeStyle = isEraser ? 'rgba(0,0,0,1)' : currentColor;
  ctx.lineWidth   = isEraser ? brushSize * 2.5 : brushSize;
  ctx.lineCap     = 'round';
  ctx.lineJoin    = 'round';
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.restore();
}

function drawCursor(x, y) {
  cursorX = x;
  cursorY = y;
}

// ── CURSOR OVERLAY CANVAS ─────────────────────────────────────────────────────
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
window.addEventListener('resize', resizeCursorCanvas);

// ── RENDER LOOP (cursor + pip) ─────────────────────────────────────────────────
function renderLoop() {
  cursorCtx.clearRect(0, 0, cursorCanvas.width, cursorCanvas.height);

  if (cursorX > 0) {
    const col = isEraser ? '#aaa' : currentColor;
    const r   = isEraser ? brushSize * 1.25 : brushSize * 0.5;

    // Outer ring
    cursorCtx.save();
    cursorCtx.strokeStyle = col;
    cursorCtx.lineWidth   = 1.5;
    cursorCtx.globalAlpha = 0.6;
    cursorCtx.beginPath();
    cursorCtx.arc(cursorX, cursorY, Math.max(r + 6, 12), 0, Math.PI * 2);
    cursorCtx.stroke();
    cursorCtx.restore();

    // Inner dot
    cursorCtx.save();
    cursorCtx.fillStyle   = col;
    cursorCtx.globalAlpha = wasPinched ? 1 : 0.85;
    cursorCtx.beginPath();
    cursorCtx.arc(cursorX, cursorY, 4, 0, Math.PI * 2);
    cursorCtx.fill();
    cursorCtx.restore();

    // Pinch ring pulse
    if (wasPinched) {
      cursorCtx.save();
      cursorCtx.strokeStyle = col;
      cursorCtx.lineWidth   = 2.5;
      cursorCtx.globalAlpha = 0.9;
      cursorCtx.beginPath();
      cursorCtx.arc(cursorX, cursorY, r + 3, 0, Math.PI * 2);
      cursorCtx.stroke();
      cursorCtx.restore();
    }
  }

  requestAnimationFrame(renderLoop);
}
renderLoop();

// ── MEDIAPIPE SETUP ───────────────────────────────────────────────────────────
function setStep(id, done) {
  const el = document.getElementById(id);
  el.querySelector('span').className   = done ? 'check' : 'wait';
  el.querySelector('span').textContent = done ? '✓' : '○';
}

function dist(a, b, W, H) {
  const dx = (a.x - b.x) * W;
  const dy = (a.y - b.y) * H;
  return Math.sqrt(dx * dx + dy * dy);
}

const hands = new Hands({
  locateFile: f => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${f}`
});
hands.setOptions({
  maxNumHands: 1,
  modelComplexity: 1,
  minDetectionConfidence: 0.7,
  minTrackingConfidence: 0.6
});

// ── HAND TRACKING RESULTS ─────────────────────────────────────────────────────
hands.onResults(results => {
  const W = pipCanvas.width;
  const H = pipCanvas.height;

  // Draw mirrored video to PIP
  pipCtx.save();
  pipCtx.scale(-1, 1);
  pipCtx.drawImage(results.image, -W, 0, W, H);
  pipCtx.restore();

  if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
    const lm = results.multiHandLandmarks[0];

    // Draw skeleton on PIP
    drawConnectors(pipCtx, lm, HAND_CONNECTIONS, { color: 'rgba(124,106,247,0.6)', lineWidth: 1.5 });
    drawLandmarks(pipCtx, lm, { color: '#f76a8a', lineWidth: 1, radius: 2 });

    const cW    = drawCanvas.width;
    const cH    = drawCanvas.height;
    const tip   = lm[8]; // index fingertip
    const thumb = lm[4]; // thumb tip

    const fx = (1 - tip.x) * cW;
    const fy = tip.y * cH;

    const d       = dist(tip, thumb, cW, cH);
    const pinched = d < PINCH_THRESHOLD;

    drawCursor(fx, fy);

    if (pinched && !wasPinched) {
      // Pinch start — begin stroke
      lastX = fx; lastY = fy;
      isDrawing  = true;
      wasPinched = true;
      pinchLed.classList.add('pinched');
      pinchWrap.classList.add('pinched');
      pinchText.textContent   = 'Pinched — drawing';
      statusDot.className     = 'drawing';
      statusText.textContent  = isEraser ? 'Erasing…' : 'Drawing…';

    } else if (pinched && wasPinched) {
      // Continue stroke
      if (lastX !== null) drawLine(lastX, lastY, fx, fy);
      lastX = fx; lastY = fy;

    } else if (!pinched && wasPinched) {
      // Release — save state
      saveState();
      isDrawing  = false;
      wasPinched = false;
      lastX = null; lastY = null;
      pinchLed.classList.remove('pinched');
      pinchWrap.classList.remove('pinched');
      pinchText.textContent  = 'Open hand — hover';
      statusDot.className    = 'ready';
      statusText.textContent = 'Hand detected';

    } else {
      wasPinched = false;
    }

  } else {
    // No hand detected
    cursorX = -999; cursorY = -999;
    if (wasPinched) { saveState(); wasPinched = false; lastX = null; lastY = null; }
    pinchLed.classList.remove('pinched');
    pinchWrap.classList.remove('pinched');
    pinchText.textContent  = 'No hand detected';
    statusDot.className    = 'ready';
    statusText.textContent = 'Show your hand…';
  }
});

setStep('step-mp', true);

// ── CAMERA START ──────────────────────────────────────────────────────────────
async function startCamera() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
      audio: false
    });
    video.srcObject = stream;
    setStep('step-cam', true);

    const camera = new Camera(video, {
      onFrame: async () => {
        await hands.send({ image: video });
      },
      width: 640,
      height: 480
    });

    setStep('step-model', true);
    await camera.start();

    // Hide overlay after camera starts
    setTimeout(() => {
      overlay.classList.add('hidden');
      statusDot.className    = 'ready';
      statusText.textContent = 'Show your hand…';
    }, 600);

  } catch (err) {
    console.error(err);
    overlay.querySelector('.ov-sub').textContent     = 'Camera access denied — please allow camera';
    overlay.querySelector('.ov-spinner').style.display = 'none';
  }
}

// Wait for MediaPipe to be ready, then start
window.addEventListener('load', () => {
  setTimeout(startCamera, 500);
});

// ── PIP CANVAS SIZE ───────────────────────────────────────────────────────────
pipCanvas.width  = 220;
pipCanvas.height = 165;
