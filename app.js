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

/* ============== PLAYER COLOR PALETTE ============== */
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

async function addPlayerToDatabase(name) {
  const id = db.ref('jugadores').push().key;
  await db.ref('jugadores/' + id).set({ name });
  playerDatabase[id] = { name };
}

/* ============== NAVIGATION ============== */
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  window.scrollTo(0, 0);
}

function goHome() { showScreen('screen-home'); }

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
  // Adjust array length to sharedPlayerCount, preserving existing picks
  const arr = teamSlotsData[team];
  while (arr.length < sharedPlayerCount) arr.push({ name: null });
  while (arr.length > sharedPlayerCount) arr.pop();

  container.innerHTML = '';
  arr.forEach((slot, i) => {
    const row = document.createElement('div');
    row.className = 'player-slot-row';
    const btn = document.createElement('button');
    btn.className = 'player-pick-btn' + (slot.name ? '' : ' empty');
    btn.textContent = slot.name || (i === arr.length - 1 ? 'Elegir jugador (hombre responsable)' : 'Elegir jugador');
    btn.onclick = () => openPickerModal(team, i);
    row.innerHTML = `<span class="player-order-num">${i + 1}</span>`;
    row.appendChild(btn);
    container.appendChild(row);
  });
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
    return `
      <div class="picker-item ${isTaken ? 'disabled' : ''}" onclick="${isTaken ? '' : `selectPlayerForSlot('${escapeJs(name)}')`}">
        <span>${escapeHtmlApp(name)}</span>
        ${isTaken ? '<span class="taken-tag">ya elegido</span>' : ''}
      </div>
    `;
  }).join('') || '<p style="color:var(--chalk-dim); font-size:0.85rem; padding:10px 0;">Sin resultados.</p>';

  modal.innerHTML = `
    <h3>Elegir jugador</h3>
    <input type="text" class="picker-search" id="pickerSearchInput" placeholder="Buscar jugador..." value="${escapeHtmlApp(filterText)}" oninput="renderPickerModal(this.value)">
    <div class="picker-list">${itemsHtml}</div>
    <div class="new-player-row">
      <input type="text" class="text-input" id="newPlayerNameInput" placeholder="Nombre de jugador nuevo">
      <button onclick="createAndSelectPlayer()">Crear</button>
    </div>
    <button class="modal-close-btn" onclick="closePickerModal()">Cancelar</button>
  `;

  // Keep focus on search if re-rendering due to typing
  const searchInput = document.getElementById('pickerSearchInput');
  if (document.activeElement !== searchInput) {
    // no-op, avoid stealing focus unexpectedly on first open
  }
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
  state.teamA = { name: 'Equipo de ' + playersA[playersA.length - 1], players: playersA.map(n => ({ name: n, color: playerColorAssignment[n] })) };
  state.teamB = { name: 'Equipo de ' + playersB[playersB.length - 1], players: playersB.map(n => ({ name: n, color: playerColorAssignment[n] })) };
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

  document.getElementById('sbNameA').textContent = state.teamA.name;
  document.getElementById('sbNameB').textContent = state.teamB.name;
  document.getElementById('gamePartidaNum').textContent = state.partidaNum;
  document.getElementById('gameJuegoNum').textContent = state.juegoNum;

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
    pill.textContent = `J${idx + 1}: ${winnerName.replace('Equipo de ', '')} (${g.scoreA}-${g.scoreB})`;
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

  const dirEl = document.getElementById('turnDirection');
  dirEl.textContent = state.turnDirection === 'arriba' ? 'Para arriba' : 'Para abajo';
  dirEl.className = 'turn-direction ' + state.turnDirection;

  document.getElementById('gameRoundLabel').textContent =
    `${team.name} — ${state.turnDirection === 'arriba' ? 'tirada hacia arriba' : 'tirada hacia abajo'}`;

  renderPinsGrid();
  renderRoundLog();
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

  advanceTurn();
}

function advanceTurn() {
  const team = currentTeamObj();
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

/* ============== END OF JUEGO / PARTIDA ============== */
function endJuego(winnerTeam, totalA, totalB) {
  state.juegosGanados[winnerTeam]++;
  state.juegoHistory.push({ winner: winnerTeam, scoreA: totalA, scoreB: totalB, rounds: state.rounds.slice() });

  saveJuegoToFirebase(winnerTeam, totalA, totalB);

  const winnerName = winnerTeam === 'A' ? state.teamA.name : state.teamB.name;
  document.getElementById('jrPartidaNum').textContent = state.partidaNum;
  document.getElementById('jrWinnerName').textContent = `Gana ${winnerName}`;
  document.getElementById('jrScoreText').textContent = `${totalA} - ${totalB}`;
  renderGameHistoryStrip('jrHistoryStrip');

  const matchDecided = state.juegosGanados.A >= 2 || state.juegosGanados.B >= 2;
  document.getElementById('jrContinueBtn').textContent = matchDecided ? 'Ver resultado de la partida →' : 'Siguiente juego →';

  showScreen('screen-juego-result');
}

async function saveJuegoToFirebase(winnerTeam, totalA, totalB) {
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
      rounds: state.rounds
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

  nextPartidaNum = state.partidaNum + 1;
  // reset team slots/colors for next match
  teamSlotsData = { A: [], B: [] };
  playerColorAssignment = {};
  showScreen('screen-partida-result');
}

function confirmAbandon() {
  if (confirm('¿Seguro que quieres salir? Se perderá el progreso de este juego (lo ya guardado de juegos anteriores se mantiene).')) {
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

  if (tab === 'partidas') renderPartidasList();
  else renderTotalesDelDia();
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

function showPartidaDetail(p) {
  const modal = document.getElementById('detailModalContent');
  const juegos = p.juegos ? Object.values(p.juegos) : [];

  let juegosHtml = juegos.map(j => `
    <div class="juego-detail-row">
      <span>Juego ${j.numero}</span>
      <span style="color:var(--gold); font-weight:700;">${j.totalA} - ${j.totalB}</span>
    </div>
  `).join('') || '<p style="color:var(--chalk-dim); font-size:0.85rem;">Sin juegos registrados todavía.</p>';

  const partidaThrows = Object.values(allThrowsCache).filter(t => t.partidaNum === p.numero);
  const playerStatsHtml = buildPlayerStatsHtml(partidaThrows);

  modal.innerHTML = `
    <h3>Partida ${p.numero} — ${(p.teamAName||'')} vs ${(p.teamBName||'')}</h3>
    ${juegosHtml}
    <div style="margin-top:18px;">
      <div class="round-log-title">Estadísticas de jugadores en esta partida</div>
      ${playerStatsHtml}
    </div>
    <button class="modal-close-btn" onclick="closeDetailModal()">Cerrar</button>
  `;
  document.getElementById('detailModal').classList.add('visible');
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

/* Override continueAfterJuego flow: juego 1 uses coin toss screen, 2+ uses plant screen automatically */
