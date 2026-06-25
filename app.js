/* ====================================================================
   BOLOS A 3 TABLONES — motor de la app
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

/* ============== STATE ============== */
let state = {
  partidaNum: null,
  teamA: { name: '', players: [] },
  teamB: { name: '', players: [] },
  juegoNum: 1,
  juegosGanados: { A: 0, B: 0 },
  juegoHistory: [], // [{winner:'A', scoreA, scoreB}]
  rounds: [],       // completed rounds in current juego: [{team:'A', roundIndexForTeam:1, total, throws:[{player,dir,value}]}]
  currentRoundThrows: [], // throws in the round being played right now
  coinCallTeam: null,
  coinCall: null,
  coinResultIsCall: null,
  firstThrowingTeam: null, // team that throws first THIS juego
  turnTeam: null,
  turnPlayerIdx: 0,
  turnDirection: 'arriba', // 'arriba' | 'abajo'
  roundNumberForTeam: { A: 0, B: 0 }, // how many rounds team has completed this juego
};

let countA = 2, countB = 2;
let nextPartidaNum = 1;

/* ============== INIT ============== */
async function initApp() {
  try {
    const snap = await db.ref('partidas').get();
    const partidas = snap.val() || {};
    const nums = Object.values(partidas).map(p => p.numero || 0);
    nextPartidaNum = nums.length ? Math.max(...nums) + 1 : 1;
  } catch (e) {
    nextPartidaNum = 1;
  }
  renderPlayerInputs('A');
  renderPlayerInputs('B');
}
initApp();

/* ============== NAVIGATION ============== */
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  window.scrollTo(0, 0);
}

function goHome() { showScreen('screen-home'); }

function goToSetup() {
  document.getElementById('setupPartidaNum').textContent = nextPartidaNum;
  showScreen('screen-setup');
}

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2000);
}

/* ============== SETUP SCREEN ============== */
function changePlayerCount(team, delta) {
  if (team === 'A') {
    countA = Math.max(1, Math.min(5, countA + delta));
    document.getElementById('countA').textContent = countA;
    renderPlayerInputs('A');
  } else {
    countB = Math.max(1, Math.min(5, countB + delta));
    document.getElementById('countB').textContent = countB;
    renderPlayerInputs('B');
  }
}

function renderPlayerInputs(team) {
  const count = team === 'A' ? countA : countB;
  const container = document.getElementById('players' + team);
  const existing = Array.from(container.querySelectorAll('input')).map(i => i.value);
  container.innerHTML = '';
  for (let i = 0; i < count; i++) {
    const row = document.createElement('div');
    row.className = 'player-input-row';
    row.innerHTML = `
      <span class="player-order-num">${i + 1}</span>
      <input type="text" class="text-input player-name-input" placeholder="${i === count - 1 ? 'Nombre (hombre responsable)' : 'Nombre del jugador'}" value="${existing[i] || ''}">
    `;
    container.appendChild(row);
  }
}

function collectPlayers(team) {
  const container = document.getElementById('players' + team);
  return Array.from(container.querySelectorAll('input')).map(i => i.value.trim()).filter(v => v);
}

function goToCoinToss() {
  const playersA = collectPlayers('A');
  const playersB = collectPlayers('B');

  if (playersA.length !== countA || playersB.length !== countB) {
    showToast('⚠️ Rellena el nombre de todos los jugadores');
    return;
  }

  state.partidaNum = nextPartidaNum;
  state.teamA = { name: 'Equipo de ' + playersA[playersA.length - 1], players: playersA };
  state.teamB = { name: 'Equipo de ' + playersB[playersB.length - 1], players: playersB };
  state.juegoNum = 1;
  state.juegosGanados = { A: 0, B: 0 };
  state.juegoHistory = [];

  resetCoinScreen();
  document.getElementById('coinJuegoNum').textContent = state.juegoNum;
  showScreen('screen-coin');
}

/* ============== COIN TOSS ============== */
function resetCoinScreen() {
  state.coinCallTeam = null;
  state.coinCall = null;
  document.getElementById('coinEl').textContent = '🪙';
  document.getElementById('coinEl').classList.remove('flipping');
  document.getElementById('callCaraBtn').classList.remove('selected');
  document.getElementById('callCruzBtn').classList.remove('selected');
  document.getElementById('coinResultText').innerHTML = `¿Quién llama, <strong>${state.teamA.name}</strong> o <strong>${state.teamB.name}</strong>? Elige cara o cruz para lanzar.`;
  document.getElementById('coinTossBtn').style.display = 'block';
  document.getElementById('coinTossBtn').disabled = true;
  document.getElementById('coinContinueBtn').style.display = 'none';
  renderCoinCallerChoice();
}

