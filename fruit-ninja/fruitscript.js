// ─── CANVAS ──────────────────────────────────────────────────────────────────
const canvas = document.getElementById('gameCanvas');
const ctx    = canvas.getContext('2d');
const video  = document.getElementById('webcam');

function resize() {
  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight;
}
resize();
window.addEventListener('resize', resize);

// ─── STATE ───────────────────────────────────────────────────────────────────
let score        = 0;
let highScore    = parseInt(localStorage.getItem('fn-hs') || '0');
let lives        = 3, level = 1, lastLevel = 1;
let fruits       = [], halves = [], particles = [], floatTexts = [];
let spawnTimer   = 0, spawnInterval = 90, spawnCount = 0;
let lastSliceTime= 0, comboCount = 0;
let totalSliced  = 0, totalMissed = 0;
let gameRunning  = false;
let shakeAmt     = 0;

// ─── HAND TRAIL ──────────────────────────────────────────────────────────────
const TRAIL_MAX   = 10;
let trail         = [];
let fingerVisible = false;

// ─── FRUIT TYPES ─────────────────────────────────────────────────────────────
const FRUITS = [
  { emoji: '🍉', color: '#e8313a', juice: '#ff6b6b' },
  { emoji: '🍊', color: '#ff8c00', juice: '#ffb347' },
  { emoji: '🍎', color: '#cc2200', juice: '#ff4444' },
  { emoji: '🍌', color: '#ffe135', juice: '#fff176' },
  { emoji: '🍍', color: '#c8a82d', juice: '#ffe57a' },
  { emoji: '🍓', color: '#e8003d', juice: '#ff6b8a' },
];

