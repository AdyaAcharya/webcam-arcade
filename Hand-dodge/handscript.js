// =============================================
//  HANDDODGE — TensorFlow.js HandPose Game
// =============================================

// --- Canvas & Context ---
const gameCanvas = document.getElementById('gameCanvas');
const ctx        = gameCanvas.getContext('2d');
const W          = gameCanvas.width;
const H          = gameCanvas.height;

const video   = document.getElementById('webcam');
const handCvs = document.getElementById('handCanvas');
const hCtx    = handCvs.getContext('2d');

// --- UI Refs ---
const scoreDisplay   = document.getElementById('scoreDisplay');
const bestDisplay    = document.getElementById('bestDisplay');
const livesDisplay   = document.getElementById('lives-display');
const levelDisplay   = document.getElementById('levelDisplay');
const startBtn       = document.getElementById('startBtn');
const restartBtn     = document.getElementById('restartBtn');
const startScreen    = document.getElementById('startScreen');
const gameOverScreen = document.getElementById('gameOverScreen');
const loadingFill    = document.getElementById('loadingFill');
const loadingText    = document.getElementById('loadingText');
const camStatus      = document.getElementById('camStatus');
const modelStatus    = document.getElementById('modelStatus');
const handStatus     = document.getElementById('handStatus');
const xPosStatus     = document.getElementById('xPosStatus');
const finalScore     = document.getElementById('finalScore');
const gameOverMsg    = document.getElementById('gameOverMsg');

// --- State ---
let handModel    = null;
let handX        = W / 2, handY = H / 2; // smoothed position
let rawHandX     = W / 2, rawHandY = H / 2;
let handDetected = false;
let animId       = null;
let gameRunning  = false;
let score        = 0, lives = 3, level = 1, bestScore = 0;
let frameCount   = 0;
let obstacles    = [];
let particles    = [];
let player       = { x: W / 2, y: H / 2, r: 18, trail: [] };
let hitFlash     = 0;
let detectionInterval = null;

// ---- Camera Setup ----
async function setupCamera() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 320, height: 240 } });
    video.srcObject = stream;
    await new Promise(r => video.onloadedmetadata = r);
    handCvs.width  = video.videoWidth;
    handCvs.height = video.videoHeight;
    camStatus.textContent = 'OK';
    camStatus.className   = 'status-val ok';
    return true;
  } catch (e) {
    camStatus.textContent = 'ERROR';
    camStatus.className   = 'status-val bad';
    return false;
  }
}

// ---- Load HandPose Model ----
async function loadModel() {
  try {
    loadingFill.style.width = '30%';
    handModel = await handpose.load();
    loadingFill.style.width    = '100%';
    modelStatus.textContent    = 'Ready';
    modelStatus.className      = 'status-val ok';
    loadingText.textContent    = 'READY — PRESS START';
    startBtn.disabled          = false;
  } catch (e) {
    modelStatus.textContent = 'Failed';
    modelStatus.className   = 'status-val bad';
    loadingText.textContent = 'MODEL LOAD FAILED';
  }
}

// ---- Hand Detection (runs on interval for performance) ----
async function detectHand() {
  if (!handModel || !gameRunning) return;
  try {
    const predictions = await handModel.estimateHands(video);
    if (predictions.length > 0) {
      const kp = predictions[0].landmarks;

      // Use palm center (average of landmarks 0,5,9,13,17)
      const palmIdx = [0, 5, 9, 13, 17];
      let sx = 0, sy = 0;
      palmIdx.forEach(i => { sx += kp[i][0]; sy += kp[i][1]; });
      sx /= palmIdx.length;
      sy /= palmIdx.length;

      // Map from video space to game canvas space (mirrored)
      rawHandX = (1 - sx / video.videoWidth)  * W;
      rawHandY = (sy / video.videoHeight) * H;

      handDetected           = true;
      handStatus.textContent = 'Detected';
      handStatus.className   = 'status-val ok';
      xPosStatus.textContent = Math.round(rawHandX);

      // Draw landmarks on hand canvas overlay
      drawHandLandmarks(kp, predictions[0].annotations);
    } else {
      handDetected           = false;
      handStatus.textContent = 'None';
      handStatus.className   = 'status-val bad';
      hCtx.clearRect(0, 0, handCvs.width, handCvs.height);
    }
  } catch (e) { /* silently ignore detection errors */ }
}

