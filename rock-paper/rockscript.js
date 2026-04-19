/* ── Constants ────────────────────────────────────────────────── */
const CHOICES = ['rock', 'paper', 'scissors'];
const EMOJI   = { rock: '✊', paper: '✋', scissors: '✌️' };
const BEATS   = { rock: 'scissors', scissors: 'paper', paper: 'rock' };

/* ── State ────────────────────────────────────────────────────── */
let pScore = 0, aiScore = 0, ties = 0, rounds = 0;
let currentGesture = null, stableGesture = null, stableStart = 0;
let gamePhase = 'idle', cameraOn = false;
let handVisible = false;
let hands = null, mpCamera = null;

/* ── DOM References ───────────────────────────────────────────── */
const webcam      = document.getElementById('webcam');
const canvas      = document.getElementById('overlay-canvas');
const ctx         = canvas.getContext('2d');
const gestureBadge = document.getElementById('gesture-badge');
const noHand      = document.getElementById('no-hand');
const countdown   = document.getElementById('countdown');
const resultText  = document.getElementById('result-text');
const playBtn     = document.getElementById('play-btn');
const resetBtn    = document.getElementById('reset-btn');
const aiThinking  = document.getElementById('ai-thinking');
const aiEmoji     = document.getElementById('ai-emoji');
const aiLabel     = document.getElementById('ai-label');
const playerPanel = document.getElementById('player-panel');
const aiPanel     = document.getElementById('ai-panel');
const champBanner = document.getElementById('champion-banner');
const startScreen = document.getElementById('start-screen');
const camBtn      = document.getElementById('cam-btn');

/* ── Score Display ────────────────────────────────────────────── */
function updateScore() {
  document.getElementById('p-score').textContent  = pScore;
  document.getElementById('ai-score').textContent = aiScore;
  document.getElementById('t-score').textContent  = ties;
  document.getElementById('r-score').textContent  = rounds;
}

/* ── Gesture Detection ────────────────────────────────────────── */
function detectGesture(landmarks) {
  const tips    = [8, 12, 16, 20];
  const pips    = [6, 10, 14, 18];
  const fingers = tips.map((t, i) => landmarks[t].y < landmarks[pips[i]].y);
  const [idx, mid, rng, pnk] = fingers;
  if (!idx && !mid && !rng && !pnk) return 'rock';
  if (idx && mid && rng && pnk)     return 'paper';
  if (idx && mid && !rng && !pnk)   return 'scissors';
  return null;
}

/* ── Draw Hand Landmarks ──────────────────────────────────────── */
function drawLandmarks(lms) {
  canvas.width  = webcam.videoWidth  || 640;
  canvas.height = webcam.videoHeight || 480;
  const W = canvas.width, H = canvas.height;

  const connections = [
    [0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],
    [5,9],[9,10],[10,11],[11,12],[9,13],[13,14],[14,15],[15,16],
    [13,17],[17,18],[18,19],[19,20],[0,17]
  ];

  ctx.clearRect(0, 0, W, H);
  ctx.strokeStyle = 'rgba(74,158,255,0.6)';
  ctx.lineWidth   = 2;

  connections.forEach(([a, b]) => {
    ctx.beginPath();
    ctx.moveTo(lms[a].x * W, lms[a].y * H);
    ctx.lineTo(lms[b].x * W, lms[b].y * H);
    ctx.stroke();
  });

  lms.forEach(lm => {
    ctx.beginPath();
    ctx.arc(lm.x * W, lm.y * H, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#4a9eff';
    ctx.fill();
  });
}

/* ── MediaPipe Init ───────────────────────────────────────────── */
function initMediaPipe() {
  try {
    hands = new Hands({
      locateFile: f => `https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1646424915/${f}`
    });
    hands.setOptions({
      maxNumHands: 1,
      modelComplexity: 1,
      minDetectionConfidence: 0.7,
      minTrackingConfidence: 0.5
    });
    hands.onResults(onResults);

    mpCamera = new Camera(webcam, {
      onFrame: async () => { if (hands) await hands.send({ image: webcam }); },
      width: 640,
      height: 480
    });
    mpCamera.start();
    startScreen.style.display = 'none';
    cameraOn = true;
  } catch (e) {
    startScreen.innerHTML =
      '<div style="color:#ff4a6e;font-size:13px;padding:20px;text-align:center">MediaPipe failed to load.<br>Please check your internet connection.</div>';
  }
}

/* ── MediaPipe Results Handler ────────────────────────────────── */
function onResults(results) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (!results.multiHandLandmarks || results.multiHandLandmarks.length === 0) {
    handVisible    = false;
    noHand.style.display    = 'block';
    gestureBadge.style.display = 'none';
    currentGesture = null;
    stableGesture  = null;
    return;
  }

  handVisible = true;
  noHand.style.display    = 'none';
  gestureBadge.style.display = 'block';

  canvas.width  = webcam.videoWidth  || 640;
  canvas.height = webcam.videoHeight || 480;

  const lms = results.multiHandLandmarks[0];
  drawLandmarks(lms);

  const g = detectGesture(lms);
  if (g) {
    if (g === currentGesture) {
      if (Date.now() - stableStart >= 800) stableGesture = g;
    } else {
      currentGesture = g;
      stableStart    = Date.now();
      stableGesture  = null;
    }
    const isStable = stableGesture !== null;
    gestureBadge.textContent  = `${EMOJI[g]} ${g.charAt(0).toUpperCase() + g.slice(1)}`;
    gestureBadge.className    = isStable ? 'locked' : '';
    playerPanel.style.boxShadow = isStable ? '0 0 0 2px #00ff88 inset' : '';
  } else {
    currentGesture = null;
    stableGesture  = null;
    gestureBadge.textContent    = '🤔 Detecting...';
    gestureBadge.className      = '';
    playerPanel.style.boxShadow = '';
  }
}