// ─── MEDIAPIPE HANDS ─────────────────────────────────────────────────────────
const hands = new Hands({
  locateFile: f => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${f}`
});

hands.setOptions({
  maxNumHands: 1,
  modelComplexity: 1,
  minDetectionConfidence: 0.65,
  minTrackingConfidence: 0.65,
});

hands.onResults(results => {
  if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
    const lm  = results.multiHandLandmarks[0];
    const tip = lm[8]; // index finger tip

    /*
      MediaPipe coords: tip.x=0 → left of video, tip.x=1 → right.
      We draw the video MIRRORED on canvas, so we also mirror X:
        canvasX = (1 - tip.x) * canvas.width
        canvasY =  tip.y      * canvas.height
    */
    const cx = (1 - tip.x) * canvas.width;
    const cy =      tip.y   * canvas.height;

    trail.push({ x: cx, y: cy });
    if (trail.length > TRAIL_MAX) trail.shift();
    fingerVisible = true;
  } else {
    fingerVisible = false;
    if (trail.length > 0) trail.shift();
  }
});

// ─── CAMERA ──────────────────────────────────────────────────────────────────
function startCamera() {
  const cam = new Camera(video, {
    onFrame: async () => { await hands.send({ image: video }); },
    width:  1280,
    height: 720,
  });

  cam.start()
    .then(() => {
      document.getElementById('loading-screen').style.display = 'none';
      document.getElementById('start-screen').style.display  = 'flex';
    })
    .catch(err => {
      document.getElementById('loading-screen').innerHTML = `
        <div class="loading-error-title">Camera Error</div>
        <div class="loading-error-msg">${err.message}</div>
        <button class="btn-primary loading-retry" onclick="location.reload()">Retry</button>`;
    });
}

// ─── SWIPE VELOCITY ──────────────────────────────────────────────────────────
function swipeVelocity() {
  if (trail.length < 4) return 0;
  const a = trail[trail.length - 4];
  const b = trail[trail.length - 1];
  return Math.hypot(b.x - a.x, b.y - a.y);
}

// ─── LINE–CIRCLE INTERSECTION ────────────────────────────────────────────────
function lineHitsCircle(ax, ay, bx, by, cx, cy, r) {
  const dx = bx - ax, dy = by - ay;
  const fx = ax - cx, fy = ay - cy;
  const a  = dx * dx + dy * dy;
  if (a === 0) return Math.hypot(fx, fy) < r;
  const bv   = 2 * (fx * dx + fy * dy);
  const c    = fx * fx + fy * fy - r * r;
  const disc = bv * bv - 4 * a * c;
  if (disc < 0) return false;
  const sq = Math.sqrt(disc);
  const t1 = (-bv - sq) / (2 * a);
  const t2 = (-bv + sq) / (2 * a);
  return (t1 >= 0 && t1 <= 1) || (t2 >= 0 && t2 <= 1);
}

// ─── SPAWN ───────────────────────────────────────────────────────────────────
function spawnObject() {
  spawnCount++;
  const isBomb = spawnCount % 8 === 0;
  const r    = isBomb ? 30 : 36;
  const x    = r + Math.random() * (canvas.width - 2 * r);
  const vy   = -(13 + Math.random() * 6);
  const vx   = (Math.random() - 0.5) * 4;
  const type = FRUITS[Math.floor(Math.random() * FRUITS.length)];
  fruits.push({
    x, y: canvas.height + r,
    vx, vy, r, rot: 0,
    rotSpeed: (Math.random() - 0.5) * 6,
    isBomb, type, fuse: 0, sliced: false,
  });
}

function updateSpawnInterval() {
  spawnInterval = Math.max(36, 90 - (level - 1) * 10);
}

// ─── SLICE ───────────────────────────────────────────────────────────────────
function sliceFruit(f) {
  f.sliced = true;

  if (f.isBomb) {
    triggerLifeLoss(true);
    addFloatText('💥 BOOM!', f.x, f.y, '#ff4444');
    return;
  }

  totalSliced++;
  const now  = Date.now();
  comboCount = (now - lastSliceTime < 2000) ? comboCount + 1 : 1;
  lastSliceTime = now;

  const pts = comboCount >= 3 ? 10 * comboCount : 10;
  score += pts;
  if (score > highScore) {
    highScore = score;
    localStorage.setItem('fn-hs', highScore);
  }

  if (comboCount >= 3) addFloatText(`COMBO x${comboCount}! +${pts}`, f.x, f.y - 50, '#ffd700');
  else                 addFloatText(`+${pts}`, f.x, f.y, '#fff');

  checkLevelUp();
  updateHUD();

  // Halves
  for (const side of [-1, 1]) {
    halves.push({
      x: f.x, y: f.y, r: f.r, rot: f.rot, type: f.type,
      side, vx: side * (2 + Math.random() * 2), vy: -5,
      rotSpeed: side * 5, life: 1,
    });
  }

  // Juice particles
  for (let i = 0; i < 10; i++) {
    const a = Math.random() * Math.PI * 2;
    const s = 2 + Math.random() * 5;
    particles.push({
      x: f.x, y: f.y,
      vx: Math.cos(a) * s, vy: Math.sin(a) * s,
      color: f.type.juice, life: 1, r: 3 + Math.random() * 4,
    });
  }
}

// ─── LIFE / LEVEL ─────────────────────────────────────────────────────────────
function triggerLifeLoss(isBomb) {
  lives = Math.max(0, lives - 1);
  updateHUD();
  shakeAmt = isBomb ? 14 : 8;
  flashVignette(isBomb ? 'rgba(255,0,0,0.45)' : 'rgba(220,50,50,0.3)');
  if (lives <= 0) setTimeout(endGame, 500);
}

function flashVignette(color) {
  const v = document.getElementById('vignette');
  v.style.boxShadow = `inset 0 0 140px ${color}`;
  v.style.opacity   = '1';
  setTimeout(() => { v.style.opacity = '0'; }, 400);
}

function checkLevelUp() {
  const newLevel = Math.floor(score / 60) + 1;
  if (newLevel > level) {
    level = newLevel;
    updateSpawnInterval();
    if (level > lastLevel) { lastLevel = level; showLevelUp(); }
  }
}

function showLevelUp() {
  const el = document.getElementById('levelup-banner');
  el.textContent = `LEVEL ${level} 🔥`;
  el.style.transform = 'translate(-50%,-50%) scale(1)';
  el.style.opacity   = '1';
  setTimeout(() => {
    el.style.transform = 'translate(-50%,-50%) scale(0)';
    el.style.opacity   = '0';
  }, 1400);
}

function addFloatText(text, x, y, color) {
  floatTexts.push({ text, x, y, color, life: 1, vy: -1.8 });
}

// ─── HUD ─────────────────────────────────────────────────────────────────────
function updateHUD() {
  document.getElementById('hud-score').textContent     = score;
  document.getElementById('hud-highscore').textContent = highScore;
  const h = ['', '❤️', '❤️❤️', '❤️❤️❤️'];
  document.getElementById('hud-lives').textContent = h[Math.max(0, lives)];
}

// ─── DRAW ─────────────────────────────────────────────────────────────────────
function lighten(hex) {
  const r = Math.min(255, parseInt(hex.slice(1, 3), 16) + 60);
  const g = Math.min(255, parseInt(hex.slice(3, 5), 16) + 60);
  const b = Math.min(255, parseInt(hex.slice(5, 7), 16) + 60);
  return `rgb(${r},${g},${b})`;
}

function drawCamera() {
  // Mirror the video horizontally so it acts as a selfie mirror
  ctx.save();
  ctx.translate(canvas.width, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  ctx.restore();

  // Subtle dark overlay so game objects pop against the background
  ctx.fillStyle = 'rgba(0,0,10,0.25)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

function drawFruit(f) {
  ctx.save();
  ctx.translate(f.x, f.y);
  ctx.rotate(f.rot * Math.PI / 180);

  if (f.isBomb) {
    const g = ctx.createRadialGradient(0, 0, 4, 0, 0, f.r);
    g.addColorStop(0, '#666'); g.addColorStop(1, '#111');
    ctx.beginPath(); ctx.arc(0, 0, f.r, 0, Math.PI * 2);
    ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = '#444'; ctx.lineWidth = 2; ctx.stroke();
    f.fuse += 0.1;
    ctx.beginPath(); ctx.moveTo(0, -f.r);
    ctx.quadraticCurveTo(8, -f.r - 14, 4, -f.r - 22);
    ctx.strokeStyle = '#999'; ctx.lineWidth = 2; ctx.stroke();
    ctx.beginPath();
    ctx.arc(
      4 + Math.sin(f.fuse * 8) * 3,
      -f.r - 22 + Math.cos(f.fuse * 6) * 3,
      4, 0, Math.PI * 2
    );
    ctx.fillStyle = `hsl(${40 + Math.sin(f.fuse * 10) * 20},100%,60%)`;
    ctx.fill();
  } else {
    const g = ctx.createRadialGradient(-f.r * 0.3, -f.r * 0.3, 2, 0, 0, f.r);
    g.addColorStop(0, lighten(f.type.color));
    g.addColorStop(1, f.type.color);
    ctx.beginPath(); ctx.arc(0, 0, f.r, 0, Math.PI * 2);
    ctx.fillStyle = g; ctx.fill();
    ctx.beginPath(); ctx.arc(-f.r * 0.28, -f.r * 0.28, f.r * 0.28, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.22)'; ctx.fill();
    ctx.font = `${f.r * 1.15}px serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(f.type.emoji, 0, 2);
  }
  ctx.restore();
}

