/* ====================================================================
   BOLOS A 3 TABLONES — motor de la app (v2)
   ==================================================================== */

const firebaseConfig = {
  apiKey: "AIzaSyAf8jgjqPiZ26wV2gJ-nCP0o-E12MwjW-I",
  authDomain: "bolos-3-tablones.firebaseapp.com",
  databaseURL: "https://bolos-3-tablones-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "bolos-3-tablones",
  storageBucket: "bolos-3-tablones.firebasestorage.app",
  messagingSenderId: "390151503499",
  appId: "1:390151503499:web:121dbd49f5e7df5d5e5e8e"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.database();

db.ref('.info/connected').on('value', (snap) => {
  const connected = snap.val() === true;
  ['syncDot', 'syncDotGame'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('offline', !connected);
  });
});

/* ============== ADMIN & DEVICE SECURITY ============== */
const ADMIN_PASSWORD = "1310";
let isAdminMode = false;

function getOrCreateDeviceId() {
  let id = localStorage.getItem('bolos_device_id');
  if (!id) {
    id = 'dev_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);
    localStorage.setItem('bolos_device_id', id);
  }
  return id;
}
const DEVICE_ID = getOrCreateDeviceId();

function openAdminModal() {
  const modal = document.getElementById('adminPwModalContent');
  modal.innerHTML = `
    <h3>🔧 Modo administrador</h3>
    <input type="password" class="text-input" id="adminPwInput" placeholder="Introduce la clave" style="margin-bottom:12px;">
    <button class="primary-action" onclick="checkAdminPassword()">Entrar</button>
    <button class="modal-close-btn" onclick="closeAdminModal()">Cancelar</button>
  `;
  document.getElementById('adminPwModal').classList.add('visible');
  setTimeout(() => {
    const input = document.getElementById('adminPwInput');
    if (input) {
      input.focus();
      input.addEventListener('keydown', e => { if (e.key === 'Enter') checkAdminPassword(); });
    }
  }, 100);
}

function closeAdminModal() {
  document.getElementById('adminPwModal').classList.remove('visible');
}

function checkAdminPassword() {
  const val = document.getElementById('adminPwInput').value;
  if (val === ADMIN_PASSWORD) {
    isAdminMode = true;
    document.getElementById('adminBadge').classList.add('visible');
    closeAdminModal();
    showToast('🔓 Modo administrador activado');
  } else {
    showToast('⚠️ Contraseña incorrecta');
  }
}
const PLAYER_COLORS = [
  '#c9982f', '#a8472f', '#5c7a4f', '#3d6e8a', '#9b5fa8',
  '#cc6633', '#4f9b8a', '#b8478f', '#7a8a3d', '#5a6fc9'
];

const SEED_PLAYER_NAMES = [
  "Adolfo","Adrián","Aitor Loko","Aitor Ruvio","Alba","Alex (Celia)","Alex (Txiki)",
  "Aritz","Asier","Carlos Blon","César","Dani (Celia)","Dani (Emiio)","Dani (Estanco)",
  "David (Celia)","Davicin","Gonzalo","Gorka","Inaxio","Iker (Estanco)","Jaime",
  "Javi (Ismael)","Javi (Vitoriano)","Javitxu","Joseba","Josemi (Estanco)","Juankar",
  "Jorge","Luis Mari","Marcos","Marquitos","Martin","Miguel","Nacho","Nico",
  "Nico (Emilio)","Patxi","Peter","Raul","Samuel","Sergio","Ugaitz","Urko"
].sort((a, b) => a.localeCompare(b, 'es'));

/* ============== STATE ============== */
let state = {
  partidaNum: null,
  teamA: { name: '', players: [] }, // players: [{name, color}]
  teamB: { name: '', players: [] },
  juegoNum: 1,
  juegosGanados: { A: 0, B: 0 },
  juegoHistory: [],
  rounds: [],
  currentRoundThrows: [],
  coinCallTeam: null,
  coinCall: null,
  firstThrowingTeam: null,
  plantingTeam: null,
  turnTeam: null,
  turnPlayerIdx: 0,
  turnDirection: 'arriba',
  roundNumberForTeam: { A: 0, B: 0 },
};

let sharedPlayerCount = 2;
let nextPartidaNum = 1;
let playerDatabase = {}; // { id: {name} }
let playerColorAssignment = {}; // name -> color, assigned per-partida at setup time

let pickerContext = null; // { team: 'A'|'B', slotIndex }
let editThrowContext = null; // index into state.currentRoundThrows

/* ============== INIT ============== */
async function initApp() {
  try {
    const snap = await db.ref('partidas').get();
    const partidas = snap.val() || {};
    const nums = Object.values(partidas)
      .filter(p => typeof p === 'object' && p.numero)
      .map(p => p.numero);
    nextPartidaNum = nums.length ? Math.max(...nums) + 1 : 1;
  } catch (e) { nextPartidaNum = 1; }

  await loadPlayerDatabase();
  renderTeamSlots('A');
  renderTeamSlots('B');
}
initApp();
checkLiveGameOnHome();

async function loadPlayerDatabase() {
  try {
    const snap = await db.ref('jugadores').get();
    playerDatabase = snap.val() || {};
    if (Object.keys(playerDatabase).length === 0) {
      await seedPlayerDatabase();
    }
  } catch (e) {
    console.error('Error cargando jugadores', e);
  }
}

async function seedPlayerDatabase() {
  const updates = {};
  SEED_PLAYER_NAMES.forEach(name => {
    const id = db.ref('jugadores').push().key;
    updates['jugadores/' + id] = { name };
  });
  await db.ref().update(updates);
  const snap = await db.ref('jugadores').get();
  playerDatabase = snap.val() || {};
}

function getAllPlayerNames() {
  return Object.values(playerDatabase).map(p => p.name).sort((a, b) => a.localeCompare(b, 'es'));
}

function findPlayerIdByName(name) {
  return Object.keys(playerDatabase).find(id => playerDatabase[id].name === name) || null;
}

function getPlayerPhoto(name) {
  const id = findPlayerIdByName(name);
  return id && playerDatabase[id].photo ? playerDatabase[id].photo : null;
}

async function addPlayerToDatabase(name) {
  const id = db.ref('jugadores').push().key;
  await db.ref('jugadores/' + id).set({ name });
  playerDatabase[id] = { name };
  return id;
}

async function savePlayerPhoto(name, photoDataUrl) {
  const id = findPlayerIdByName(name);
  if (!id) return;
  await db.ref('jugadores/' + id).update({ photo: photoDataUrl });
  playerDatabase[id].photo = photoDataUrl;
}

function resizePlayerPhoto(file, callback) {
  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      const maxSize = 180;
      let w = img.width, h = img.height;
      if (w > h) { if (w > maxSize) { h = h * (maxSize / w); w = maxSize; } }
      else { if (h > maxSize) { w = w * (maxSize / h); h = maxSize; } }
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      callback(canvas.toDataURL('image/jpeg', 0.75));
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

/* ============== NAVIGATION ============== */
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  window.scrollTo(0, 0);
}

function goHome() {
  showScreen('screen-home');
  checkLiveGameOnHome();
}

function goToSetup() {
  document.getElementById('setupPartidaNum').textContent = nextPartidaNum;
  // Reset slots to match sharedPlayerCount, keep prior names if same count
  renderTeamSlots('A');
  renderTeamSlots('B');
  showScreen('screen-setup');
}

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2000);
}

/* ============== SETUP: shared player count ============== */
function changePlayerCount(delta) {
  sharedPlayerCount = Math.max(1, Math.min(5, sharedPlayerCount + delta));
  document.getElementById('countShared').textContent = sharedPlayerCount;
  renderTeamSlots('A');
  renderTeamSlots('B');
}

// teamSlotsData[team] = array of {name: string|null}
let teamSlotsData = { A: [], B: [] };

function renderTeamSlots(team) {
  const container = document.getElementById('players' + team);
  const arr = teamSlotsData[team];
  while (arr.length < sharedPlayerCount) arr.push({ name: null });
  while (arr.length > sharedPlayerCount) arr.pop();

  container.innerHTML = '';
  arr.forEach((slot, i) => {
    const row = document.createElement('div');
    row.className = 'player-slot-row';

    const btn = document.createElement('button');
    btn.className = 'player-pick-btn' + (slot.name ? '' : ' empty');
    btn.onclick = () => openPickerModal(team, i);

    if (slot.name) {
      const photo = getPlayerPhoto(slot.name);
      const photoHtml = photo
        ? `<img class="player-photo-thumb" src="${photo}">`
        : `<div class="player-photo-thumb placeholder">👤</div>`;
      btn.innerHTML = `${photoHtml}<span>${escapeHtmlApp(slot.name)}</span>`;
    } else {
      btn.textContent = i === arr.length - 1 ? 'Elegir jugador (hombre responsable)' : 'Elegir jugador';
    }

    row.innerHTML = `<span class="player-order-num">${i + 1}</span>`;
    row.appendChild(btn);

    if (slot.name) {
      const photoBtn = document.createElement('button');
      photoBtn.className = 'header-action-btn';
      photoBtn.style.position = 'static';
      photoBtn.style.flexShrink = '0';
      photoBtn.textContent = '📷';
      photoBtn.onclick = () => openPlayerPhotoUpload(slot.name);
      row.appendChild(photoBtn);
    }

    container.appendChild(row);
  });
}

function openPlayerPhotoUpload(playerName) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    resizePlayerPhoto(file, async (dataUrl) => {
      await savePlayerPhoto(playerName, dataUrl);
      renderTeamSlots('A');
      renderTeamSlots('B');
      showToast('✅ Foto guardada para ' + playerName);
    });
  };
  input.click();
}

/* ============== PLAYER PICKER MODAL ============== */
function openPickerModal(team, slotIndex) {
  pickerContext = { team, slotIndex };
  renderPickerModal('');
  document.getElementById('pickerModal').classList.add('visible');
}

function closePickerModal() {
  document.getElementById('pickerModal').classList.remove('visible');
  pickerContext = null;
}

function getTakenNames(excludeTeam, excludeIndex) {
  const taken = new Set();
  ['A', 'B'].forEach(team => {
    teamSlotsData[team].forEach((slot, i) => {
      if (team === excludeTeam && i === excludeIndex) return;
      if (slot.name) taken.add(slot.name);
    });
  });
  return taken;
}