function renderCoinCallerChoice() {
  // First pick which team calls, then cara/cruz. Simplify: ask team via toast-free inline buttons reused.
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
  const coinEl = document.getElementById('coinEl');
  coinEl.classList.add('flipping');
  document.getElementById('coinTossBtn').disabled = true;

  setTimeout(() => {
    const result = Math.random() < 0.5 ? 'cara' : 'cruz';
    coinEl.textContent = result === 'cara' ? '👑' : '⚜️';
    coinEl.classList.remove('flipping');

    const callerWon = (result === state.coinCall);
    const callerTeam = state.coinCallTeam;
    const otherTeam = callerTeam === 'A' ? 'B' : 'A';

    // El equipo que acierta el cara/cruz NO tira (planta). El otro tira primero.
    state.firstThrowingTeam = callerWon ? otherTeam : callerTeam;

    const callerName = callerTeam === 'A' ? state.teamA.name : state.teamB.name;
    const throwerName = state.firstThrowingTeam === 'A' ? state.teamA.name : state.teamB.name;
    const plantName = state.firstThrowingTeam === 'A' ? state.teamB.name : state.teamA.name;

    document.getElementById('coinResultText').innerHTML = `
      Ha salido <strong>${result === 'cara' ? 'Cara 👑' : 'Cruz ⚜️'}</strong>.<br><br>
      ${callerWon ? `${callerName} ha acertado` : `${callerName} ha fallado`} → planta los bolos: <strong>${plantName}</strong><br>
      Tira primero: <strong>${throwerName}</strong>
    `;
    document.getElementById('coinTossBtn').style.display = 'none';
    document.getElementById('coinContinueBtn').style.display = 'block';
  }, 1450);
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

function currentTeamObj() {
  return state.turnTeam === 'A' ? state.teamA : state.teamB;
}

function getTeamTotalThisJuego(team) {
  return state.rounds.filter(r => r.team === team).reduce((sum, r) => sum + r.total, 0);
}

function updateScoreboard() {
  document.getElementById('sbScoreA').textContent = getTeamTotalThisJuego('A');
  document.getElementById('sbScoreB').textContent = getTeamTotalThisJuego('B');

  const completedRoundsA = state.roundNumberForTeam.A;
  const completedRoundsB = state.roundNumberForTeam.B;
  const banner = document.getElementById('llevarBanner');

  // Show "llevar" only when both teams have completed the same number of rounds (>=1) and game not over
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
  document.getElementById('turnPlayerName').textContent = player;
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
  const teamLetter = state.turnTeam;
  const title = document.getElementById('roundLogTitle');
  title.textContent = `Tiradas de esta ronda — ${currentTeamObj().name}`;

  const entries = document.getElementById('roundLogEntries');
  entries.innerHTML = '';
  if (state.currentRoundThrows.length === 0) {
    entries.innerHTML = '<div class="log-entry"><span class="name" style="opacity:0.5;">Todavía no hay tiradas en esta ronda</span></div>';
    return;
  }
  state.currentRoundThrows.forEach(t => {
    const row = document.createElement('div');
    row.className = 'log-entry';
    row.innerHTML = `<span class="name">${t.player} (${t.dir === 'arriba' ? '↑' : '↓'})</span><span class="val">${t.value}</span>`;
    entries.appendChild(row);
  });
}

function registerThrow(value) {
  const team = currentTeamObj();
  const player = team.players[state.turnPlayerIdx];

  state.currentRoundThrows.push({ player, dir: state.turnDirection, value, team: state.turnTeam });

  // Save individual throw to Firebase for histogram stats (fire and forget)
  db.ref('partidas/' + state.partidaNum + '_throws').push({
    partidaNum: state.partidaNum,
    juegoNum: state.juegoNum,
    player,
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

  // Last player just threw in this direction
  if (state.turnDirection === 'arriba') {
    state.turnDirection = 'abajo';
    state.turnPlayerIdx = 0;
    renderTurn();
    return;
  }

  // Round complete (both directions done for this team)
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

  // Decide next team to throw
  const otherTeam = teamLetter === 'A' ? 'B' : 'A';
  const completedA = state.roundNumberForTeam.A;
  const completedB = state.roundNumberForTeam.B;

  // Check if juego should end: both teams have completed an equal number of rounds >= 2
  if (completedA === completedB && completedA >= 2) {
    const totalA = getTeamTotalThisJuego('A');
    const totalB = getTeamTotalThisJuego('B');
    if (totalA !== totalB) {
      endJuego(totalA > totalB ? 'A' : 'B', totalA, totalB);
      return;
    }
    // tie -> continue with extra round, same alternating order continues naturally
  }

  // Continue: alternate to the other team for the next round
  state.turnTeam = otherTeam;
  state.turnPlayerIdx = 0;
  state.turnDirection = 'arriba';
  renderTurn();
}

function endJuego(winnerTeam, totalA, totalB) {
  state.juegosGanados[winnerTeam]++;
  state.juegoHistory.push({ winner: winnerTeam, scoreA: totalA, scoreB: totalB, rounds: state.rounds.slice() });

  // Save juego to Firebase under this partida
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
      teamAPlayers: state.teamA.players,
      teamBPlayers: state.teamB.players,
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
  resetCoinScreen();
  document.getElementById('coinJuegoNum').textContent = state.juegoNum;
  showScreen('screen-coin');
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

function goToStatsPartida() {
  goToStats();
}

async function loadStatsData() {
  try {
    const snap = await db.ref('partidas').get();
    allPartidasCache = snap.val() || {};
  } catch (e) { allPartidasCache = {}; }

  try {
    const throwsSnap = await db.ref().get();
    const all = throwsSnap.val() || {};
    allThrowsCache = {};
    Object.keys(all).forEach(key => {
      if (key.endsWith('_throws')) {
        Object.assign(allThrowsCache, all[key]);
      }
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
    .filter(([k]) => !k.includes('_throws'))
    .map(([id, p]) => ({ id, ...p }))
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
      <div class="pc-top">
        <span class="pc-num">Partida ${p.numero}</span>
        <span class="pc-date">${fecha}</span>
      </div>
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

  // Per-player stats for this partida
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

function closeDetailModal() {
  document.getElementById('detailModal').classList.remove('visible');
}

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

  const names = Object.keys(byPlayer).sort();
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
        <div class="ps-name">${escapeHtmlStat(name)}</div>
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

function escapeHtmlStat(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}
