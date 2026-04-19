// ===== DATA =====
const GAMES = [
  { id:'space-dodger', title:'Hand Draw', icon:'🎨', difficulty:'medium', mode:'solo', genre:'relax',
    desc:'Navigate your paint brush with your hand gestures. Draw, paint, create! pretty drawing just by using your hands.',
    controls:'<strong>CONTROL:</strong> Index finger as brush, fist as eraser and open palm as hover', players:'1P',
    url:'hand-draw/drawindex.html' },
  { id:'pixel-punch', title:'Rock paper scissors', icon:'🪨 📄 ✂️', difficulty:'easy', mode:'solo', genre:'relax',
    desc:'Ai vs you, rock-paper-scissors with a webcam twist. Raise your hand and pick one rock, paper or scissors. Best of 3 wins!',
    controls:'<strong>CONTROL:</strong> Raise hand to select rock, paper, or scissors.', players:'1P',
    url:'rock-paper/rockindex.html' },
  { id:'ghost-maze', title:'Fruit ninja', icon:'🍍🍎🍓🍇', difficulty:'hard', mode:'solo', genre:'action',
    desc:'Slice through flying fruit with your hand gestures. The more you slice, the higher your score. Watch out for bombs!',
    controls:'<strong>CONTROL:</strong> use your index finger to slice fruit', players:'1P',
    url:'fruit-ninja/fruitindex.html' },
  { id:'beat-slayer', title:'Memory card flip', icon:'🃏', difficulty:'medium', mode:'solo', genre:'relax',
    desc:'Test your memory with a card flip game. Flip cards by tapping them with your hand. Match pairs to clear the board and win!',
    controls:'<strong>CONTROL:</strong> Tap cards with your hand to flip them.', players:'1P',
    url:'Memory_card_flip/memoryindex.html' },
  { id:'neon-runner', title:'Hand dodge', icon:'🔴', difficulty:'hard', mode:'solo', genre:'action',
    desc:'Dodge incoming obstacles in this fast-paced lane-runner. Use hand gestures to change lanes and avoid collisions.',
    controls:'<strong>CONTROL:</strong> Move hand left/right to change lanes. Raise hand to jump. Lower hand to duck.', players:'1P',
    url:'Hand-dodge/handindex.html' },
];

let currentGame = null;
let soundOn = false;
let webcamStream = null;
let leaderboard = JSON.parse(localStorage.getItem('pixelcam_lb') || '{}');

// ===== BOOT =====
setTimeout(() => {
  document.getElementById('boot-screen').classList.add('hidden');
}, 3500);

// ===== RENDER GAMES =====
function renderGames(filter = 'all') {
  const grid = document.getElementById('game-grid');
  const filtered = GAMES.filter(g =>
    filter === 'all' ||
    g.difficulty === filter ||
    g.mode === filter ||
    g.genre === filter
  );
  grid.innerHTML = filtered.map(g => `
    <div class="game-card" data-difficulty="${g.difficulty}" data-mode="${g.mode}" data-genre="${g.genre}"
         onclick="openModal('${g.id}')">
      <div class="game-preview">
        <span style="position:relative;z-index:1;">${g.icon}</span>
        <div class="cam-hover">
          <span class="cam-icon">📷</span>
          <span style="font-family:var(--font-pixel);font-size:8px;">WEBCAM READY</span>
        </div>
      </div>
      <div class="game-info">
        <div class="game-title">${g.title}</div>
        <div class="game-tags">
          <span class="tag difficulty-${g.difficulty}">${g.difficulty.toUpperCase()}</span>
          <span class="tag ${g.mode}">${g.mode.toUpperCase()}</span>
          <span class="tag" style="border-color:var(--green-dim);color:var(--green-dim);">${g.players}</span>
        </div>
      </div>
      <button class="play-btn">▶ PLAY NOW</button>
    </div>
  `).join('');
}
renderGames();

function filterGames(f, btn) {
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderGames(f);
}

// ===== LEADERBOARD =====
function renderLeaderboard() {
  const grid = document.getElementById('lb-grid');
  grid.innerHTML = GAMES.map(g => {
    const scores = (leaderboard[g.id] || []).sort((a,b) => b.score - a.score).slice(0,5);
    const rankClass = ['gold','silver','bronze'];
    return `
      <div class="lb-card">
        <div class="lb-game-title">${g.icon} ${g.title}</div>
        ${scores.length === 0
          ? `<div style="font-size:12px;color:var(--green-dim);">No scores yet. Be the first!</div>`
          : scores.map((s,i) => `
            <div class="lb-row">
              <span class="lb-rank ${rankClass[i]||''}">#${i+1}</span>
              <span class="lb-name">${s.name}</span>
              <span class="lb-score">${s.score.toLocaleString()}</span>
            </div>`).join('')}
      </div>`;
  }).join('');
}
renderLeaderboard();