function renderPickerModal(filterText) {
  const modal = document.getElementById('pickerModalContent');
  const allNames = getAllPlayerNames();
  const taken = getTakenNames(pickerContext.team, pickerContext.slotIndex);
  const filtered = allNames.filter(n => n.toLowerCase().includes(filterText.toLowerCase()));

  const itemsHtml = filtered.map(name => {
    const isTaken = taken.has(name);
    const photo = getPlayerPhoto(name);
    const photoHtml = photo
      ? `<img class="photo-thumb-small" src="${photo}">`
      : `<div class="photo-thumb-small placeholder">👤</div>`;
    return `
      <div class="picker-item ${isTaken ? 'disabled' : ''}" onclick="${isTaken ? '' : `selectPlayerForSlot('${escapeJs(name)}')`}">
        ${photoHtml}
        <span>${escapeHtmlApp(name)}</span>
        ${isTaken ? '<span class="taken-tag">ya elegido</span>' : ''}
      </div>
    `;
  }).join('') || '<p style="color:var(--chalk-dim); font-size:0.85rem; padding:10px 0;">Sin resultados.</p>';

  modal.innerHTML = `
    <h3>Elegir jugador</h3>
    <input type="text" class="picker-search" id="pickerSearchInput" placeholder="Buscar jugador..." value="${escapeHtmlApp(filterText)}" oninput="renderPickerModal(this.value)">
    <div class="picker-list">${itemsHtml}</div>
    <div class="new-player-row" style="margin-bottom:10px;">
      <input type="text" class="text-input" id="newPlayerNameInput" placeholder="Nombre de jugador nuevo">
      <button onclick="createAndSelectPlayer()">Crear</button>
    </div>
    <button class="modal-close-btn" onclick="closePickerModal()">Cancelar</button>
  `;
}

function selectPlayerForSlot(name) {
  teamSlotsData[pickerContext.team][pickerContext.slotIndex] = { name };
  if (!playerColorAssignment[name]) {
    assignColorToPlayer(name);
  }
  renderTeamSlots(pickerContext.team);
  closePickerModal();
}

async function createAndSelectPlayer() {
  const input = document.getElementById('newPlayerNameInput');
  const name = input.value.trim();
  if (!name) { showToast('⚠️ Escribe un nombre'); return; }

  const existing = getAllPlayerNames().find(n => n.toLowerCase() === name.toLowerCase());
  if (existing) {
    selectPlayerForSlot(existing);
    return;
  }

  await addPlayerToDatabase(name);
  selectPlayerForSlot(name);
  showToast('✅ Jugador creado');
}

function assignColorToPlayer(name) {
  const usedColors = new Set(Object.values(playerColorAssignment));
  const available = PLAYER_COLORS.find(c => !usedColors.has(c)) || PLAYER_COLORS[Object.keys(playerColorAssignment).length % PLAYER_COLORS.length];
  playerColorAssignment[name] = available;
}