function drawHalf(h) {
  ctx.save();
  ctx.globalAlpha = h.life;
  ctx.translate(h.x, h.y);
  ctx.rotate(h.rot * Math.PI / 180);
  ctx.beginPath();
  ctx.arc(0, 0, h.r, h.side === -1 ? Math.PI : 0, h.side === -1 ? Math.PI * 2 : Math.PI);
  const g = ctx.createRadialGradient(0, 0, 2, 0, 0, h.r);
  g.addColorStop(0, lighten(h.type.color)); g.addColorStop(1, h.type.color);
  ctx.fillStyle = g; ctx.fill();
  ctx.beginPath(); ctx.moveTo(0, -h.r); ctx.lineTo(0, h.r);
  ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 2; ctx.stroke();
  ctx.restore();
}

function drawTrail() {
  if (trail.length < 2) return;
  const vel       = swipeVelocity();
  const isSwiping = vel > 18;

  // Finger dot — always visible when hand is detected
  if (fingerVisible && trail.length > 0) {
    const tip = trail[trail.length - 1];
    ctx.beginPath();
    ctx.arc(tip.x, tip.y, isSwiping ? 9 : 7, 0, Math.PI * 2);
    ctx.fillStyle = isSwiping ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.55)';
    ctx.fill();

    if (isSwiping) {
      // Outer glow ring
      ctx.beginPath();
      ctx.arc(tip.x, tip.y, 20, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(80,210,255,0.45)';
      ctx.lineWidth   = 3;
      ctx.stroke();
    }
  }

  if (!isSwiping || trail.length < 3) return;

  // Blade trail
  for (let i = 1; i < trail.length; i++) {
    const t = i / trail.length;
    const a = trail[i - 1], b = trail[i];
    // White core
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
    ctx.strokeStyle = `rgba(255,255,255,${t * 0.93})`;
    ctx.lineWidth   = 1 + t * 5;
    ctx.lineCap     = 'round';
    ctx.stroke();
    // Cyan glow
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
    ctx.strokeStyle = `rgba(80,200,255,${t * 0.32})`;
    ctx.lineWidth   = 3 + t * 18;
    ctx.stroke();
  }
}