// ---- Draw Hand Landmarks on Webcam Overlay ----
function drawHandLandmarks(landmarks, annotations) {
  hCtx.clearRect(0, 0, handCvs.width, handCvs.height);

  const connections = [
    ['thumb',        [0, 1, 2, 3, 4]],
    ['indexFinger',  [0, 5, 6, 7, 8]],
    ['middleFinger', [0, 9, 10, 11, 12]],
    ['ringFinger',   [0, 13, 14, 15, 16]],
    ['pinky',        [0, 17, 18, 19, 20]]
  ];

  const colors = ['#ff3e6c', '#00ffe7', '#ffd700', '#aa88ff', '#55ffaa'];

  // Draw finger connections
  connections.forEach(([name, indices], ci) => {
    hCtx.beginPath();
    hCtx.strokeStyle  = colors[ci];
    hCtx.lineWidth    = 1.5;
    hCtx.globalAlpha  = 0.7;
    indices.forEach((lmIdx, i) => {
      const [lx, ly] = landmarks[lmIdx];
      const mx = handCvs.width - lx; // mirror for display
      i === 0 ? hCtx.moveTo(mx, ly) : hCtx.lineTo(mx, ly);
    });
    hCtx.stroke();
  });

  // Draw landmark dots
  landmarks.forEach(([lx, ly], i) => {
    const mx = handCvs.width - lx;
    hCtx.globalAlpha = 1;
    hCtx.beginPath();
    hCtx.arc(mx, ly, i === 0 ? 4 : 2.5, 0, Math.PI * 2);
    hCtx.fillStyle = i === 0 ? '#00ffe7' : '#ffffff';
    hCtx.fill();
  });

  hCtx.globalAlpha = 1;
}

// ---- Obstacle Factory ----
function spawnObstacle() {
  const types  = ['rect', 'rect', 'circle', 'diamond'];
  const type   = types[Math.floor(Math.random() * types.length)];
  const size   = 20 + Math.random() * 30;
  const speed  = 2.5 + level * 0.5 + Math.random() * 1.5;
  const colors = ['#ff3e6c', '#ff8c00', '#cc44ff', '#ff5555'];
  return {
    x: W + size,
    y: 30 + Math.random() * (H - 60),
    size, speed, type,
    color: colors[Math.floor(Math.random() * colors.length)],
    hit: false
  };
}

// ---- Particle System ----
function spawnParticles(x, y, color, count = 12) {
  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 / count) * i + Math.random() * 0.5;
    const speed = 1.5 + Math.random() * 3;
    particles.push({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 1,
      decay: 0.025 + Math.random() * 0.03,
      r: 2 + Math.random() * 4,
      color
    });
  }
}

// ---- Draw: Background & Grid ----
function drawBackground() {
  ctx.fillStyle = '#060d14';
  ctx.fillRect(0, 0, W, H);

  // Grid lines
  ctx.strokeStyle = '#0a1e2e';
  ctx.lineWidth   = 1;
  for (let x = 0; x < W; x += 50) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
  }
  for (let y = 0; y < H; y += 50) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
  }

  // Red flash on hit
  if (hitFlash > 0) {
    ctx.fillStyle = `rgba(255,62,108,${hitFlash * 0.3})`;
    ctx.fillRect(0, 0, W, H);
    hitFlash -= 0.05;
  }
}