function escapeJs(str) { return str.replace(/'/g, "\\'"); }
function escapeHtmlApp(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

/* ============== GO TO COIN TOSS ============== */
function goToCoinToss() {
  const playersA = teamSlotsData.A.map(s => s.name);
  const playersB = teamSlotsData.B.map(s => s.name);

  if (playersA.some(n => !n) || playersB.some(n => !n)) {
    showToast('⚠️ Elige todos los jugadores de ambos equipos');
    return;
  }

  state.partidaNum = nextPartidaNum;
  state.teamA = { name: 'Equipo de ' + playersA[playersA.length - 1], players: playersA.map(n => ({ name: n, color: playerColorAssignment[n], photo: getPlayerPhoto(n) })) };
  state.teamB = { name: 'Equipo de ' + playersB[playersB.length - 1], players: playersB.map(n => ({ name: n, color: playerColorAssignment[n], photo: getPlayerPhoto(n) })) };
  state.juegoNum = 1;
  state.juegosGanados = { A: 0, B: 0 };
  state.juegoHistory = [];

  resetCoinScreen();
  showScreen('screen-coin');
}

/* ============== COIN TOSS (juego 1 only) ============== */
function resetCoinScreen() {
  state.coinCallTeam = null;
  state.coinCall = null;
  document.getElementById('coinBigWord').textContent = 'esperando lanzamiento';
  document.getElementById('coinBigWord').classList.add('placeholder');
  document.getElementById('callCaraBtn').classList.remove('selected');
  document.getElementById('callCruzBtn').classList.remove('selected');
  document.getElementById('coinResultText').innerHTML = `¿Quién llama, <strong>${state.teamA.name}</strong> o <strong>${state.teamB.name}</strong>?`;
  document.getElementById('coinTossBtn').style.display = 'block';
  document.getElementById('coinTossBtn').disabled = true;
  document.getElementById('coinContinueBtn').style.display = 'none';
  renderCoinCallerChoice();
}

function renderCoinCallerChoice() {
  const txt = document.getElementById('coinResultText');
  txt.innerHTML = `
    <div style="margin-bottom:14px;">¿Quién llama?</div>
    <div class="coin-call-row" style="margin-bottom:0;">
      <button class="coin-call-btn" onclick="pickCallerTeam('A')">${state.teamA.name}</button>
      <button class="coin-call-btn" onclick="pickCallerTeam('B')">${state.teamB.name}</button>
    </div>
  `;
}

function pickCallerTeam(team) {
  state.coinCallTeam = team;
  const callerName = team === 'A' ? state.teamA.name : state.teamB.name;
  document.getElementById('coinResultText').innerHTML = `<strong>${callerName}</strong> llama. Elige cara o cruz:`;
}

function selectCall(call) {
  if (!state.coinCallTeam) { showToast('⚠️ Primero elige qué equipo llama'); return; }
  state.coinCall = call;
  document.getElementById('callCaraBtn').classList.toggle('selected', call === 'cara');
  document.getElementById('callCruzBtn').classList.toggle('selected', call === 'cruz');
  document.getElementById('coinTossBtn').disabled = false;
}

function doCoinToss() {
  document.getElementById('coinTossBtn').disabled = true;
  const word = document.getElementById('coinBigWord');
  word.classList.remove('placeholder');
  word.textContent = '...';

  setTimeout(() => {
    const result = Math.random() < 0.5 ? 'cara' : 'cruz';
    word.textContent = result.toUpperCase();

    const callerWon = (result === state.coinCall);
    const callerTeam = state.coinCallTeam;
    const otherTeam = callerTeam === 'A' ? 'B' : 'A';

    state.plantingTeam = callerWon ? otherTeam : callerTeam;
    state.firstThrowingTeam = callerWon ? callerTeam : otherTeam;

    const callerName = callerTeam === 'A' ? state.teamA.name : state.teamB.name;
    const throwerName = state.firstThrowingTeam === 'A' ? state.teamA.name : state.teamB.name;
    const plantName = state.plantingTeam === 'A' ? state.teamA.name : state.teamB.name;

    document.getElementById('coinResultText').innerHTML = `
      Ha salido <strong>${result.toUpperCase()}</strong>.<br><br>
      ${callerWon ? `${callerName} ha acertado` : `${callerName} ha fallado`} → planta los bolos: <strong>${plantName}</strong><br>
      Tira primero: <strong>${throwerName}</strong>
    `;
    document.getElementById('coinTossBtn').style.display = 'none';
    document.getElementById('coinContinueBtn').style.display = 'block';
  }, 600);
}

/* ============== PLANT SCREEN (juego 2+, automatic) ============== */
function goToPlantScreen() {
  // plantingTeam = loser of previous juego; firstThrowingTeam = winner
  const lastJuego = state.juegoHistory[state.juegoHistory.length - 1];
  const winner = lastJuego.winner;
  const loser = winner === 'A' ? 'B' : 'A';

  state.plantingTeam = loser;
  state.firstThrowingTeam = winner;

  document.getElementById('plantJuegoNum').textContent = state.juegoNum;
  document.getElementById('plantTeamName').textContent = loser === 'A' ? state.teamA.name : state.teamB.name;
  document.getElementById('throwTeamName').textContent = winner === 'A' ? state.teamA.name : state.teamB.name;

  showScreen('screen-plant');
}

/* ============== GAME ENGINE ============== */
function startGame() {
  state.rounds = [];
  state.currentRoundThrows = [];
  state.roundNumberForTeam = { A: 0, B: 0 };
  state.turnTeam = state.firstThrowingTeam;
  state.turnPlayerIdx = 0;
  state.turnDirection = 'arriba';
  state.turnThrowCountInDirection = 0;

  document.getElementById('sbNameA').textContent = state.teamA.name;
  document.getElementById('sbNameB').textContent = state.teamB.name;
  document.getElementById('gamePartidaNum').textContent = state.partidaNum;
  document.getElementById('gameJuegoNum').textContent = state.juegoNum;

  // Lock this match to this device (first juego only — owner doesn't change mid-match)
  if (state.juegoNum === 1) {
    db.ref('partidas/' + state.partidaNum).update({
      numero: state.partidaNum,
      fecha: new Date().toISOString(),
      ownerDeviceId: DEVICE_ID,
      teamAName: state.teamA.name,
      teamBName: state.teamB.name
    }).catch(() => {});
  }

  updateScoreboard();
  renderGameHistoryStrip('gameHistoryStrip');
  renderTurn();
  showScreen('screen-game');
}

function currentTeamObj() { return state.turnTeam === 'A' ? state.teamA : state.teamB; }

function getTeamTotalThisJuego(team) {
  return state.rounds.filter(r => r.team === team).reduce((sum, r) => sum + r.total, 0);
}

function updateScoreboard() {
  document.getElementById('sbScoreA').textContent = getTeamTotalThisJuego('A');
  document.getElementById('sbScoreB').textContent = getTeamTotalThisJuego('B');

  const completedRoundsA = state.roundNumberForTeam.A;
  const completedRoundsB = state.roundNumberForTeam.B;
  const banner = document.getElementById('llevarBanner');

  if (completedRoundsA > 0 && completedRoundsA === completedRoundsB) {
    const totalA = getTeamTotalThisJuego('A');
    const totalB = getTeamTotalThisJuego('B');
    const diff = totalA - totalB;
    if (diff === 0) {
      banner.style.display = 'block';
      banner.textContent = `Empatados a ${totalA} bolos`;
    } else {
      const leadTeamName = diff > 0 ? state.teamA.name : state.teamB.name;
      banner.style.display = 'block';
      banner.textContent = `${leadTeamName} lleva ${Math.abs(diff)} bolos`;
    }
  } else {
    banner.style.display = 'none';
  }
}

function renderGameHistoryStrip(elId) {
  const strip = document.getElementById(elId);
  if (!strip) return;
  strip.innerHTML = '';
  state.juegoHistory.forEach((g, idx) => {
    const pill = document.createElement('span');
    pill.className = 'game-pill ' + (g.winner === 'A' ? 'won-a' : 'won-b');
    const winnerName = g.winner === 'A' ? state.teamA.name : state.teamB.name;
    const dadoTag = g.dadoPor ? ' 🏳️' : '';
    pill.textContent = `J${idx + 1}: ${winnerName.replace('Equipo de ', '')} (${g.scoreA}-${g.scoreB})${dadoTag}`;
    strip.appendChild(pill);
  });
}

function renderTurn() {
  const team = currentTeamObj();
  const teamLetter = state.turnTeam;
  const player = team.players[state.turnPlayerIdx];
  const roundNum = state.roundNumberForTeam[teamLetter] + 1;

  document.getElementById('turnTeamLabel').textContent = `TIRA ${team.name.toUpperCase()} · RONDA ${roundNum}`;
  document.getElementById('turnPlayerName').textContent = player.name;

  const turnCard = document.getElementById('turnCard');
  turnCard.style.setProperty('--player-color', player.color || '#c9982f');

  const photoEl = document.getElementById('turnPlayerPhoto');
  if (player.photo) {
    photoEl.src = player.photo;
    photoEl.style.display = 'block';
    photoEl.classList.remove('placeholder');
  } else {
    photoEl.style.display = 'none';
  }

  const dirEl = document.getElementById('turnDirection');
  const throwsPerDirection = getThrowsPerDirectionForCurrentTurn();
  if (throwsPerDirection > 1) {
    const currentThrowNum = (state.turnThrowCountInDirection || 0) + 1;
    dirEl.textContent = `${state.turnDirection === 'arriba' ? 'Para arriba' : 'Para abajo'} — tirada ${currentThrowNum} de ${throwsPerDirection}`;
  } else {
    dirEl.textContent = state.turnDirection === 'arriba' ? 'Para arriba' : 'Para abajo';
  }
  dirEl.className = 'turn-direction ' + state.turnDirection;

  document.getElementById('gameRoundLabel').textContent =
    `${team.name} — ${state.turnDirection === 'arriba' ? 'tirada hacia arriba' : 'tirada hacia abajo'}`;

  updatePartialScoreFlash();
  updateDarJuegoVisibility();
  renderPinsGrid();
  renderRoundLog();
  syncLiveState();
}

function updateDarJuegoVisibility() {
  const btn = document.getElementById('darElJuegoBtn');
  // Visible once both teams have completed at least 1 full round each
  // (i.e. from the planting team's 2nd round onward, per the rule)
  const bothCompletedFirstRound = state.roundNumberForTeam.A >= 1 && state.roundNumberForTeam.B >= 1;
  btn.style.display = bothCompletedFirstRound ? 'block' : 'none';
}

/* ============== DAR EL JUEGO ============== */
function openDarJuegoConfirm() {
  const modal = document.getElementById('darJuegoModalContent');
  modal.innerHTML = `
    <h3>🏳️ Dar el juego</h3>
    <p style="color:var(--chalk-dim); font-size:0.88rem; line-height:1.5; margin-bottom:18px;">
      Esto termina el juego ahora mismo con el resultado actual. Las tiradas que faltan no se anotarán ni contarán para las estadísticas.
    </p>
    <button class="danger-action" style="margin-top:0;" onclick="confirmDarJuegoStep1()">Confirmar, terminar el juego</button>
    <button class="modal-close-btn" onclick="closeDarJuegoModal()">Cancelar</button>
  `;
  document.getElementById('darJuegoModal').classList.add('visible');
}

function closeDarJuegoModal() {
  document.getElementById('darJuegoModal').classList.remove('visible');
}

function confirmDarJuegoStep1() {
  const modal = document.getElementById('darJuegoModalContent');
  modal.innerHTML = `
    <h3>¿Qué equipo gana este juego?</h3>
    <p style="color:var(--chalk-dim); font-size:0.85rem; margin-bottom:16px;">
      Marcador actual: ${state.teamA.name} ${getTeamTotalThisJuego('A')} — ${getTeamTotalThisJuego('B')} ${state.teamB.name}
    </p>
    <div style="display:flex; flex-direction:column; gap:10px;">
      <button class="primary-action" style="margin-top:0;" onclick="finalizeDarJuego('A')">${escapeHtmlApp(state.teamA.name)}</button>
      <button class="primary-action" style="margin-top:0;" onclick="finalizeDarJuego('B')">${escapeHtmlApp(state.teamB.name)}</button>
    </div>
    <button class="modal-close-btn" onclick="closeDarJuegoModal()">Cancelar</button>
  `;
}

function finalizeDarJuego(winnerTeam) {
  closeDarJuegoModal();
  // Discard the in-progress, incomplete round entirely (per the rule: unfinished throws don't count)
  state.currentRoundThrows = [];

  const totalA = getTeamTotalThisJuego('A');
  const totalB = getTeamTotalThisJuego('B');
  const givingTeam = winnerTeam === 'A' ? 'B' : 'A';
  const givingTeamName = givingTeam === 'A' ? state.teamA.name : state.teamB.name;

  endJuego(winnerTeam, totalA, totalB, { dadoPor: givingTeamName });
}

function updatePartialScoreFlash() {
  const flash = document.getElementById('partialScoreFlash');
  if (state.currentRoundThrows.length === 0) {
    flash.style.display = 'none';
    return;
  }
  const accumulated = state.currentRoundThrows.reduce((s, t) => s + t.value, 0);
  flash.style.display = 'block';
  flash.innerHTML = `Acumulado en esta ronda: <strong>${accumulated}</strong>`;
}

function renderPinsGrid() {
  const grid = document.getElementById('pinsGrid');
  grid.innerHTML = '';
  const max = state.turnDirection === 'arriba' ? 9 : 6;
  grid.className = 'pins-grid' + (max === 6 ? ' seven' : '');
  for (let i = 0; i <= max; i++) {
    const btn = document.createElement('button');
    btn.className = 'pin-btn';
    btn.textContent = i;
    btn.onclick = () => registerThrow(i);
    grid.appendChild(btn);
  }
}

function renderRoundLog() {
  const title = document.getElementById('roundLogTitle');
  title.textContent = `Tiradas de esta ronda — ${currentTeamObj().name}`;

  const entries = document.getElementById('roundLogEntries');
  entries.innerHTML = '';
  if (state.currentRoundThrows.length === 0) {
    entries.innerHTML = '<div class="log-entry"><span class="name" style="opacity:0.5;">Todavía no hay tiradas en esta ronda</span></div>';
    return;
  }
  state.currentRoundThrows.forEach((t, idx) => {
    const row = document.createElement('div');
    row.className = 'log-entry';
    row.innerHTML = `
      <span class="name"><span class="log-color-chip" style="background:${t.color || '#c9982f'}"></span>${escapeHtmlApp(t.player)} (${t.dir === 'arriba' ? '↑' : '↓'})</span>
      <span style="display:flex; align-items:center; gap:8px;">
        <span class="val">${t.value}</span>
        <span class="edit-icon" onclick="openEditThrowModal(${idx})">✏️</span>
      </span>
    `;
    entries.appendChild(row);
  });
}

function registerThrow(value) {
  const team = currentTeamObj();
  const player = team.players[state.turnPlayerIdx];

  state.currentRoundThrows.push({
    player: player.name, color: player.color,
    dir: state.turnDirection, value, team: state.turnTeam
  });

  db.ref('partidas_throws/' + state.partidaNum).push({
    partidaNum: state.partidaNum,
    juegoNum: state.juegoNum,
    player: player.name,
    dir: state.turnDirection,
    value,
    team: state.turnTeam,
    timestamp: Date.now()
  }).catch(() => {});

  updatePartialScoreFlash();
  renderRoundLog();
  syncLiveState();
  advanceTurn();
}

/* ============== LIVE SYNC (for spectators) ============== */
function syncLiveState() {
  if (!state.partidaNum) return;
  const team = currentTeamObj();
  const player = team.players[state.turnPlayerIdx];
  const accumulated = state.currentRoundThrows.reduce((s, t) => s + t.value, 0);

  db.ref('live/current').set({
    partidaNum: state.partidaNum,
    ownerDeviceId: DEVICE_ID,
    teamAName: state.teamA.name,
    teamBName: state.teamB.name,
    scoreA: getTeamTotalThisJuego('A'),
    scoreB: getTeamTotalThisJuego('B'),
    juegoNum: state.juegoNum,
    roundNumA: state.roundNumberForTeam.A,
    roundNumB: state.roundNumberForTeam.B,
    turnTeam: state.turnTeam,
    turnTeamName: team.name,
    turnPlayerName: player.name,
    turnDirection: state.turnDirection,
    roundAccumulated: accumulated,
    currentRoundThrows: state.currentRoundThrows,
    juegoHistory: state.juegoHistory,
    active: true,
    updatedAt: Date.now()
  }).catch(() => {});
}

function clearLiveState() {
  db.ref('live/current').update({ active: false }).catch(() => {});
}

function getThrowsPerDirectionForCurrentTurn() {
  // In 1vs1 (each team has exactly 1 player), each player throws 2 consecutive
  // throws per direction instead of 1, to fill the same round structure.
  const team = currentTeamObj();
  return team.players.length === 1 ? 2 : 1;
}

function advanceTurn() {
  const team = currentTeamObj();
  const throwsPerDirection = getThrowsPerDirectionForCurrentTurn();

  state.turnThrowCountInDirection = (state.turnThrowCountInDirection || 0) + 1;

  if (state.turnThrowCountInDirection < throwsPerDirection) {
    // Same player throws again in the same direction
    renderTurn();
    return;
  }

  // This player has completed their throws for this direction
  state.turnThrowCountInDirection = 0;
  const isLastPlayer = state.turnPlayerIdx === team.players.length - 1;

  if (!isLastPlayer) {
    state.turnPlayerIdx++;
    renderTurn();
    return;
  }

  if (state.turnDirection === 'arriba') {
    state.turnDirection = 'abajo';
    state.turnPlayerIdx = 0;
    renderTurn();
    return;
  }

  finishRoundForTeam();
}

function finishRoundForTeam() {
  const teamLetter = state.turnTeam;
  const total = state.currentRoundThrows.reduce((sum, t) => sum + t.value, 0);

  state.rounds.push({
    team: teamLetter,
    roundIndexForTeam: state.roundNumberForTeam[teamLetter] + 1,
    total,
    throws: state.currentRoundThrows.slice()
  });
  state.roundNumberForTeam[teamLetter]++;
  state.currentRoundThrows = [];

  updateScoreboard();

  const otherTeam = teamLetter === 'A' ? 'B' : 'A';
  const completedA = state.roundNumberForTeam.A;
  const completedB = state.roundNumberForTeam.B;

  if (completedA === completedB && completedA >= 2) {
    const totalA = getTeamTotalThisJuego('A');
    const totalB = getTeamTotalThisJuego('B');
    if (totalA !== totalB) {
      endJuego(totalA > totalB ? 'A' : 'B', totalA, totalB);
      return;
    }
  }

  state.turnTeam = otherTeam;
  state.turnPlayerIdx = 0;
  state.turnDirection = 'arriba';
  state.turnThrowCountInDirection = 0;
  renderTurn();
}

/* ============== EDIT THROW (within current round) ============== */
function openEditThrowModal(idx) {
  editThrowContext = idx;
  const t = state.currentRoundThrows[idx];
  const max = t.dir === 'arriba' ? 9 : 6;

  const modal = document.getElementById('editThrowModalContent');
  let buttonsHtml = '';
  for (let i = 0; i <= max; i++) {
    buttonsHtml += `<button class="pin-btn" style="aspect-ratio:auto; padding:14px 0;" onclick="applyEditThrow(${i})">${i}</button>`;
  }

  modal.innerHTML = `
    <h3>Corregir tirada de ${escapeHtmlApp(t.player)} (${t.dir === 'arriba' ? 'para arriba' : 'para abajo'})</h3>
    <p style="color:var(--chalk-dim); font-size:0.85rem; margin-bottom:14px;">Valor actual: <strong style="color:var(--gold)">${t.value}</strong></p>
    <div class="pins-grid${max === 6 ? ' seven' : ''}" style="margin-bottom:16px;">${buttonsHtml}</div>
    <button class="modal-close-btn" onclick="closeEditThrowModal()">Cancelar</button>
  `;
  document.getElementById('editThrowModal').classList.add('visible');
}

function applyEditThrow(newValue) {
  state.currentRoundThrows[editThrowContext].value = newValue;
  closeEditThrowModal();
  renderRoundLog();
  showToast('✅ Tirada corregida');
}

function closeEditThrowModal() {
  document.getElementById('editThrowModal').classList.remove('visible');
  editThrowContext = null;
}

/* ============== REORDER PLAYERS (during game) ============== */
function openReorderModal() {
  renderReorderModal();
  document.getElementById('reorderModal').classList.add('visible');
}

function closeReorderModal() {
  document.getElementById('reorderModal').classList.remove('visible');
}

function renderReorderModal() {
  const modal = document.getElementById('reorderModalContent');

  function teamHtml(teamLetter) {
    const team = teamLetter === 'A' ? state.teamA : state.teamB;
    return team.players.map((p, i) => `
      <div class="reorder-item">
        <span class="color-chip" style="background:${p.color}"></span>
        <span class="reorder-name">${i + 1}. ${escapeHtmlApp(p.name)}</span>
        <div class="reorder-move-btns">
          <button onclick="movePlayer('${teamLetter}', ${i}, -1)" ${i === 0 ? 'disabled' : ''}>↑</button>
          <button onclick="movePlayer('${teamLetter}', ${i}, 1)" ${i === team.players.length - 1 ? 'disabled' : ''}>↓</button>
        </div>
      </div>
    `).join('');
  }

  modal.innerHTML = `
    <h3>Reordenar jugadores</h3>
    <p style="color:var(--chalk-dim); font-size:0.8rem; margin-bottom:6px;">El cambio se aplica a partir de la próxima vez que le toque tirar a cada jugador.</p>
    <div class="reorder-team-label">Equipo A — ${escapeHtmlApp(state.teamA.name)}</div>
    ${teamHtml('A')}
    <div class="reorder-team-label">Equipo B — ${escapeHtmlApp(state.teamB.name)}</div>
    ${teamHtml('B')}
    <button class="modal-close-btn" onclick="closeReorderModal()">Cerrar</button>
  `;
}

function movePlayer(teamLetter, index, direction) {
  const team = teamLetter === 'A' ? state.teamA : state.teamB;
  const newIndex = index + direction;
  if (newIndex < 0 || newIndex >= team.players.length) return;

  const wasCurrentPlayer = (state.turnTeam === teamLetter && state.turnPlayerIdx === index);
  const otherWasCurrentPlayer = (state.turnTeam === teamLetter && state.turnPlayerIdx === newIndex);

  const tmp = team.players[index];
  team.players[index] = team.players[newIndex];
  team.players[newIndex] = tmp;

  if (wasCurrentPlayer) state.turnPlayerIdx = newIndex;
  else if (otherWasCurrentPlayer) state.turnPlayerIdx = index;

  renderReorderModal();
  renderTurn();
  showToast('✅ Orden actualizado');
}

/* ============== LIVE VIEW (spectator mode) ============== */
let liveViewListener = null;

async function checkLiveGameOnHome() {
  try {
    const snap = await db.ref('live/current').get();
    const live = snap.val();
    const btn = document.getElementById('liveViewBtn');
    if (live && live.active) {
      btn.style.display = 'flex';
      const isOwner = live.ownerDeviceId === DEVICE_ID;
      const icon = btn.querySelector('.icon');
      const subtitle = document.getElementById('liveViewSubtitle');
      if (isOwner) {
        icon.textContent = '✏️';
        btn.querySelector('strong').innerHTML = 'Continuar tu partida';
        subtitle.textContent = `Partida ${live.partidaNum} — ${live.teamAName} vs ${live.teamBName}`;
        btn.onclick = () => showToast('Para continuar anotando, esta partida sigue abierta en la pantalla de juego de tu dispositivo si no la cerraste. Si la cerraste, no es posible recuperar la sesión de anotación — solo verla.');
      } else {
        icon.textContent = '📡';
        btn.querySelector('strong').innerHTML = '<span class="live-dot"></span>Ver partida en directo';
        subtitle.textContent = `Partida ${live.partidaNum} — ${live.teamAName} vs ${live.teamBName}`;
        btn.onclick = goToLiveView;
      }
    } else {
      btn.style.display = 'none';
    }
  } catch (e) { /* ignore */ }
}

function goToLiveView() {
  showScreen('screen-liveview');
  if (liveViewListener) db.ref('live/current').off('value', liveViewListener);
  liveViewListener = (snap) => {
    const live = snap.val();
    if (!live || !live.active) {
      showToast('La partida ha terminado');
      leaveLiveView();
      return;
    }
    renderLiveView(live);
  };
  db.ref('live/current').on('value', liveViewListener);
}

function leaveLiveView() {
  if (liveViewListener) {
    db.ref('live/current').off('value', liveViewListener);
    liveViewListener = null;
  }
  goHome();
}

function renderLiveView(live) {
  document.getElementById('lvPartidaNum').textContent = live.partidaNum;
  document.getElementById('lvNameA').textContent = live.teamAName;
  document.getElementById('lvNameB').textContent = live.teamBName;
  document.getElementById('lvScoreA').textContent = live.scoreA;
  document.getElementById('lvScoreB').textContent = live.scoreB;
  document.getElementById('lvRoundLabel').textContent = `Juego ${live.juegoNum} — ${live.turnTeamName}`;

  const banner = document.getElementById('lvLlevarBanner');
  if (live.roundNumA > 0 && live.roundNumA === live.roundNumB) {
    const diff = live.scoreA - live.scoreB;
    banner.style.display = 'block';
    banner.textContent = diff === 0
      ? `Empatados a ${live.scoreA} bolos`
      : `${diff > 0 ? live.teamAName : live.teamBName} lleva ${Math.abs(diff)} bolos`;
  } else {
    banner.style.display = 'none';
  }

  const strip = document.getElementById('lvHistoryStrip');
  strip.innerHTML = (live.juegoHistory || []).map((g, idx) => {
    const winnerName = g.winner === 'A' ? live.teamAName : live.teamBName;
    return `<span class="game-pill ${g.winner === 'A' ? 'won-a' : 'won-b'}">J${idx+1}: ${winnerName.replace('Equipo de ','')} (${g.scoreA}-${g.scoreB})</span>`;
  }).join('');

  document.getElementById('lvTurnTeamLabel').textContent = `TIRA ${live.turnTeamName.toUpperCase()}`;
  document.getElementById('lvTurnPlayerName').textContent = live.turnPlayerName;
  const dirEl = document.getElementById('lvTurnDirection');
  dirEl.textContent = live.turnDirection === 'arriba' ? 'Para arriba' : 'Para abajo';
  dirEl.className = 'turn-direction ' + live.turnDirection;

  document.getElementById('lvRoundLogTitle').textContent = `Tiradas de esta ronda — ${live.turnTeamName}`;
  const entries = document.getElementById('lvRoundLogEntries');
  const throws = live.currentRoundThrows || [];
  if (throws.length === 0) {
    entries.innerHTML = '<div class="log-entry"><span class="name" style="opacity:0.5;">Todavía no hay tiradas en esta ronda</span></div>';
  } else {
    entries.innerHTML = throws.map(t => `
      <div class="log-entry">
        <span class="name"><span class="log-color-chip" style="background:${t.color || '#c9982f'}"></span>${escapeHtmlApp(t.player)} (${t.dir === 'arriba' ? '↑' : '↓'})</span>
        <span class="val">${t.value}</span>
      </div>
    `).join('');
  }
}
function endJuego(winnerTeam, totalA, totalB, options) {
  options = options || {};
  state.juegosGanados[winnerTeam]++;
  const allThrowsThisJuego = state.rounds.flatMap(r => r.throws);
  state.juegoHistory.push({
    winner: winnerTeam, scoreA: totalA, scoreB: totalB,
    rounds: state.rounds.slice(),
    dadoPor: options.dadoPor || null
  });

  saveJuegoToFirebase(winnerTeam, totalA, totalB, options.dadoPor || null);

  const winnerName = winnerTeam === 'A' ? state.teamA.name : state.teamB.name;
  document.getElementById('jrPartidaNum').textContent = state.partidaNum;
  document.getElementById('jrWinnerName').textContent = `Gana ${winnerName}`;
  document.getElementById('jrScoreText').textContent = `${totalA} - ${totalB}`;

  const dadoPorEl = document.getElementById('jrDadoPorNote');
  if (options.dadoPor) {
    dadoPorEl.style.display = 'block';
    dadoPorEl.textContent = `🏳️ ${options.dadoPor} ha dado el juego`;
  } else {
    dadoPorEl.style.display = 'none';
  }

  renderGameHistoryStrip('jrHistoryStrip');
  renderMvpBanner('jrMvpContainer', allThrowsThisJuego);

  const matchDecided = state.juegosGanados.A >= 2 || state.juegosGanados.B >= 2;
  document.getElementById('jrContinueBtn').textContent = matchDecided ? 'Ver resultado de la partida →' : 'Siguiente juego →';

  showScreen('screen-juego-result');
}

async function saveJuegoToFirebase(winnerTeam, totalA, totalB, dadoPor) {
  try {
    await db.ref('partidas/' + state.partidaNum).update({
      numero: state.partidaNum,
      fecha: new Date().toISOString(),
      teamAName: state.teamA.name,
      teamBName: state.teamB.name,
      teamAPlayers: state.teamA.players.map(p => p.name),
      teamBPlayers: state.teamB.players.map(p => p.name),
      juegosGanadosA: state.juegosGanados.A,
      juegosGanadosB: state.juegosGanados.B
    });
    await db.ref('partidas/' + state.partidaNum + '/juegos/' + state.juegoNum).set({
      numero: state.juegoNum,
      winner: winnerTeam,
      totalA, totalB,
      rounds: state.rounds,
      dadoPor: dadoPor || null
    });
  } catch (e) {
    console.error('Error guardando juego', e);
    showToast('⚠️ Error guardando datos');
  }
}

function continueAfterJuego() {
  const matchDecided = state.juegosGanados.A >= 2 || state.juegosGanados.B >= 2;
  if (matchDecided) {
    finishPartida();
    return;
  }
  state.juegoNum++;
  goToPlantScreen();
}

async function finishPartida() {
  const winnerTeam = state.juegosGanados.A >= 2 ? 'A' : 'B';
  const winnerName = winnerTeam === 'A' ? state.teamA.name : state.teamB.name;

  try {
    await db.ref('partidas/' + state.partidaNum).update({
      ganador: winnerTeam,
      ganadorNombre: winnerName,
      finalizada: true
    });
  } catch (e) { console.error(e); }

  document.getElementById('prWinnerName').textContent = winnerName;
  document.getElementById('prScoreText').textContent = `Gana la partida ${state.juegosGanados.A}-${state.juegosGanados.B}`;
  renderGameHistoryStrip('prHistoryStrip');
  renderMvpBanner('prMvpContainer', getAllThrowsForPartida());

  clearLiveState();

  nextPartidaNum = state.partidaNum + 1;
  // reset team slots/colors for next match
  teamSlotsData = { A: [], B: [] };
  playerColorAssignment = {};
  showScreen('screen-partida-result');
}

function getAllThrowsForPartida() {
  const all = [];
  state.juegoHistory.forEach(g => {
    g.rounds.forEach(r => all.push(...r.throws));
  });
  return all;
}

function calculateMvp(throwsArray) {
  const totals = {};
  const photos = {};
  throwsArray.forEach(t => {
    totals[t.player] = (totals[t.player] || 0) + t.value;
    if (t.player && !photos[t.player]) photos[t.player] = getPlayerPhoto(t.player);
  });
  const names = Object.keys(totals);
  if (names.length === 0) return null;
  const best = names.reduce((a, b) => totals[a] >= totals[b] ? a : b);
  return { name: best, total: totals[best], photo: photos[best] };
}

function renderMvpBanner(containerId, throwsArray) {
  const container = document.getElementById(containerId);
  const mvp = calculateMvp(throwsArray);
  if (!mvp) { container.innerHTML = ''; return; }

  const photoHtml = mvp.photo
    ? `<img class="mvp-photo" src="${mvp.photo}">`
    : `<div class="mvp-photo placeholder">⭐</div>`;

  container.innerHTML = `
    <div class="mvp-banner">
      <div class="mvp-label">⭐ MVP</div>
      ${photoHtml}
      <div class="mvp-name">${escapeHtmlApp(mvp.name)}</div>
      <div class="mvp-count">${mvp.total} bolos tirados</div>
    </div>
  `;
}

function confirmAbandon() {
  if (confirm('¿Seguro que quieres salir? Se perderá el progreso de este juego (lo ya guardado de juegos anteriores se mantiene).')) {
    clearLiveState();
    goHome();
  }
}

/* ============== STATS SCREEN ============== */
let allPartidasCache = {};
let allThrowsCache = {};

async function goToStats() {
  showScreen('screen-stats');
  await loadStatsData();
  showStatsTab('partidas', document.querySelector('.stats-tab'));
}

function goToStatsPartida() { goToStats(); }

async function loadStatsData() {
  try {
    const snap = await db.ref('partidas').get();
    allPartidasCache = snap.val() || {};
  } catch (e) { allPartidasCache = {}; }

  try {
    const throwsSnap = await db.ref('partidas_throws').get();
    const all = throwsSnap.val() || {};
    allThrowsCache = {};
    Object.values(all).forEach(partidaThrows => {
      Object.assign(allThrowsCache, partidaThrows);
    });
  } catch (e) { allThrowsCache = {}; }
}

function showStatsTab(tab, btn) {
  document.querySelectorAll('.stats-tab').forEach(t => t.classList.remove('active'));
  if (btn) btn.classList.add('active');
  document.getElementById('statsTabPartidas').style.display = tab === 'partidas' ? 'block' : 'none';
  document.getElementById('statsTabTotales').style.display = tab === 'totales' ? 'block' : 'none';
  document.getElementById('statsTabConcurso').style.display = tab === 'concurso' ? 'block' : 'none';

  if (tab === 'partidas') renderPartidasList();
  else if (tab === 'totales') renderTotalesDelDia();
  else renderConcursoStatsTab();
}

function renderPartidasList() {
  const container = document.getElementById('statsTabPartidas');
  const partidas = Object.entries(allPartidasCache)
    .map(([id, p]) => ({ id, ...p }))
    .filter(p => p.numero)
    .sort((a, b) => (b.numero || 0) - (a.numero || 0));

  if (partidas.length === 0) {
    container.innerHTML = `<div class="empty-state"><div class="icon">🎯</div><p>Todavía no se ha jugado ninguna partida</p></div>`;
    return;
  }

  container.innerHTML = '';
  partidas.forEach(p => {
    const card = document.createElement('div');
    card.className = 'partida-card';
    const fecha = p.fecha ? new Date(p.fecha).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' }) : '';
    const status = p.finalizada
      ? `<span class="pc-winner">${(p.ganadorNombre || '').replace('Equipo de ', 'Gana ')}</span>`
      : `<span style="color:var(--chalk-dim)">En curso</span>`;
    card.innerHTML = `
      <div class="pc-top"><span class="pc-num">Partida ${p.numero}</span><span class="pc-date">${fecha}</span></div>
      <div class="pc-teams">${(p.teamAName||'Equipo A')} vs ${(p.teamBName||'Equipo B')}</div>
      <div style="margin-top:6px;">${status} ${p.finalizada ? `(${p.juegosGanadosA}-${p.juegosGanadosB})` : ''}</div>
    `;
    card.onclick = () => showPartidaDetail(p);
    container.appendChild(card);
  });
}

/* ============== SEARCH BY DATE ============== */
async function goToSearchByDate() {
  showScreen('screen-searchdate');
  await loadStatsData();
  document.getElementById('searchDateResults').innerHTML = '<div class="empty-state"><div class="icon">📅</div><p>Elige una fecha para ver las partidas de ese día</p></div>';
}

function searchPartidasByDate() {
  const dateVal = document.getElementById('searchDateInput').value; // "YYYY-MM-DD"
  const container = document.getElementById('searchDateResults');
  if (!dateVal) { container.innerHTML = ''; return; }

  const partidas = Object.entries(allPartidasCache)
    .map(([id, p]) => ({ id, ...p }))
    .filter(p => p.numero && p.fecha && p.fecha.startsWith(dateVal))
    .sort((a, b) => (a.numero || 0) - (b.numero || 0));

  if (partidas.length === 0) {
    container.innerHTML = `<div class="empty-state"><div class="icon">🎯</div><p>No hay partidas registradas ese día</p></div>`;
    return;
  }

  container.innerHTML = '';
  partidas.forEach(p => {
    const card = document.createElement('div');
    card.className = 'partida-card';
    const status = p.finalizada
      ? `<span class="pc-winner">${(p.ganadorNombre || '').replace('Equipo de ', 'Gana ')}</span>`
      : `<span style="color:var(--chalk-dim)">En curso</span>`;
    card.innerHTML = `
      <div class="pc-top"><span class="pc-num">Partida ${p.numero}</span></div>
      <div class="pc-teams">${(p.teamAName||'Equipo A')} vs ${(p.teamBName||'Equipo B')}</div>
      <div style="margin-top:6px;">${status} ${p.finalizada ? `(${p.juegosGanadosA}-${p.juegosGanadosB})` : ''}</div>
    `;
    card.onclick = () => showPartidaDetail(p);
    container.appendChild(card);
  });
}

function showPartidaDetail(p) {
  const modal = document.getElementById('detailModalContent');
  const juegos = p.juegos ? Object.values(p.juegos) : [];

  let juegosHtml = juegos.map(j => `
    <div class="juego-detail-row" style="flex-direction:column; align-items:flex-start; gap:2px;">
      <div style="display:flex; justify-content:space-between; width:100%;">
        <span>Juego ${j.numero}</span>
        <span style="color:var(--gold); font-weight:700;">${j.totalA} - ${j.totalB}</span>
      </div>
      ${j.dadoPor ? `<span style="font-size:0.68rem; color:var(--chalk-dim); font-style:italic;">🏳️ ${escapeHtmlApp(j.dadoPor)} dio el juego</span>` : ''}
    </div>
  `).join('') || '<p style="color:var(--chalk-dim); font-size:0.85rem;">Sin juegos registrados todavía.</p>';

  const partidaThrows = Object.values(allThrowsCache).filter(t => t.partidaNum === p.numero);
  const playerStatsHtml = buildPlayerStatsHtml(partidaThrows);

  const deleteBtnHtml = isAdminMode
    ? `<button class="danger-action" onclick="adminDeletePartida(${p.numero})">🗑️ Borrar esta partida</button>`
    : '';

  modal.innerHTML = `
    <h3>Partida ${p.numero} — ${(p.teamAName||'')} vs ${(p.teamBName||'')}</h3>
    ${juegosHtml}
    <div style="margin-top:18px;">
      <div class="round-log-title">Estadísticas de jugadores en esta partida</div>
      ${playerStatsHtml}
    </div>
    ${deleteBtnHtml}
    <button class="modal-close-btn" onclick="closeDetailModal()">Cerrar</button>
  `;
  document.getElementById('detailModal').classList.add('visible');
}

async function adminDeletePartida(numero) {
  if (!isAdminMode) { showToast('⚠️ Necesitas modo administrador'); return; }
  if (!confirm(`¿Borrar la partida ${numero}? Esta acción no se puede deshacer.`)) return;

  try {
    await db.ref('partidas/' + numero).remove();
    await db.ref('partidas_throws/' + numero).remove();
    showToast('🗑️ Partida borrada');
    closeDetailModal();
    await loadStatsData();
    renderPartidasList();
  } catch (e) {
    console.error(e);
    showToast('⚠️ Error al borrar');
  }
}

function closeDetailModal() { document.getElementById('detailModal').classList.remove('visible'); }

function renderTotalesDelDia() {
  const container = document.getElementById('statsTabTotales');
  const allThrows = Object.values(allThrowsCache);

  if (allThrows.length === 0) {
    container.innerHTML = `<div class="empty-state"><div class="icon">📊</div><p>Todavía no hay tiradas registradas</p></div>`;
    return;
  }

  container.innerHTML = `
    <div class="round-log-title" style="margin-bottom:14px;">Estadísticas acumuladas de todos los jugadores</div>
    ${buildPlayerStatsHtml(allThrows)}
  `;
}

function buildPlayerStatsHtml(throwsArray) {
  const byPlayer = {};
  throwsArray.forEach(t => {
    if (!byPlayer[t.player]) byPlayer[t.player] = [];
    byPlayer[t.player].push(t);
  });

  const names = Object.keys(byPlayer).sort((a, b) => a.localeCompare(b, 'es'));
  if (names.length === 0) return '<p style="color:var(--chalk-dim); font-size:0.85rem;">Sin datos.</p>';

  return names.map(name => {
    const throws = byPlayer[name];
    const total = throws.reduce((s, t) => s + t.value, 0);
    const avg = (total / throws.length).toFixed(1);

    const arriba = throws.filter(t => t.dir === 'arriba');
    const abajo = throws.filter(t => t.dir === 'abajo');

    const histArriba = buildHistogram(arriba, 9);
    const histAbajo = buildHistogram(abajo, 6);

    return `
      <div class="player-stat-card">
        <div class="ps-name">${escapeHtmlApp(name)}</div>
        <div class="ps-metrics">
          <div class="ps-metric"><div class="num">${total}</div><div class="lbl">Total bolos</div></div>
          <div class="ps-metric"><div class="num">${avg}</div><div class="lbl">Media/tirada</div></div>
          <div class="ps-metric"><div class="num">${throws.length}</div><div class="lbl">Tiradas</div></div>
        </div>
        ${arriba.length ? `<div style="font-size:0.65rem; color:var(--chalk-dim); margin-bottom:4px;">Para arriba (0-9)</div>${histArriba}` : ''}
        ${abajo.length ? `<div style="font-size:0.65rem; color:var(--chalk-dim); margin:10px 0 4px;">Para abajo (0-6)</div>${histAbajo}` : ''}
      </div>
    `;
  }).join('');
}

function buildHistogram(throws, max) {
  const counts = new Array(max + 1).fill(0);
  throws.forEach(t => { if (t.value >= 0 && t.value <= max) counts[t.value]++; });
  const maxCount = Math.max(...counts, 1);

  const bars = counts.map((c, val) => `
    <div class="hist-bar-wrap">
      <div class="hist-bar" style="height:${Math.max(4, (c / maxCount) * 100)}%"></div>
      <div class="hist-label">${val}</div>
    </div>
  `).join('');

  return `<div class="histogram">${bars}</div>`;
}

/* ============== PLAYERS DATABASE SCREEN ============== */
async function goToPlayersDb() {
  showScreen('screen-playersdb');
  await loadPlayerDatabase();
  await loadStatsData();
  document.getElementById('adminAddPlayerBox').style.display = isAdminMode ? 'block' : 'none';
  renderPlayersDbList();
}

function renderPlayersDbList() {
  document.getElementById('adminAddPlayerBox').style.display = isAdminMode ? 'block' : 'none';
  const container = document.getElementById('playersDbList');
  const names = getAllPlayerNames();

  if (names.length === 0) {
    container.innerHTML = `<div class="empty-state"><div class="icon">👥</div><p>Todavía no hay jugadores en la base de datos</p></div>`;
    return;
  }

  container.innerHTML = '';
  names.forEach(name => {
    const photo = getPlayerPhoto(name);
    const item = document.createElement('div');
    item.className = 'player-db-item';
    const photoHtml = photo
      ? `<img class="db-photo" src="${photo}">`
      : `<div class="db-photo placeholder">👤</div>`;
    item.innerHTML = `${photoHtml}<span class="db-name">${escapeHtmlApp(name)}</span><span class="db-arrow">›</span>`;
    item.onclick = () => goToPlayerDetail(name);
    container.appendChild(item);
  });
}

async function adminCreatePlayer() {
  if (!isAdminMode) { showToast('⚠️ Necesitas modo administrador'); return; }
  const input = document.getElementById('adminNewPlayerName');
  const name = input.value.trim();
  if (!name) { showToast('⚠️ Escribe un nombre'); return; }

  const existing = getAllPlayerNames().find(n => n.toLowerCase() === name.toLowerCase());
  if (existing) { showToast('⚠️ Ese jugador ya existe'); return; }

  await addPlayerToDatabase(name);
  input.value = '';
  renderPlayersDbList();
  showToast('✅ Jugador añadido a la base de datos');
}

async function goToPlayerDetail(name) {
  showScreen('screen-playerdetail');
  document.getElementById('pdName').textContent = name;
  await loadStatsData();
  renderPlayerDetail(name);
}

function renderPlayerDetail(name) {
  const content = document.getElementById('pdContent');
  const throws = Object.values(allThrowsCache).filter(t => t.player === name);
  const photo = getPlayerPhoto(name);

  // Count distinct juegos played (partidaNum + juegoNum combos)
  const juegoKeys = new Set(throws.map(t => t.partidaNum + '_' + t.juegoNum));
  const totalBolos = throws.reduce((s, t) => s + t.value, 0);
  const avg = throws.length ? (totalBolos / throws.length).toFixed(1) : '0.0';

  const photoHtml = photo
    ? `<img class="mvp-photo" src="${photo}" style="margin-bottom:14px;">`
    : `<div class="mvp-photo placeholder" style="margin-bottom:14px;">👤</div>`;

  const arriba = throws.filter(t => t.dir === 'arriba');
  const abajo = throws.filter(t => t.dir === 'abajo');

  const adminButtonsHtml = isAdminMode ? `
    <div style="display:flex; gap:8px; margin-top:18px;">
      <button class="secondary-action" style="margin-top:0;" onclick="adminChangePlayerPhoto('${escapeJs(name)}')">📷 Cambiar foto</button>
      <button class="danger-action" style="margin-top:0;" onclick="adminDeletePlayer('${escapeJs(name)}')">🗑️ Borrar jugador</button>
    </div>
  ` : '';

  content.innerHTML = `
    <div style="text-align:center;">${photoHtml}</div>
    <div class="ps-metrics" style="justify-content:center; margin-bottom:20px;">
      <div class="ps-metric"><div class="num">${juegoKeys.size}</div><div class="lbl">Juegos jugados</div></div>
      <div class="ps-metric"><div class="num">${throws.length}</div><div class="lbl">Tiradas</div></div>
      <div class="ps-metric"><div class="num">${totalBolos}</div><div class="lbl">Bolos totales</div></div>
      <div class="ps-metric"><div class="num">${avg}</div><div class="lbl">Media/tirada</div></div>
    </div>
    ${arriba.length ? `<div style="font-size:0.68rem; color:var(--chalk-dim); margin-bottom:6px;">Para arriba (0-9)</div>${buildHistogram(arriba, 9)}` : ''}
    ${abajo.length ? `<div style="font-size:0.68rem; color:var(--chalk-dim); margin:14px 0 6px;">Para abajo (0-6)</div>${buildHistogram(abajo, 6)}` : ''}
    ${!throws.length ? '<p style="text-align:center; color:var(--chalk-dim); font-size:0.85rem; margin-top:20px;">Este jugador todavía no ha tirado ninguna partida.</p>' : ''}
    ${adminButtonsHtml}
  `;
}

function adminChangePlayerPhoto(name) {
  if (!isAdminMode) { showToast('⚠️ Necesitas modo administrador'); return; }
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    resizePlayerPhoto(file, async (dataUrl) => {
      await savePlayerPhoto(name, dataUrl);
      renderPlayerDetail(name);
      showToast('✅ Foto actualizada');
    });
  };
  input.click();
}

async function adminDeletePlayer(name) {
  if (!isAdminMode) { showToast('⚠️ Necesitas modo administrador'); return; }
  if (!confirm(`¿Borrar a ${name} de la base de datos? Las estadísticas de partidas ya jugadas se conservan, pero no podrás volver a elegirlo salvo que lo crees de nuevo.`)) return;

  const id = findPlayerIdByName(name);
  if (id) {
    await db.ref('jugadores/' + id).remove();
    delete playerDatabase[id];
  }
  showToast('🗑️ Jugador borrado de la base de datos');
  goToPlayersDb();
}

/* Override continueAfterJuego flow: juego 1 uses coin toss screen, 2+ uses plant screen automatically */

/* ====================================================================
   MODO CONCURSO — concurso individual con 4 / a bolos
   ==================================================================== */

const CONCURSO_RULES = {
  con4:    { maxArriba: 9, maxAbajo: 6, throwsPerDirection: 3, label: 'Concurso con 4' },
  abolos:  { maxArriba: 6, maxAbajo: 6, throwsPerDirection: 2, label: 'Concurso a bolos' }
};

let concursoState = {
  type: null,            // 'con4' | 'abolos'
  concursoNum: null,
  players: [],           // [{name, color, photo}]
  results: {},           // { playerName: { throws: [...], total } }
  playerOrder: [],
  currentPlayerIdx: 0,
  currentDirection: 'arriba',
  currentThrowCount: 0,
  currentThrows: [],
  isTiebreak: false,
  tiebreakPlayers: []
};

let concursoSlotsData = [];
let concursoSharedCount = 4;
let nextConcursoNum = 1;

async function initConcursoNum() {
  try {
    const snap = await db.ref('concursos').get();
    const concursos = snap.val() || {};
    const nums = Object.values(concursos).filter(c => c.numero).map(c => c.numero);
    nextConcursoNum = nums.length ? Math.max(...nums) + 1 : 1;
  } catch (e) { nextConcursoNum = 1; }
}
initConcursoNum();

function goToConcursoTypeSelect() {
  showScreen('screen-concurso-type');
}

function selectConcursoType(type) {
  concursoState.type = type;
  concursoSharedCount = type === 'con4' ? 4 : 4;
  document.getElementById('concursoSetupEyebrow').textContent = CONCURSO_RULES[type].label;
  document.getElementById('concursoCountDisplay').textContent = concursoSharedCount;
  concursoSlotsData = [];
  renderConcursoSlots();
  showScreen('screen-concurso-setup');
}

function changeConcursoPlayerCount(delta) {
  concursoSharedCount = Math.max(2, Math.min(12, concursoSharedCount + delta));
  document.getElementById('concursoCountDisplay').textContent = concursoSharedCount;
  renderConcursoSlots();
}

function renderConcursoSlots() {
  const container = document.getElementById('concursoPlayersList');
  while (concursoSlotsData.length < concursoSharedCount) concursoSlotsData.push({ name: null });
  while (concursoSlotsData.length > concursoSharedCount) concursoSlotsData.pop();

  container.innerHTML = '';
  concursoSlotsData.forEach((slot, i) => {
    const row = document.createElement('div');
    row.className = 'player-slot-row';
    const btn = document.createElement('button');
    btn.className = 'player-pick-btn' + (slot.name ? '' : ' empty');
    if (slot.name) {
      const photo = getPlayerPhoto(slot.name);
      const photoHtml = photo ? `<img class="player-photo-thumb" src="${photo}">` : `<div class="player-photo-thumb placeholder">👤</div>`;
      btn.innerHTML = `${photoHtml}<span>${escapeHtmlApp(slot.name)}</span>`;
    } else {
      btn.textContent = 'Elegir jugador';
    }
    btn.onclick = () => openConcursoPickerModal(i);
    row.innerHTML = `<span class="concurso-order-num">${i + 1}</span>`;
    row.appendChild(btn);
    container.appendChild(row);
  });
}

let concursoPickerSlotIndex = null;

function openConcursoPickerModal(slotIndex) {
  concursoPickerSlotIndex = slotIndex;
  renderConcursoPickerModal('');
  document.getElementById('pickerModal').classList.add('visible');
}

function renderConcursoPickerModal(filterText) {
  const modal = document.getElementById('pickerModalContent');
  const allNames = getAllPlayerNames();
  const taken = new Set(concursoSlotsData.map((s, i) => i !== concursoPickerSlotIndex ? s.name : null).filter(Boolean));
  const filtered = allNames.filter(n => n.toLowerCase().includes(filterText.toLowerCase()));

  const itemsHtml = filtered.map(name => {
    const isTaken = taken.has(name);
    const photo = getPlayerPhoto(name);
    const photoHtml = photo ? `<img class="photo-thumb-small" src="${photo}">` : `<div class="photo-thumb-small placeholder">👤</div>`;
    return `
      <div class="picker-item ${isTaken ? 'disabled' : ''}" onclick="${isTaken ? '' : `selectConcursoPlayer('${escapeJs(name)}')`}">
        ${photoHtml}<span>${escapeHtmlApp(name)}</span>
        ${isTaken ? '<span class="taken-tag">ya elegido</span>' : ''}
      </div>
    `;
  }).join('') || '<p style="color:var(--chalk-dim); font-size:0.85rem; padding:10px 0;">Sin resultados.</p>';

  modal.innerHTML = `
    <h3>Elegir jugador</h3>
    <input type="text" class="picker-search" placeholder="Buscar jugador..." value="${escapeHtmlApp(filterText)}" oninput="renderConcursoPickerModal(this.value)">
    <div class="picker-list">${itemsHtml}</div>
    <div class="new-player-row" style="margin-bottom:10px;">
      <input type="text" class="text-input" id="newConcursoPlayerName" placeholder="Nombre de jugador nuevo">
      <button onclick="createAndSelectConcursoPlayer()">Crear</button>
    </div>
    <button class="modal-close-btn" onclick="document.getElementById('pickerModal').classList.remove('visible')">Cancelar</button>
  `;
}

function selectConcursoPlayer(name) {
  concursoSlotsData[concursoPickerSlotIndex] = { name };
  if (!playerColorAssignment[name]) assignColorToPlayer(name);
  renderConcursoSlots();
  document.getElementById('pickerModal').classList.remove('visible');
}

async function createAndSelectConcursoPlayer() {
  const input = document.getElementById('newConcursoPlayerName');
  const name = input.value.trim();
  if (!name) { showToast('⚠️ Escribe un nombre'); return; }
  const existing = getAllPlayerNames().find(n => n.toLowerCase() === name.toLowerCase());
  if (existing) { selectConcursoPlayer(existing); return; }
  await addPlayerToDatabase(name);
  selectConcursoPlayer(name);
  showToast('✅ Jugador creado');
}

function startConcurso() {
  const names = concursoSlotsData.map(s => s.name);
  if (names.some(n => !n)) { showToast('⚠️ Elige todos los jugadores'); return; }

  concursoState.concursoNum = nextConcursoNum;
  concursoState.players = names.map(n => ({ name: n, color: playerColorAssignment[n], photo: getPlayerPhoto(n) }));
  concursoState.results = {};
  names.forEach(n => { concursoState.results[n] = { throws: [], total: 0 }; });
  concursoState.playerOrder = names.slice();
  concursoState.currentPlayerIdx = 0;
  concursoState.currentDirection = 'arriba';
  concursoState.currentThrowCount = 0;
  concursoState.currentThrows = [];
  concursoState.isTiebreak = false;
  concursoState.tiebreakPlayers = [];

  document.getElementById('concursoLiveEyebrow').textContent = CONCURSO_RULES[concursoState.type].label;

  db.ref('concursos/' + concursoState.concursoNum).set({
    numero: concursoState.concursoNum,
    type: concursoState.type,
    fecha: new Date().toISOString(),
    players: names
  }).catch(() => {});

  renderConcursoTurn();
  showScreen('screen-concurso-live');
}

function getConcursoRules() { return CONCURSO_RULES[concursoState.type]; }

function renderConcursoTurn() {
  const rules = getConcursoRules();
  const playerList = concursoState.isTiebreak ? concursoState.tiebreakPlayers : concursoState.playerOrder;
  const playerName = playerList[concursoState.currentPlayerIdx];
  const playerObj = concursoState.players.find(p => p.name === playerName);

  document.getElementById('concursoTurnPlayerName').textContent = playerName;
  document.getElementById('concursoTurnLabel').textContent =
    (concursoState.isTiebreak ? 'DESEMPATE · ' : '') +
    `JUGADOR ${concursoState.currentPlayerIdx + 1} DE ${playerList.length}`;

  const turnCard = document.getElementById('concursoTurnCard');
  turnCard.style.setProperty('--player-color', (playerObj && playerObj.color) || '#c9982f');

  const photoEl = document.getElementById('concursoTurnPhoto');
  if (playerObj && playerObj.photo) {
    photoEl.src = playerObj.photo;
    photoEl.style.display = 'block';
  } else {
    photoEl.style.display = 'none';
  }

  const dirEl = document.getElementById('concursoTurnDirection');
  const maxThrows = rules.throwsPerDirection;
  const currentNum = concursoState.currentThrowCount + 1;
  dirEl.textContent = `${concursoState.currentDirection === 'arriba' ? 'Para arriba' : 'Para abajo'} — tirada ${currentNum} de ${maxThrows}`;
  dirEl.className = 'turn-direction ' + concursoState.currentDirection;

  document.getElementById('concursoLiveTitle').textContent = `Turno de ${playerName}`;

  const flash = document.getElementById('concursoPartialFlash');
  if (concursoState.currentThrows.length === 0) {
    flash.style.display = 'none';
  } else {
    const acc = concursoState.currentThrows.reduce((s, t) => s + t.value, 0);
    flash.style.display = 'block';
    flash.innerHTML = `Acumulado de ${playerName}: <strong>${acc}</strong>`;
  }

  renderConcursoPinsGrid();
  renderConcursoLog();
}

function renderConcursoPinsGrid() {
  const rules = getConcursoRules();
  const grid = document.getElementById('concursoPinsGrid');
  grid.innerHTML = '';
  const max = concursoState.currentDirection === 'arriba' ? rules.maxArriba : rules.maxAbajo;
  grid.className = 'pins-grid' + (max <= 6 ? ' seven' : '');
  for (let i = 0; i <= max; i++) {
    const btn = document.createElement('button');
    btn.className = 'pin-btn';
    btn.textContent = i;
    btn.onclick = () => registerConcursoThrow(i);
    grid.appendChild(btn);
  }
}

function renderConcursoLog() {
  const playerList = concursoState.isTiebreak ? concursoState.tiebreakPlayers : concursoState.playerOrder;
  const playerName = playerList[concursoState.currentPlayerIdx];
  document.getElementById('concursoLogTitle').textContent = `Tiradas de ${playerName}`;

  const entries = document.getElementById('concursoLogEntries');
  entries.innerHTML = '';
  if (concursoState.currentThrows.length === 0) {
    entries.innerHTML = '<div class="log-entry"><span class="name" style="opacity:0.5;">Todavía no hay tiradas</span></div>';
    return;
  }
  concursoState.currentThrows.forEach((t, idx) => {
    const row = document.createElement('div');
    row.className = 'log-entry';
    row.innerHTML = `
      <span class="name">${t.dir === 'arriba' ? '↑' : '↓'} Tirada ${idx + 1}</span>
      <span style="display:flex; align-items:center; gap:8px;">
        <span class="val">${t.value}</span>
        <span class="edit-icon" onclick="openEditConcursoThrowModal(${idx})">✏️</span>
      </span>
    `;
    entries.appendChild(row);
  });
}

function registerConcursoThrow(value) {
  concursoState.currentThrows.push({ dir: concursoState.currentDirection, value });
  advanceConcursoTurn();
}

function openEditConcursoThrowModal(idx) {
  editThrowContext = idx;
  const t = concursoState.currentThrows[idx];
  const rules = getConcursoRules();
  const max = t.dir === 'arriba' ? rules.maxArriba : rules.maxAbajo;

  const modal = document.getElementById('editThrowModalContent');
  let buttonsHtml = '';
  for (let i = 0; i <= max; i++) {
    buttonsHtml += `<button class="pin-btn" style="aspect-ratio:auto; padding:14px 0;" onclick="applyEditConcursoThrow(${i})">${i}</button>`;
  }
  modal.innerHTML = `
    <h3>Corregir tirada (${t.dir === 'arriba' ? 'para arriba' : 'para abajo'})</h3>
    <p style="color:var(--chalk-dim); font-size:0.85rem; margin-bottom:14px;">Valor actual: <strong style="color:var(--gold)">${t.value}</strong></p>
    <div class="pins-grid${max <= 6 ? ' seven' : ''}" style="margin-bottom:16px;">${buttonsHtml}</div>
    <button class="modal-close-btn" onclick="closeEditThrowModal()">Cancelar</button>
  `;
  document.getElementById('editThrowModal').classList.add('visible');
}

function applyEditConcursoThrow(newValue) {
  concursoState.currentThrows[editThrowContext].value = newValue;
  closeEditThrowModal();
  renderConcursoLog();
  showToast('✅ Tirada corregida');
}

function advanceConcursoTurn() {
  const rules = getConcursoRules();
  concursoState.currentThrowCount++;

  if (concursoState.currentThrowCount < rules.throwsPerDirection) {
    renderConcursoTurn();
    return;
  }

  concursoState.currentThrowCount = 0;

  if (concursoState.currentDirection === 'arriba') {
    concursoState.currentDirection = 'abajo';
    renderConcursoTurn();
    return;
  }

  // Player finished both directions
  finishConcursoPlayerTurn();
}

function finishConcursoPlayerTurn() {
  const playerList = concursoState.isTiebreak ? concursoState.tiebreakPlayers : concursoState.playerOrder;
  const playerName = playerList[concursoState.currentPlayerIdx];
  const total = concursoState.currentThrows.reduce((s, t) => s + t.value, 0);

  if (concursoState.isTiebreak) {
    concursoState.tiebreakResults = concursoState.tiebreakResults || {};
    concursoState.tiebreakResults[playerName] = { throws: concursoState.currentThrows.slice(), total };
  } else {
    concursoState.results[playerName].throws = concursoState.currentThrows.slice();
    concursoState.results[playerName].total = total;

    // Persist individual throws for stats
    concursoState.currentThrows.forEach(t => {
      db.ref('concursos_throws/' + concursoState.concursoNum).push({
        concursoNum: concursoState.concursoNum,
        type: concursoState.type,
        player: playerName,
        dir: t.dir,
        value: t.value,
        timestamp: Date.now()
      }).catch(() => {});
    });
  }

  concursoState.currentThrows = [];
  concursoState.currentDirection = 'arriba';
  concursoState.currentThrowCount = 0;

  const isLastPlayer = concursoState.currentPlayerIdx === playerList.length - 1;
  if (!isLastPlayer) {
    concursoState.currentPlayerIdx++;
    renderConcursoTurn();
    return;
  }

  if (concursoState.isTiebreak) {
    finishTiebreak();
  } else {
    finishConcurso();
  }
}

function finishConcurso() {
  const sorted = Object.entries(concursoState.results)
    .map(([name, r]) => ({ name, total: r.total }))
    .sort((a, b) => b.total - a.total);

  const topScore = sorted[0].total;
  const tiedLeaders = sorted.filter(p => p.total === topScore);

  if (tiedLeaders.length > 1) {
    startTiebreak(tiedLeaders.map(p => p.name));
    return;
  }

  saveConcursoResult(sorted);
  renderConcursoResultScreen(sorted);
}

function startTiebreak(tiedNames) {
  concursoState.isTiebreak = true;
  concursoState.tiebreakPlayers = tiedNames;
  concursoState.tiebreakResults = {};
  concursoState.currentPlayerIdx = 0;
  concursoState.currentDirection = 'arriba';
  concursoState.currentThrowCount = 0;
  concursoState.currentThrows = [];

  showToast('🟰 Empate entre los primeros — ronda de desempate');
  renderConcursoTurn();
  showScreen('screen-concurso-live');
}

function finishTiebreak() {
  const tieResults = Object.entries(concursoState.tiebreakResults)
    .map(([name, r]) => ({ name, total: r.total }))
    .sort((a, b) => b.total - a.total);

  // Merge: tiebreak winner(s) take top spots in original order, ties broken by tiebreak score
  const originalSorted = Object.entries(concursoState.results)
    .map(([name, r]) => ({ name, total: r.total }))
    .sort((a, b) => b.total - a.total);

  const tiebreakRank = {};
  tieResults.forEach((p, i) => { tiebreakRank[p.name] = i; });

  const finalSorted = originalSorted.slice().sort((a, b) => {
    if (b.total !== a.total) return b.total - a.total;
    const aIsTied = tiebreakRank.hasOwnProperty(a.name);
    const bIsTied = tiebreakRank.hasOwnProperty(b.name);
    if (aIsTied && bIsTied) return tiebreakRank[a.name] - tiebreakRank[b.name];
    return 0;
  });

  saveConcursoResult(finalSorted, tieResults);
  renderConcursoResultScreen(finalSorted, tieResults);
}

async function saveConcursoResult(sorted, tiebreakInfo) {
  try {
    await db.ref('concursos/' + concursoState.concursoNum).update({
      finalizado: true,
      ranking: sorted,
      ganador: sorted[0].name,
      tiebreak: tiebreakInfo || null
    });
  } catch (e) { console.error(e); }
  nextConcursoNum = concursoState.concursoNum + 1;
}

function renderConcursoResultScreen(sorted, tiebreakInfo) {
  const tieBanner = document.getElementById('concursoTieBanner');
  if (tiebreakInfo) {
    tieBanner.style.display = 'block';
    tieBanner.innerHTML = `<div class="tie-banner">🟰 Hubo empate en el primer puesto, resuelto con ronda de desempate</div>`;
  } else {
    tieBanner.style.display = 'none';
  }

  const list = document.getElementById('concursoRankingList');
  list.innerHTML = sorted.map((p, idx) => {
    const playerObj = concursoState.players.find(pl => pl.name === p.name);
    const photo = playerObj && playerObj.photo;
    const photoHtml = photo ? `<img class="ranking-photo" src="${photo}">` : `<div class="ranking-photo placeholder">👤</div>`;
    return `
      <div class="ranking-item ${idx === 0 ? 'winner' : ''}">
        <span class="ranking-pos">${idx + 1}</span>
        ${photoHtml}
        <span class="ranking-name">${escapeHtmlApp(p.name)}</span>
        <span class="ranking-total">${p.total}</span>
      </div>
    `;
  }).join('');

  document.getElementById('concursoMvpContainer').innerHTML = `
    <div class="mvp-banner">
      <div class="mvp-label">🏅 Ganador del concurso</div>
      <div class="mvp-name">${escapeHtmlApp(sorted[0].name)}</div>
      <div class="mvp-count">${sorted[0].total} bolos</div>
    </div>
  `;

  showScreen('screen-concurso-result');
}

function confirmAbandonConcurso() {
  if (confirm('¿Seguro que quieres salir? Se perderá el progreso de este concurso.')) {
    goHome();
  }
}

/* ============== CONCURSO STATS ============== */
let allConcursosCache = {};
let allConcursoThrowsCache = {};

async function loadConcursoStatsData() {
  try {
    const snap = await db.ref('concursos').get();
    allConcursosCache = snap.val() || {};
  } catch (e) { allConcursosCache = {}; }

  try {
    const snap = await db.ref('concursos_throws').get();
    const all = snap.val() || {};
    allConcursoThrowsCache = {};
    Object.values(all).forEach(concursoThrows => Object.assign(allConcursoThrowsCache, concursoThrows));
  } catch (e) { allConcursoThrowsCache = {}; }
}

async function renderConcursoStatsTab() {
  await loadConcursoStatsData();
  const container = document.getElementById('statsTabConcurso');

  const concursos = Object.entries(allConcursosCache)
    .map(([id, c]) => ({ id, ...c }))
    .filter(c => c.numero)
    .sort((a, b) => (b.numero || 0) - (a.numero || 0));

  if (concursos.length === 0) {
    container.innerHTML = `<div class="empty-state"><div class="icon">🏅</div><p>Todavía no se ha jugado ningún concurso</p></div>`;
    return;
  }

  container.innerHTML = concursos.map(c => {
    const fecha = c.fecha ? new Date(c.fecha).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' }) : '';
    const ruleLabel = CONCURSO_RULES[c.type] ? CONCURSO_RULES[c.type].label : c.type;
    const winnerHtml = c.finalizado ? `<span class="pc-winner">Gana ${escapeHtmlApp(c.ganador)}</span>` : `<span style="color:var(--chalk-dim)">En curso</span>`;
    return `
      <div class="partida-card" onclick="showConcursoDetail(${c.numero})">
        <div class="pc-top"><span class="pc-num">${ruleLabel} #${c.numero}</span><span class="pc-date">${fecha}</span></div>
        <div class="pc-teams">${(c.players || []).length} jugadores</div>
        <div style="margin-top:6px;">${winnerHtml}</div>
      </div>
    `;
  }).join('');
}

function showConcursoDetail(numero) {
  const c = Object.values(allConcursosCache).find(x => x.numero === numero);
  if (!c) return;
  const modal = document.getElementById('detailModalContent');
  const ruleLabel = CONCURSO_RULES[c.type] ? CONCURSO_RULES[c.type].label : c.type;

  const rankingHtml = (c.ranking || []).map((p, idx) => `
    <div class="juego-detail-row">
      <span>${idx + 1}. ${escapeHtmlApp(p.name)}</span>
      <span style="color:var(--gold); font-weight:700;">${p.total}</span>
    </div>
  `).join('') || '<p style="color:var(--chalk-dim); font-size:0.85rem;">Sin resultados.</p>';

  const deleteBtnHtml = isAdminMode
    ? `<button class="danger-action" onclick="adminDeleteConcurso(${numero})">🗑️ Borrar este concurso</button>`
    : '';

  modal.innerHTML = `
    <h3>${ruleLabel} #${numero}</h3>
    ${rankingHtml}
    ${deleteBtnHtml}
    <button class="modal-close-btn" onclick="closeDetailModal()">Cerrar</button>
  `;
  document.getElementById('detailModal').classList.add('visible');
}

async function adminDeleteConcurso(numero) {
  if (!isAdminMode) { showToast('⚠️ Necesitas modo administrador'); return; }
  if (!confirm(`¿Borrar el concurso ${numero}?`)) return;
  await db.ref('concursos/' + numero).remove();
  await db.ref('concursos_throws/' + numero).remove();
  closeDetailModal();
  showToast('🗑️ Concurso borrado');
  renderConcursoStatsTab();
}