function drawParticles() {
  particles.forEach(p => {
    ctx.save();
    ctx.globalAlpha = p.life;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r * p.life, 0, Math.PI * 2);
    ctx.fillStyle = p.color;
    ctx.fill();
    ctx.restore();
  });
}

function drawFloatTexts() {
  floatTexts.forEach(ft => {
    ctx.save();
    ctx.globalAlpha = ft.life;
    ctx.font = "bold 22px 'Bangers', cursive";
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle    = ft.color;
    ctx.shadowColor  = 'rgba(0,0,0,0.9)';
    ctx.shadowBlur   = 8;
    ctx.fillText(ft.text, ft.x, ft.y);
    ctx.restore();
  });
}

// ─── UPDATE ───────────────────────────────────────────────────────────────────
function update() {
  if (gameRunning) {
    spawnTimer++;
    if (spawnTimer >= spawnInterval) { spawnTimer = 0; spawnObject(); }
  }

  const vel       = swipeVelocity();
  const isSwiping = vel > 18;

  fruits = fruits.filter(f => {
    if (f.sliced) return false;
    f.vy += 0.35; f.x += f.vx; f.y += f.vy; f.rot += f.rotSpeed;

    if (gameRunning && isSwiping && trail.length >= 2) {
      for (let i = 1; i < trail.length; i++) {
        if (lineHitsCircle(
          trail[i - 1].x, trail[i - 1].y,
          trail[i].x,     trail[i].y,
          f.x, f.y, f.r
        )) {
          sliceFruit(f);
          return false;
        }
      }
    }

    if (f.y > canvas.height + f.r * 2) {
      if (gameRunning && !f.isBomb) { totalMissed++; triggerLifeLoss(false); }
      return false;
    }
    return true;
  });

  halves.forEach(h => {
    h.vy += 0.4; h.x += h.vx; h.y += h.vy;
    h.rot += h.rotSpeed; h.life -= 0.03;
  });
  halves = halves.filter(h => h.life > 0);

  particles.forEach(p => {
    p.x += p.vx; p.y += p.vy;
    p.vy += 0.2; p.life -= 0.035;
  });
  particles = particles.filter(p => p.life > 0);

  floatTexts.forEach(ft => { ft.y += ft.vy; ft.life -= 0.022; });
  floatTexts = floatTexts.filter(ft => ft.life > 0);

  shakeAmt *= 0.78;
}

// ─── RENDER ───────────────────────────────────────────────────────────────────
function render() {
  ctx.save();
  if (shakeAmt > 0.5) {
    ctx.translate(
      (Math.random() - 0.5) * shakeAmt,
      (Math.random() - 0.5) * shakeAmt
    );
  }

  drawCamera();                   // full-screen mirrored webcam
  halves.forEach(drawHalf);
  fruits.forEach(drawFruit);
  drawParticles();
  drawTrail();                    // finger dot + blade trail on top
  drawFloatTexts();

  ctx.restore();
}

// ─── LOOP ────────────────────────────────────────────────────────────────────
function loop() {
  update();
  render();
  requestAnimationFrame(loop);
}

// ─── START / END ─────────────────────────────────────────────────────────────
function startGame() {
  score = 0; lives = 3; level = 1; lastLevel = 1;
  fruits = []; halves = []; particles = []; floatTexts = []; trail = [];
  spawnTimer = 0; spawnCount = 0; comboCount = 0; lastSliceTime = 0;
  totalSliced = 0; totalMissed = 0; spawnInterval = 90; shakeAmt = 0;
  gameRunning = true;

  document.getElementById('start-screen').style.display    = 'none';
  document.getElementById('gameover-screen').style.display = 'none';
  updateHUD();
}

function endGame() {
  gameRunning = false;
  const total = totalSliced + totalMissed;
  const acc   = total > 0 ? Math.round(totalSliced / total * 100) : 0;
  document.getElementById('go-score').textContent  = score;
  document.getElementById('go-best').textContent   = highScore;
  document.getElementById('go-level').textContent  = level;
  document.getElementById('go-sliced').textContent = totalSliced;
  document.getElementById('go-missed').textContent = totalMissed;
  document.getElementById('go-acc').textContent    = acc + '%';
  document.getElementById('gameover-screen').style.display = 'flex';
}

function goLobby() {
  window.location.href = '../index.html';
}

// ─── INIT ─────────────────────────────────────────────────────────────────────
startCamera();
loop();