// ---- Draw: Player ----
function drawPlayer() {
  const { x, y, r, trail } = player;

  // Motion trail
  trail.forEach((t, i) => {
    ctx.beginPath();
    ctx.arc(t.x, t.y, r * (i / trail.length) * 0.7, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(0,255,231,${(i / trail.length) * 0.15})`;
    ctx.fill();
  });

  // Outer glow ring
  ctx.beginPath();
  ctx.arc(x, y, r + 6, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(0,255,231,0.15)';
  ctx.lineWidth   = 8;
  ctx.stroke();

  // Outer ring
  ctx.beginPath();
  ctx.arc(x, y, r + 2, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(0,255,231,0.6)';
  ctx.lineWidth   = 1.5;
  ctx.stroke();

  // Core gradient
  const grad = ctx.createRadialGradient(x - 4, y - 4, 2, x, y, r);
  grad.addColorStop(0, '#aaffee');
  grad.addColorStop(1, '#00c9a7');
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = grad;
  ctx.fill();

  // Inner highlight
  ctx.beginPath();
  ctx.arc(x - 5, y - 5, r * 0.3, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  ctx.fill();
}

// ---- Draw: Obstacles ----
function drawObstacles() {
  obstacles.forEach(ob => {
    ctx.save();
    ctx.translate(ob.x, ob.y);
    ctx.shadowColor = ob.color;
    ctx.shadowBlur  = 12;
    ctx.fillStyle   = ob.color;
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.lineWidth   = 1;

    if (ob.type === 'circle') {
      ctx.beginPath();
      ctx.arc(0, 0, ob.size / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    } else if (ob.type === 'diamond') {
      const s = ob.size / 2;
      ctx.beginPath();
      ctx.moveTo(0, -s); ctx.lineTo(s, 0);
      ctx.lineTo(0, s);  ctx.lineTo(-s, 0);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else {
      // rect
      const s = ob.size;
      ctx.fillRect(-s / 2, -s / 2, s, s);
      ctx.strokeRect(-s / 2, -s / 2, s, s);
    }
    ctx.restore();
  });
}

// ---- Draw: Particles ----
function drawParticles() {
  particles.forEach(p => {
    ctx.globalAlpha = p.life;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r * p.life, 0, Math.PI * 2);
    ctx.fillStyle = p.color;
    ctx.fill();
  });
  ctx.globalAlpha = 1;
}

// ---- Draw: HUD Overlays on Canvas ----
function drawHUD() {
  // Score watermark
  ctx.font      = 'bold 80px Orbitron, monospace';
  ctx.fillStyle = 'rgba(0,255,231,0.03)';
  ctx.textAlign = 'center';
  ctx.fillText(score, W / 2, H / 2 + 30);

  // Speed / level indicator
  const spd = (2.5 + level * 0.5).toFixed(1);
  ctx.font      = '11px Share Tech Mono, monospace';
  ctx.fillStyle = 'rgba(0,255,231,0.3)';
  ctx.textAlign = 'right';
  ctx.fillText(`SPD ${spd}  LVL ${level}`, W - 10, H - 10);

  // Hand-not-detected warning
  if (!handDetected && gameRunning) {
    ctx.font      = 'bold 13px Orbitron, monospace';
    ctx.fillStyle = '#ff3e6c';
    ctx.textAlign = 'center';
    ctx.fillText('⚠ SHOW YOUR HAND', W / 2, 24);
  }
}

// ---- Collision Detection ----
function checkCollision(ob) {
  const dx   = player.x - ob.x;
  const dy   = player.y - ob.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  return dist < (ob.size / 2) + player.r - 5;
}

// ---- Main Game Loop ----
function gameLoop() {
  frameCount++;

  // Smooth player movement toward detected hand
  if (handDetected) {
    const lerpSpeed = 0.12;
    handX += (rawHandX - handX) * lerpSpeed;
    handY += (rawHandY - handY) * lerpSpeed;
    player.x += (handX - player.x) * 0.18;
    player.y += (handY - player.y) * 0.18;
  }

  // Clamp player within canvas bounds
  player.x = Math.max(player.r, Math.min(W - player.r, player.x));
  player.y = Math.max(player.r, Math.min(H - player.r, player.y));

  // Record trail
  player.trail.push({ x: player.x, y: player.y });
  if (player.trail.length > 12) player.trail.shift();

  // Spawn obstacles
  const spawnRate = Math.max(30, 80 - level * 6);
  if (frameCount % spawnRate === 0) {
    obstacles.push(spawnObstacle());
  }

  // Move obstacles & check collisions
  for (let i = obstacles.length - 1; i >= 0; i--) {
    const ob = obstacles[i];
    ob.x -= ob.speed;

    if (checkCollision(ob)) {
      spawnParticles(player.x, player.y, '#ff3e6c', 20);
      spawnParticles(ob.x, ob.y, ob.color, 10);
      obstacles.splice(i, 1);
      lives--;
      hitFlash = 1;
      updateLivesHUD();
      if (lives <= 0) { endGame(); return; }
      continue;
    }

    // Obstacle passed — score a point
    if (ob.x < -ob.size) {
      obstacles.splice(i, 1);
      score++;
      scoreDisplay.textContent = score;
      if (score % 10 === 0) {
        level++;
        levelDisplay.textContent = level;
      }
    }
  }

  // Update particles
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.05; // gravity
    p.life -= p.decay;
    if (p.life <= 0) particles.splice(i, 1);
  }

  // Render frame
  drawBackground();
  drawParticles();
  drawObstacles();
  drawPlayer();
  drawHUD();

  animId = requestAnimationFrame(gameLoop);
}

// ---- Update Lives HUD ----
function updateLivesHUD() {
  livesDisplay.textContent = '♥'.repeat(Math.max(0, lives)) + '♡'.repeat(Math.max(0, 3 - lives));
}

// ---- Start Game ----
function startGame() {
  startScreen.classList.add('hidden');
  gameOverScreen.classList.add('hidden');

  score = 0; lives = 3; level = 1; frameCount = 0;
  obstacles = []; particles = []; player.trail = [];
  player.x = W / 2; player.y = H / 2;

  scoreDisplay.textContent = '0';
  levelDisplay.textContent = '1';
  updateLivesHUD();

  gameRunning = true;
  detectionInterval = setInterval(detectHand, 80);
  gameLoop();
}

// ---- End Game ----
function endGame() {
  gameRunning = false;
  clearInterval(detectionInterval);
  cancelAnimationFrame(animId);

  if (score > bestScore) {
    bestScore = score;
    bestDisplay.textContent = bestScore;
  }

  finalScore.textContent  = score;
  gameOverMsg.textContent = score >= 30 ? '🎯 Excellent reflexes!' :
                            score >= 15 ? '👍 Nice run!'           : '💪 Keep practicing!';
  gameOverScreen.classList.remove('hidden');
}

// ---- Button Listeners ----
startBtn.addEventListener('click', startGame);
restartBtn.addEventListener('click', startGame);

// ---- Init: Camera + Model ----
(async () => {
  loadingFill.style.width = '10%';
  const camOk = await setupCamera();
  loadingFill.style.width = '20%';
  if (camOk) {
    await loadModel();
  } else {
    loadingText.textContent = 'CAMERA REQUIRED';
    modelStatus.textContent = 'Skipped';
  }
})();