/* ── Camera Button ────────────────────────────────────────────── */
camBtn.addEventListener('click', () => {
  camBtn.textContent = 'Loading...';
  camBtn.disabled    = true;
  initMediaPipe();
});

/* ── AI Display ───────────────────────────────────────────────── */
function setAIDisplay(show, choice = null) {
  if (!show) {
    aiThinking.style.display = 'flex';
    aiEmoji.style.display    = 'none';
    aiLabel.textContent      = 'AI is thinking...';
  } else {
    aiThinking.style.display = 'none';
    aiEmoji.style.display    = 'flex';
    aiEmoji.textContent      = EMOJI[choice];
    aiEmoji.classList.remove('flip');
    void aiEmoji.offsetWidth; // force reflow for animation restart
    aiEmoji.classList.add('flip');
    aiLabel.textContent = choice.charAt(0).toUpperCase() + choice.slice(1);
  }
}

/* ── Result Display ───────────────────────────────────────────── */
function setResult(text, color) {
  resultText.textContent = text;
  resultText.style.background = color;
  resultText.classList.remove('bounce');
  void resultText.offsetWidth; // force reflow
  resultText.classList.add('bounce');
}

/* ── Champion Check ───────────────────────────────────────────── */
function checkChampion() {
  if (pScore >= 3 || aiScore >= 3) {
    const won = pScore >= 3;
    document.getElementById('champ-title').textContent = won ? '🏆 You Win!'  : '🤖 AI Wins!';
    document.getElementById('champ-sub').textContent   = won ? 'You reached 3 wins first!' : 'The AI reached 3 wins first!';
    champBanner.style.display = 'block';
  }
}

/* ── Round Logic ──────────────────────────────────────────────── */
function startRound() {
  if (gamePhase !== 'idle') return;
  gamePhase       = 'countdown';
  playBtn.disabled = true;
  playerPanel.className = 'panel';
  aiPanel.className     = 'panel';
  setAIDisplay(false);
  resultText.textContent       = '';
  resultText.style.background  = 'transparent';

  let count = 3;
  countdown.style.color = '#4a9eff';
  countdown.textContent = count;

  const tick = () => {
    countdown.classList.remove('pop');
    void countdown.offsetWidth; // force reflow
    countdown.classList.add('pop');

    if (count > 0) {
      countdown.textContent  = count;
      countdown.style.color  = count === 1 ? '#ff4a6e' : count === 2 ? '#ffaa00' : '#4a9eff';
      count--;
      setTimeout(tick, 900);
    } else {
      countdown.textContent = 'GO!';
      countdown.style.color = '#00ff88';
      setTimeout(resolveRound, 600);
    }
  };
  tick();
}

function resolveRound() {
  gamePhase = 'resolve';
  const playerMove = stableGesture || currentGesture;

  if (!playerMove || !handVisible) {
    countdown.textContent = 'No hand!';
    countdown.style.color = '#ff4a6e';
    setResult('❌ No gesture detected', 'rgba(255,74,110,0.2)');
    gamePhase        = 'idle';
    playBtn.disabled = false;
    return;
  }

  const aiMove = CHOICES[Math.floor(Math.random() * 3)];
  rounds++;

  let outcome;
  if (playerMove === aiMove)        { outcome = 'tie';  ties++; }
  else if (BEATS[playerMove] === aiMove) { outcome = 'win';  pScore++; }
  else                              { outcome = 'lose'; aiScore++; }

  updateScore();
  setAIDisplay(true, aiMove);

  setTimeout(() => {
    if (outcome === 'win') {
      setResult('🎉 You Win!', 'rgba(0,255,136,0.15)');
      playerPanel.className = 'panel win';
      aiPanel.className     = 'panel lose';
    } else if (outcome === 'lose') {
      setResult('🤖 AI Wins!', 'rgba(255,74,110,0.15)');
      playerPanel.className = 'panel lose';
      aiPanel.className     = 'panel win';
    } else {
      setResult('🤝 Tie!', 'rgba(255,204,0,0.15)');
      playerPanel.className = 'panel tie';
      aiPanel.className     = 'panel tie';
    }

    countdown.textContent  = `${EMOJI[playerMove]} vs ${EMOJI[aiMove]}`;
    countdown.style.color  = '#fff';
    countdown.style.fontSize = '36px';

    setTimeout(() => {
      countdown.style.fontSize = '72px';
      countdown.textContent    = '✊✋✌️';
      countdown.style.color    = '#4a9eff';
    }, 2000);

    gamePhase        = 'idle';
    playBtn.disabled = false;
    checkChampion();
  }, 400);
}

/* ── Reset Helper ─────────────────────────────────────────────── */
function resetGame() {
  pScore = 0; aiScore = 0; ties = 0; rounds = 0;
  updateScore();
  playerPanel.className        = 'panel';
  aiPanel.className            = 'panel';
  resultText.textContent       = '';
  resultText.style.background  = 'transparent';
  setAIDisplay(false);
  countdown.textContent        = '✊✋✌️';
  countdown.style.color        = '#4a9eff';
  countdown.style.fontSize     = '72px';
  champBanner.style.display    = 'none';
}

/* ── Event Listeners ──────────────────────────────────────────── */
playBtn.addEventListener('click', startRound);

document.addEventListener('keydown', e => {
  if (e.code === 'Space' && gamePhase === 'idle') {
    e.preventDefault();
    startRound();
  }
});

resetBtn.addEventListener('click', resetGame);

document.getElementById('champ-close').addEventListener('click', resetGame);