// ===== MODAL =====
function openModal(id) {
  const g = GAMES.find(x => x.id === id);
  if (!g) return;
  currentGame = g;
  document.getElementById('modal-icon').textContent = g.icon;
  document.getElementById('modal-title').textContent = g.title;
  document.getElementById('modal-sub').textContent = g.genre.toUpperCase() + ' · WEBCAM CONTROLLED';
  document.getElementById('modal-tags').innerHTML = `
    <span class="tag difficulty-${g.difficulty}">${g.difficulty.toUpperCase()}</span>
    <span class="tag ${g.mode}">${g.mode.toUpperCase()}</span>
    <span class="tag" style="border-color:var(--green-dim);color:var(--green-dim);">${g.players}</span>
  `;
  document.getElementById('modal-desc').textContent = g.desc;
  document.getElementById('modal-controls').innerHTML = g.controls;
  document.getElementById('modal-play-btn').textContent = '▶▶ LAUNCH ' + g.title;
  document.getElementById('modal-play-btn').onclick = () => { window.location.href = g.url; };
  document.getElementById('score-name').value = '';
  document.getElementById('score-val').value = '';
  document.getElementById('modal-overlay').classList.add('open');
  playBeep(440, 0.05);
}
function closeModal() {
  document.getElementById('modal-overlay').classList.remove('open');
  currentGame = null;
}
function closeModalOutside(e) {
  if (e.target === document.getElementById('modal-overlay')) closeModal();
}

// ===== SCORE SUBMIT =====
function submitScore() {
  if (!currentGame) return;
  const name = document.getElementById('score-name').value.trim().toUpperCase() || 'AAA';
  const score = parseInt(document.getElementById('score-val').value) || 0;
  if (!leaderboard[currentGame.id]) leaderboard[currentGame.id] = [];
  leaderboard[currentGame.id].push({ name, score });
  localStorage.setItem('pixelcam_lb', JSON.stringify(leaderboard));
  renderLeaderboard();
  playBeep(880, 0.05);
  document.getElementById('score-name').value = '';
  document.getElementById('score-val').value = '';
  alert('SCORE SUBMITTED: ' + name + ' — ' + score.toLocaleString());
}

// ===== WEBCAM =====
async function enableWebcam() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    webcamStream = stream;
    const bg = document.getElementById('webcam-bg');
    bg.srcObject = stream;
    bg.classList.add('active');
    document.getElementById('enable-cam-btn').textContent = '[ CAM ACTIVE ✓ ]';
    document.getElementById('enable-cam-btn').style.color = 'var(--green)';
  } catch(e) {
    alert('Webcam access denied or unavailable. You can still play without it!');
  }
}

async function testCam() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    const vid = document.getElementById('cam-test-preview');
    vid.srcObject = stream;
    vid.style.display = 'block';
    document.getElementById('cam-placeholder').style.display = 'none';
    document.getElementById('cam-status').textContent = '✓ Camera detected and working! Lighting looks good. You\'re ready to play.';
    document.getElementById('cam-test-btn').textContent = '[ CAMERA ACTIVE ✓ ]';
  } catch(e) {
    document.getElementById('cam-status').textContent = '✗ Could not access camera. Please check browser permissions and try again.';
  }
}

// ===== PRIVACY =====
function dismissPrivacy() {
  document.getElementById('privacy-banner').classList.add('hidden');
  localStorage.setItem('privacy_dismissed', '1');
}
if (localStorage.getItem('privacy_dismissed')) dismissPrivacy();

// ===== SOUND =====
let audioCtx = null;
function playBeep(freq=440, dur=0.08) {
  if (!soundOn) return;
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  const o = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  o.connect(g); g.connect(audioCtx.destination);
  o.frequency.value = freq;
  o.type = 'square';
  g.gain.setValueAtTime(0.1, audioCtx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
  o.start(); o.stop(audioCtx.currentTime + dur);
}
function toggleSound(btn) {
  soundOn = !soundOn;
  btn.textContent = soundOn ? '♪ SFX: ON' : '♪ SFX: OFF';
  btn.classList.toggle('on', soundOn);
  if (soundOn) playBeep(660, 0.1);
}

// ===== FLOATING PIXEL CHARS =====
document.addEventListener('mousemove', e => {
  document.querySelectorAll('.pixel-char').forEach(el => {
    const speed = parseFloat(el.dataset.speed) || 0.03;
    const x = (e.clientX - window.innerWidth/2) * speed;
    const y = (e.clientY - window.innerHeight/2) * speed;
    el.style.transform = `translate(${x}px,${y}px)`;
  });
});

// ===== SCROLL REVEAL =====
const obs = new IntersectionObserver(entries => {
  entries.forEach(e => { if(e.isIntersecting) e.target.classList.add('visible'); });
}, { threshold: 0.1 });
document.querySelectorAll('.reveal').forEach(el => obs.observe(el));

function scrollToGames() {
  document.getElementById('games').scrollIntoView({ behavior: 'smooth' });
  playBeep(660, 0.1);
}

// ===== KEYBOARD NAV =====
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeModal();
  if (e.key === 'm' || e.key === 'M') toggleSound(document.getElementById('sound-toggle'));
});
