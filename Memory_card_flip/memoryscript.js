const SYMBOLS = ["🐶", "🐱", "🦊", "🐸", "🦋", "🌸", "⭐", "🍕"];
let deck = [], flipped = [], moves = 0, matched = 0, seconds = 0, timerInt = null, timerOn = false, locked = false;
let hoverIdx = -1, hoverStart = 0, hoverTimer = null;
const HOLD_MS = 900;

function shuffle(a) {
  const r = [...a];
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [r[i], r[j]] = [r[j], r[i]];
  }
  return r;
}

function createDeck() {
  return shuffle([...SYMBOLS, ...SYMBOLS]).map((e, i) => ({
    id: i,
    emoji: e,
    isFlipped: false,
    isMatched: false
  }));
}

function fmt(s) {
  return `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;
}

function buildBoard() {
  const b = document.getElementById('board');
  b.innerHTML = '';
  deck.forEach((card, i) => {
    const el = document.createElement('div');
    el.className = 'card';
    el.dataset.id = i;
    el.innerHTML = `<div class="card-face card-back">?</div><div class="card-face card-front">${card.emoji}</div><svg class="progress-ring" viewBox="0 0 42 42"><circle cx="21" cy="21" r="18" fill="none" stroke="#a78bfa" stroke-width="3" stroke-dasharray="113" stroke-dashoffset="113" stroke-linecap="round" style="transform:rotate(-90deg);transform-origin:center" id="ring-${i}"/></svg>`;
    b.appendChild(el);
  });
}

function flipCard(idx) {
  if (locked) return;
  const card = deck[idx];
  if (card.isFlipped || card.isMatched) return;
  if (flipped.length >= 2) return;
  if (!timerOn) {
    timerOn = true;
    timerInt = setInterval(() => {
      seconds++;
      document.getElementById('timer').textContent = fmt(seconds);
    }, 1000);
  }
  card.isFlipped = true;
  const el = document.querySelector(`[data-id="${idx}"]`);
  el.classList.add('flipped');
  flipped.push(idx);
  moves++;
  document.getElementById('moves').textContent = moves;
  if (flipped.length === 2) {
    locked = true;
    setTimeout(checkMatch, 700);
  }
}

function checkMatch() {
  const [ai, bi] = flipped;
  const a = deck[ai], b = deck[bi];
  if (a.emoji === b.emoji) {
    a.isMatched = b.isMatched = true;
    document.querySelector(`[data-id="${ai}"]`).classList.add('matched');
    document.querySelector(`[data-id="${bi}"]`).classList.add('matched');
    matched++;
    document.getElementById('pairs').textContent = `${matched}/8`;
    flipped = [];
    locked = false;
    if (matched === 8) setTimeout(showWin, 400);
  } else {
    const eA = document.querySelector(`[data-id="${ai}"]`), eB = document.querySelector(`[data-id="${bi}"]`);
    eA.classList.add('shake');
    eB.classList.add('shake');
    setTimeout(() => {
      a.isFlipped = b.isFlipped = false;
      eA.classList.remove('flipped', 'shake');
      eB.classList.remove('flipped', 'shake');
      flipped = [];
      locked = false;
    }, 500);
  }
}

function showWin() {
  clearInterval(timerInt);
  document.getElementById('win-info').textContent = `${moves} moves · ${fmt(seconds)}`;
  document.getElementById('win-wrap').classList.add('show');
  document.getElementById('game-area').style.display = 'none';
  document.getElementById('hint').style.display = 'none';
}

function newGame() {
  clearInterval(timerInt);
  deck = createDeck();
  flipped = [];
  moves = 0;
  matched = 0;
  seconds = 0;
  timerOn = false;
  locked = false;
  hoverIdx = -1;
  document.getElementById('moves').textContent = '0';
  document.getElementById('timer').textContent = '00:00';
  document.getElementById('pairs').textContent = '0/8';
  document.getElementById('win-wrap').classList.remove('show');
  document.getElementById('game-area').style.display = 'flex';
  document.getElementById('hint').style.display = 'block';
  buildBoard();
}

let handsReady = false;

async function startGame() {
  document.getElementById('start-screen').style.display = 'none';
  document.getElementById('status-bar').style.display = 'flex';
  document.getElementById('hint').style.display = 'block';
  document.getElementById('game-area').style.display = 'flex';
  newGame();
  await initCamera();
}

async function initCamera() {
  const video = document.getElementById('webcam');
  const canvas = document.getElementById('overlay');
  const ctx = canvas.getContext('2d');
  const dot = document.getElementById('finger-dot');
  const camWrap = document.getElementById('cam-wrap');

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: 320,
        height: 240,
        facingMode: 'user'
      }
    });
    video.srcObject = stream;
    await new Promise(r => video.onloadedmetadata = r);
    canvas.width = video.videoWidth || 320;
    canvas.height = video.videoHeight || 240;
  } catch (e) {
    document.getElementById('hint').textContent = 'Camera not available. Click cards to play instead.';
    document.getElementById('board').addEventListener('click', e => {
      const c = e.target.closest('.card');
      if (c) flipCard(parseInt(c.dataset.id));
    });
    return;
  }

  dot.style.display = 'block';

  const hands = new Hands({
    locateFile: f => `https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240/${f}`
  });
  hands.setOptions({
    maxNumHands: 1,
    modelComplexity: 0,
    minDetectionConfidence: 0.7,
    minTrackingConfidence: 0.6
  });

  hands.onResults(results => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!results.multiHandLandmarks || results.multiHandLandmarks.length === 0) {
      dot.style.display = 'none';
      clearHover();
      return;
    }
    dot.style.display = 'block';
    const lm = results.multiHandLandmarks[0];
    const tip = lm[8];

    const absX = (1 - tip.x) * window.innerWidth;
    const absY = tip.y * window.innerHeight;

    dot.style.left = absX + 'px';
    dot.style.top = absY + 'px';

    ctx.beginPath();
    ctx.arc(tip.x * canvas.width, tip.y * canvas.height, 6, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(167,139,250,0.8)';
    ctx.fill();

    const cardEls = document.querySelectorAll('.card');
    let found = -1;
    cardEls.forEach(el => {
      const r = el.getBoundingClientRect();
      if (absX >= r.left && absX <= r.right && absY >= r.top && absY <= r.bottom) {
        found = parseInt(el.dataset.id);
      }
    });
    handleHover(found);
  });

  const camera = new Camera(video, {
    onFrame: async () => {
      await hands.send({
        image: video
      });
    },
    width: 320,
    height: 240
  });
  camera.start();
}

function clearHover() {
  if (hoverIdx >= 0) {
    const el = document.querySelector(`[data-id="${hoverIdx}"]`);
    if (el) {
      el.classList.remove('hover-ring');
      const r = document.getElementById(`ring-${hoverIdx}`);
      if (r) r.style.strokeDashoffset = '113';
    }
    hoverIdx = -1;
  }
  if (hoverTimer) {
    clearInterval(hoverTimer);
    hoverTimer = null;
  }
}

function handleHover(idx) {
  if (idx === hoverIdx) return;
  clearHover();
  if (idx < 0) return;
  const card = deck[idx];
  if (!card || card.isFlipped || card.isMatched) return;
  hoverIdx = idx;
  hoverStart = Date.now();
  const el = document.querySelector(`[data-id="${idx}"]`);
  if (!el) return;
  el.classList.add('hover-ring');
  const ring = document.getElementById(`ring-${idx}`);
  if (ring) {
    ring.closest('svg').classList.add('show');
  }
  let prog = 0;
  hoverTimer = setInterval(() => {
    const elapsed = Date.now() - hoverStart;
    prog = Math.min(elapsed / HOLD_MS, 1);
    if (ring) ring.style.strokeDashoffset = (113 * (1 - prog)).toFixed(1);
    if (prog >= 1) {
      clearInterval(hoverTimer);
      hoverTimer = null;
      el.classList.remove('hover-ring');
      if (ring) ring.closest('svg').classList.remove('show');
      hoverIdx = -1;
      flipCard(idx);
    }
  }, 30);
}