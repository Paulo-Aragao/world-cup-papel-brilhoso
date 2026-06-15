// ============================================
// app.js — Main Application Logic
// ============================================

// ---- STATE ----
const state = {
  currentUser: null,    // {id, nickname, avatar_seed, champion}
  games: [],            // from API
  groups: [],           // from API
  teams: [],            // from API
  myGuesses: {},        // matchId -> {home_score, away_score}
  allGuesses: [],       // from Supabase
  allUsers: [],         // from Supabase
  ranking: [],          // computed
  currentPage: 'ranking',
  currentPhase: 'group',
  currentFilter: 'all',
  realtimeChannel: null,
};

// ---- INIT ----
document.addEventListener('DOMContentLoaded', async () => {
  initPixelBg();
  bindLoginEvents();
  bindNavEvents();
  checkSession();
});

function checkSession() {
  const saved = localStorage.getItem('bolaoCopa2026_username') || localStorage.getItem('bolaoCopa2026_nick');
  if (saved) {
    loginWithUsername(saved);
  }
}

// ---- PIXEL BACKGROUND PARTICLES ----
function initPixelBg() {
  const bg = document.getElementById('pixel-bg');
  if (!bg) return;
  // Add subtle animated stars
  for (let i = 0; i < 30; i++) {
    const star = document.createElement('div');
    star.style.cssText = `
      position: absolute;
      width: ${Math.random() > 0.5 ? 2 : 4}px;
      height: ${Math.random() > 0.5 ? 2 : 4}px;
      background: rgba(255,255,255,${0.1 + Math.random() * 0.3});
      top: ${Math.random() * 100}%;
      left: ${Math.random() * 100}%;
      animation: blink-star ${2 + Math.random() * 4}s step-end infinite;
      animation-delay: ${Math.random() * 3}s;
    `;
    bg.appendChild(star);
  }

  const style = document.createElement('style');
  style.textContent = `
    @keyframes blink-star {
      0%, 100% { opacity: 1; }
      50% { opacity: 0; }
    }
  `;
  document.head.appendChild(style);
}

// ---- LOGIN ----
function bindLoginEvents() {
  const btn = document.getElementById('btn-login');
  const input = document.getElementById('input-nick');

  btn.addEventListener('click', () => attemptLogin());
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') attemptLogin();
  });
}

async function attemptLogin() {
  const input = document.getElementById('input-nick');
  const errorEl = document.getElementById('nick-error');
  const username = input.value.trim();

  errorEl.classList.add('hidden');

  if (!username || username.length < 2) {
    showNickError('Digite seu ID de acesso!');
    return;
  }
  if (username.length > 20) {
    showNickError('ID muito longo! Máximo 20 caracteres.');
    return;
  }
  if (!/^[a-zA-Z0-9_\-À-ÿ]+$/.test(username)) {
    showNickError('Use apenas letras, números, _ ou -');
    return;
  }

  showLoading(true);
  try {
    await loginWithUsername(username);
  } catch (err) {
    showLoading(false);
    showNickError(err.message);
  }
}

function showNickError(msg) {
  const el = document.getElementById('nick-error');
  el.textContent = msg;
  el.classList.remove('hidden');
}

async function loginWithUsername(username) {
  showLoading(true);
  try {
    const user = await dbLogin(username);
    state.currentUser = user;
    localStorage.setItem('bolaoCopa2026_username', username);
    await bootApp();
  } catch (err) {
    showLoading(false);
    showNickError('Erro: ' + err.message);
    throw err;
  }
}

async function bootApp() {
  // Show app, hide login
  document.getElementById('screen-login').classList.remove('active');
  document.getElementById('screen-login').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');

  // Set nav user info
  document.getElementById('nav-nick-display').textContent = state.currentUser.nickname;
  document.getElementById('nav-avatar').textContent = state.currentUser.avatar_seed || '⚽';

  // Load initial data
  await Promise.all([
    loadGames(),
    loadGuesses(),
    loadUsers(),
    loadTeams(),
  ]);

  // Subscribe realtime
  setupRealtime();

  // Compute ranking and set navbar coins display
  recomputeRanking();
  updateNavScore();

  // Navigate to page from hash or default (default is ranking)
  const hash = location.hash.replace('#', '') || 'ranking';
  navigateTo(hash);

  showLoading(false);
}

// ---- DATA LOADING ----
async function loadGames() {
  try {
    state.games = await apiGetGames();
  } catch (err) {
    console.error('Failed to load games:', err);
    showToast('⚠️ Erro ao carregar jogos da API', 'error');
  }
}

async function loadGuesses() {
  if (!state.currentUser) return;
  try {
    const guesses = await dbGetMyGuesses(state.currentUser.id);
    state.myGuesses = {};
    guesses.forEach(g => { state.myGuesses[g.match_id] = g; });
  } catch (err) {
    console.error('Failed to load guesses:', err);
  }
}

async function loadAllGuesses() {
  try {
    state.allGuesses = await dbGetAllGuesses();
  } catch (err) {
    console.error('Failed to load all guesses:', err);
  }
}

async function loadUsers() {
  try {
    state.allUsers = await dbGetAllUsers();
  } catch (err) {
    console.error('Failed to load users:', err);
  }
}

async function loadGroups() {
  try {
    state.groups = await apiGetGroups();
  } catch (err) {
    console.error('Failed to load groups:', err);
  }
}

async function loadTeams() {
  try {
    state.teams = await apiGetTeams();
  } catch (err) {
    console.error('Failed to load teams:', err);
  }
}

function getTeamById(id) {
  return state.teams.find(t => String(t.id) === String(id));
}

function updateNavScore() {
  const myRankEntry = state.ranking.find(r => r.id === state.currentUser?.id);
  const score = myRankEntry?.total ?? 0;
  const el = document.getElementById('nav-score-display');
  if (el) el.textContent = `${score} 🪙`;
}

function recomputeRanking() {
  state.ranking = calcRanking(state.allUsers, state.allGuesses, state.games);
}

// ---- REALTIME ----
function setupRealtime() {
  subscribeToGuesses(async (payload) => {
    // Reload all guesses and recompute ranking
    await loadAllGuesses();
    recomputeRanking();
    updateNavScore();

    // If ranking page is open, re-render
    if (state.currentPage === 'ranking') renderRanking();

    // Toast if another user made a guess
    if (payload.new && payload.new.user_id !== state.currentUser?.id) {
      const user = state.allUsers.find(u => u.id === payload.new.user_id);
      const game = state.games.find(g => parseInt(g.id) === payload.new.match_id);
      if (user && game) {
        const name = game.home_team_name_en
          ? `${teamNamePt(game.home_team_name_en)} x ${teamNamePt(game.away_team_name_en)}`
          : `Jogo #${payload.new.match_id}`;
        showToast(`🔔 ${user.nickname} palpitou em ${name}`, 'info');
      }
    }
  });

  subscribeToUsers(async () => {
    await loadUsers();
    recomputeRanking();
    updateNavScore();
    if (state.currentPage === 'ranking') renderRanking();
  });
}

// ---- MANUAL REFRESH ----
async function manualRefreshAll() {
  invalidateCache();
  await Promise.all([
    loadGames(),
    loadGuesses(),
    loadAllGuesses(),
    loadUsers(),
    loadTeams(),
  ]);
  recomputeRanking();
  updateNavScore();

  // Refresh current view
  if (state.currentPage === 'ranking') renderRanking();
  if (state.currentPage === 'palpites') renderPalpites();
  if (state.currentPage === 'jogos') renderJogos();
  if (state.currentPage === 'grupos') renderGrupos();
}

function bindManualRefreshBtn() {
  const btn = document.getElementById('btn-manual-refresh');
  if (!btn) return;
  btn.onclick = async () => {
    btn.disabled = true;
    btn.textContent = '⏳ Atualizando...';
    try {
      await manualRefreshAll();
      showToast('🔄 Dados atualizados!', 'success');
    } catch (err) {
      showToast('❌ Erro ao atualizar', 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = '🔄 ATUALIZAR DADOS';
    }
  };
}

// ---- NAVIGATION ----
function bindNavEvents() {
  // Desktop nav links
  document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const page = link.dataset.page;
      navigateTo(page);
    });
  });

  // Mobile menu
  const hamburger = document.getElementById('nav-hamburger');
  const mobileMenu = document.getElementById('mobile-menu');
  const mobileClose = document.getElementById('mobile-close');

  hamburger?.addEventListener('click', () => {
    mobileMenu.classList.remove('hidden');
  });

  mobileClose?.addEventListener('click', () => {
    mobileMenu.classList.add('hidden');
  });

  document.querySelectorAll('.mobile-nav-link').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const page = link.dataset.page;
      mobileMenu.classList.add('hidden');
      navigateTo(page);
    });
  });

  // Logout
  document.getElementById('btn-logout')?.addEventListener('click', logout);

  // Hash change
  window.addEventListener('hashchange', () => {
    const hash = location.hash.replace('#', '');
    if (hash && hash !== state.currentPage) navigateTo(hash);
  });
}

async function navigateTo(page) {
  const validPages = ['palpites', 'jogos', 'ranking', 'grupos'];
  if (!validPages.includes(page)) page = 'ranking';

  state.currentPage = page;
  location.hash = page;

  // Hide all pages
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));

  // Show target page
  const target = document.getElementById(`page-${page}`);
  if (target) target.classList.add('active');

  // Update nav active state
  document.querySelectorAll('.nav-link').forEach(l => {
    l.classList.toggle('active', l.dataset.page === page);
  });

  // Render page content
  await renderPage(page);
}

async function renderPage(page) {
  switch (page) {
    case 'ranking':
      await loadAllGuesses();
      recomputeRanking();
      updateNavScore();
      renderRanking();
      break;
    case 'palpites':
      renderPalpites();
      break;
    case 'jogos':
      renderJogos();
      bindManualRefreshBtn();
      break;
    case 'grupos':
      await loadGroups();
      renderGrupos();
      break;
  }
}

function logout() {
  localStorage.removeItem('bolaoCopa2026_username');
  localStorage.removeItem('bolaoCopa2026_nick');
  location.reload();
}

// ============================================================
// RENDER: CHAMPION CARD
// ============================================
function renderChampionCard() {
  const user = state.currentUser;
  const selectEl = document.getElementById('champion-select');
  const savedEl = document.getElementById('champion-saved');
  const displayEl = document.getElementById('champion-display');

  if (!selectEl || !savedEl || !displayEl) return;

  // Populate select with all teams
  if (selectEl.options.length <= 1) {
    const teams = Object.keys(TEAM_NAME_PT).sort((a, b) =>
      TEAM_NAME_PT[a].localeCompare(TEAM_NAME_PT[b])
    );
    teams.forEach(en => {
      const opt = document.createElement('option');
      opt.value = en;
      opt.textContent = `${teamFlagEmoji(en)} ${TEAM_NAME_PT[en]}`;
      selectEl.appendChild(opt);
    });
  }

  if (user?.champion) {
    displayEl.classList.add('hidden');
    savedEl.classList.remove('hidden');
    document.getElementById('champion-flag').innerHTML = teamFlag(user.champion);
    document.getElementById('champion-name').textContent = TEAM_NAME_PT[user.champion] || user.champion;
  } else {
    displayEl.classList.remove('hidden');
    savedEl.classList.add('hidden');
  }

  // Save champion
  const saveBtn = document.getElementById('btn-save-champion');
  if (saveBtn) {
    saveBtn.onclick = async () => {
      const champion = selectEl.value;
      if (!champion) return;
      try {
        await dbUpdateChampion(user.id, champion);
        state.currentUser.champion = champion;
        // Update local users array too
        const u = state.allUsers.find(u => u.id === user.id);
        if (u) u.champion = champion;
        renderChampionCard();
        showToast(`🏆 Campeão salvo: ${TEAM_NAME_PT[champion]}!`, 'success');
      } catch (err) {
        showToast('Erro ao salvar campeão', 'error');
      }
    };
  }

  // Click on saved champion allows change
  savedEl.onclick = () => {
    state.currentUser.champion = '';
    renderChampionCard();
  };
}

// ============================================
// RENDER: MATCH CARD (reusable)
// ============================================
function renderMatchCard(game) {
  const homeFlag = teamFlag(game.home_team_name_en) || '';
  const awayFlag = teamFlag(game.away_team_name_en) || '';
  const homePt = game.home_team_name_en ? teamNamePt(game.home_team_name_en) : (game.home_team_label || '?');
  const awayPt = game.away_team_name_en ? teamNamePt(game.away_team_name_en) : (game.away_team_label || '?');

  const live     = isMatchLive(game);
  const finished = isMatchFinished(game);
  const homeScore = (game.home_score != null && game.home_score !== '') ? game.home_score : '-';
  const awayScore = (game.away_score != null && game.away_score !== '') ? game.away_score : '-';

  const statusBadge = live
    ? '<span class="match-status-badge badge-live">⚡ AO VIVO</span>'
    : finished
      ? '<span class="match-status-badge badge-done">ENCERRADO</span>'
      : `<span class="match-status-badge badge-soon">${formatMatchTime(game.local_date)}</span>`;

  const cardClass = `match-card ${live ? 'live' : ''} ${finished ? 'finished' : ''}`;

  return `
    <div class="${cardClass}">
      <div class="team-info">
        <span class="team-flag">${homeFlag}</span>
        <span class="team-name">${escapeHtml(homePt)}</span>
      </div>
      <div class="match-score-center">
        ${statusBadge}
        <span class="score-display ${live ? 'live-score' : ''}">${homeScore} : ${awayScore}</span>
        <span class="match-group-tag">${game.group || ''}</span>
      </div>
      <div class="team-info away">
        <span class="team-flag">${awayFlag}</span>
        <span class="team-name">${escapeHtml(awayPt)}</span>
      </div>
    </div>
  `;
}

// ============================================
// RENDER: PALPITES
// ============================================
function renderPalpites() {
  renderChampionCard();
  bindPhaseTabEvents();
  renderGuessesForPhase(state.currentPhase);
  bindSaveAllBtn();
}

function bindPhaseTabEvents() {
  document.querySelectorAll('.phase-tab').forEach(tab => {
    tab.onclick = () => {
      document.querySelectorAll('.phase-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      state.currentPhase = tab.dataset.phase;
      renderGuessesForPhase(state.currentPhase);
    };
  });
}

function renderGuessesForPhase(phase) {
  const container = document.getElementById('guesses-container');
  let games = state.games.filter(g => g.type === phase);

  // Special: 'final' also shows third place
  if (phase === 'final') {
    games = state.games.filter(g => g.type === 'final' || g.type === 'third');
  }

  if (games.length === 0) {
    container.innerHTML = `<div class="loading-pixel">Sem jogos nessa fase ainda 🔒</div>`;
    return;
  }

  const open   = games.filter(g => !hasMatchStarted(g) && g.home_team_name_en && g.away_team_name_en).length;
  const locked = games.filter(g => hasMatchStarted(g) || !g.home_team_name_en || !g.away_team_name_en).length;

  const summary = `
    <div class="phase-summary">
      <span class="phase-open">✏️ ${open} abertos para palpite</span>
      <span class="phase-locked">🔒 ${locked} fechados / pendentes</span>
    </div>`;

  container.innerHTML = summary + games.map(game => renderGuessRow(game)).join('');

  // Bind input events
  container.querySelectorAll('.guess-score-input').forEach(input => {
    input.addEventListener('change', () => {
      document.getElementById('save-status').textContent = '● Alterações não salvas';
    });
    input.addEventListener('input', () => {
      input.value = input.value.replace(/[^0-9]/g, '').slice(0, 2);
    });
  });
}

function renderGuessRow(game) {
  const matchId  = parseInt(game.id);
  const guess    = state.myGuesses[matchId];
  const locked   = hasMatchStarted(game);
  const finished = isMatchFinished(game);
  const isDefined = !!(game.home_team_name_en && game.away_team_name_en);

  const homeFlag = isDefined ? (teamFlag(game.home_team_name_en) || '') : '🏳️';
  const awayFlag = isDefined ? (teamFlag(game.away_team_name_en) || '') : '🏳️';
  const homePt   = game.home_team_name_en ? teamNamePt(game.home_team_name_en) : (game.home_team_label || 'Time A');
  const awayPt   = game.away_team_name_en ? teamNamePt(game.away_team_name_en) : (game.away_team_label || 'Time B');

  const guessHome = guess?.home_score ?? '';
  const guessAway = guess?.away_score ?? '';

  let resultBadge = '';
  let pointsInfo  = '';
  let rowExtra    = '';
  let rowClass    = 'guess-row';

  if (finished) {
    const realH = game.home_score;
    const realA = game.away_score;

    if (guess?.home_score != null && guess?.away_score != null) {
      const { result, points } = calcGuessResult(guess, game);
      rowClass += ` ${resultClass(result)}`;
      resultBadge = `<span class="guess-result-badge">${resultEmoji(result)}</span>`;
      pointsInfo  = `<span class="guess-pts-badge pts-${outcomeClass(result)}">+${points} 🪙</span>`;
    } else {
      rowClass += ' result-wrong';
      resultBadge = `<span class="guess-result-badge">😶</span>`;
      pointsInfo  = `<span class="guess-pts-badge pts-wrong">+0 🪙</span>`;
    }

    rowExtra = `
      <div class="real-score-row">
        <span class="real-score-label">PLACAR REAL:</span>
        <span class="real-score-value">${realH} × ${realA}</span>
        ${pointsInfo}
      </div>`;
  }

  if (locked) rowClass += ' locked';
  if (!isDefined) rowClass += ' locked undefined-match';

  const showInputs = !locked && isDefined;

  const inputsOrGuess = showInputs
    ? `
      <input type="number" class="guess-score-input"
             min="0" max="99" value="${guessHome}"
             data-match="${matchId}" data-side="home"
             placeholder="?" />
      <span class="guess-vs">×</span>
      <input type="number" class="guess-score-input"
             min="0" max="99" value="${guessAway}"
             data-match="${matchId}" data-side="away"
             placeholder="?" />`
    : !isDefined
      ? `
      <div class="guess-locked-score" title="Aguardando definição dos confrontos">
        <span class="guess-locked-num">—</span>
        <span class="guess-vs">×</span>
        <span class="guess-locked-num">—</span>
      </div>`
      : `
      <div class="guess-locked-score">
        <span class="guess-locked-num">${guessHome !== '' ? guessHome : '?'}</span>
        <span class="guess-vs">×</span>
        <span class="guess-locked-num">${guessAway !== '' ? guessAway : '?'}</span>
      </div>`;

  if (!isDefined) {
    rowExtra = `
      <div class="real-score-row" style="border-top:none; padding-top:0;">
        <span class="real-score-label" style="color:var(--accent-blue)">🔒 CONFRONTOS INDEFINIDOS</span>
      </div>`;
  }

  const matchInfo = `${game.type === 'group' ? 'Grupo ' + game.group + ' · ' : phaseLabelPt(game.type) + ' · '}${formatMatchDate(game.local_date)}`;

  return `
    <div class="${rowClass}" data-match-id="${matchId}">
      <div class="guess-row-inner">
        <span class="guess-match-info">${matchInfo}</span>
        <div class="guess-teams-row">
          <div class="team-info">
            <span class="team-flag">${homeFlag}</span>
            <span class="guess-team-name">${escapeHtml(homePt)}</span>
          </div>
          <div class="guess-inputs-center">
            ${inputsOrGuess}
          </div>
          <div class="team-info away">
            <span class="guess-team-name right">${escapeHtml(awayPt)}</span>
            <span class="team-flag">${awayFlag}</span>
          </div>
        </div>
        ${rowExtra}
      </div>
      ${resultBadge}
    </div>
  `;
}

function bindSaveAllBtn() {
  const btn = document.getElementById('btn-save-all');
  if (!btn) return;
  btn.onclick = async () => {
    btn.disabled = true;
    btn.textContent = '⏳ Salvando...';

    try {
      const container = document.getElementById('guesses-container');
      const rows = container.querySelectorAll('.guess-row[data-match-id]');
      const toSave = [];

      rows.forEach(row => {
        const matchId = parseInt(row.dataset.matchId);
        const homeInput = row.querySelector('[data-side="home"]');
        const awayInput = row.querySelector('[data-side="away"]');

        if (!homeInput || !awayInput) return;

        const homeVal = homeInput.value;
        const awayVal = awayInput.value;

        if (homeVal !== '' && awayVal !== '') {
          toSave.push({
            match_id: matchId,
            home_score: parseInt(homeVal),
            away_score: parseInt(awayVal),
          });
          state.myGuesses[matchId] = { match_id: matchId, home_score: parseInt(homeVal), away_score: parseInt(awayVal) };
        }
      });

      if (toSave.length === 0) {
        showToast('Nenhum palpite novo para salvar', 'info');
        return;
      }

      await dbSaveGuesses(state.currentUser.id, toSave);
      showToast(`✅ ${toSave.length} palpites salvos!`, 'success');
      document.getElementById('save-status').textContent = `✅ Salvo às ${new Date().toLocaleTimeString('pt-BR')}`;

      renderGuessesForPhase(state.currentPhase);
    } catch (err) {
      showToast('❌ Erro ao salvar: ' + err.message, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = '💾 SALVAR TODOS OS PALPITES';
    }
  };
}

// ============================================
// RENDER: JOGOS
// ============================================
function renderJogos() {
  bindFilterEvents();
  applyFilter(state.currentFilter);
}

function bindFilterEvents() {
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.currentFilter = btn.dataset.filter;
      applyFilter(state.currentFilter);
    };
  });
}

function applyFilter(filter) {
  let filtered = [...state.games];

  if (filter === 'live')     filtered = state.games.filter(isMatchLive);
  if (filter === 'today')    filtered = state.games.filter(isMatchToday);
  if (filter === 'finished') filtered = state.games.filter(isMatchFinished);

  renderJogosContainer(filtered);
}

function renderJogosContainer(games) {
  const container = document.getElementById('jogos-container');

  if (games.length === 0) {
    container.innerHTML = `<div class="loading-pixel">Nenhum jogo encontrado</div>`;
    return;
  }

  const grouped = groupGamesByDate(games);
  let html = '';

  Object.entries(grouped).forEach(([dateLabel, dayGames]) => {
    html += `<div class="date-group-header">📅 ${dateLabel.toUpperCase()}</div>`;
    html += dayGames.map(g => renderMatchCard(g)).join('');
  });

  container.innerHTML = html;
}

// ============================================
// RENDER: RANKING
// ============================================
function renderRanking() {
  const container = document.getElementById('ranking-container');

  if (state.ranking.length === 0) {
    container.innerHTML = `<div class="loading-pixel">Sem participantes ainda... seja o primeiro! 🎯</div>`;
    return;
  }

  container.innerHTML = state.ranking.map((u, i) => {
    const isMe = u.id === state.currentUser?.id;
    const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}`;
    const posClass = i < 3 ? `pos-${i + 1}` : '';

    return `
      <div class="ranking-row ${posClass} ${isMe ? 'me' : ''}">
        <span class="rank-pos ${i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : ''}">${medal}</span>
        <span class="rank-avatar" style="font-size:1.4rem">${u.avatar_seed || '⚽'}</span>
        <div class="rank-detail">
          <div class="rank-detail-nick">${escapeHtml(u.nickname)}${isMe ? ' <span style="color:var(--accent-gold)">← você</span>' : ''}</div>
          <div class="rank-detail-stats">
            <span class="stat-exact">✅ ${u.exact} exatos</span>
            <span class="stat-correct">🟡 ${u.correct} parciais</span>
            <span class="stat-wrong">❌ ${u.wrong} errados</span>
            <span style="color:var(--text-muted)">⏳ ${u.pending} pendentes</span>
          </div>
          ${u.champion ? `<div style="font-size:0.65rem;color:var(--text-dim);margin-top:0.3rem">🏆 ${teamFlag(u.champion)} ${TEAM_NAME_PT[u.champion] || u.champion}</div>` : ''}
        </div>
        <div style="text-align:right">
          <span class="rank-score-big">${u.total}</span>
          <div class="rank-pts-label">moedas 🪙</div>
        </div>
      </div>
    `;
  }).join('');
}

// ============================================
// RENDER: GRUPOS
// ============================================
async function renderGrupos() {
  const container = document.getElementById('grupos-grid');

  if (!state.groups || state.groups.length === 0) {
    container.innerHTML = `<div class="loading-pixel">Carregando grupos...</div>`;
    await loadGroups();
  }

  const groups = state.groups;

  if (!groups || groups.length === 0) {
    container.innerHTML = `<div class="loading-pixel">Dados de grupos indisponíveis</div>`;
    return;
  }

  container.innerHTML = groups.map(group => renderGroupCard(group)).join('');
}

function renderGroupCard(group) {
  const groupName = group.group || group.name || '?';
  const teams = group.teams || [];

  const teamsHtml = teams.map((team, idx) => {
    const apiTeam = getTeamById(team.team_id);
    const nameEn = apiTeam ? apiTeam.name_en : '';
    const namePt = teamNamePt(nameEn);
    const flag = teamFlag(nameEn);
    const pts = team.points ?? team.pts ?? 0;
    const pg = team.played ?? team.pld ?? 0;
    const w = team.wins ?? team.w ?? 0;
    const d = team.draws ?? team.d ?? 0;
    const l = team.losses ?? team.l ?? 0;
    const gf = team.goals_for ?? team.gf ?? 0;
    const ga = team.goals_against ?? team.ga ?? 0;
    const gd = (gf - ga >= 0 ? '+' : '') + (gf - ga);
    const isQualified = idx < 2;

    return `
      <tr class="${isQualified ? 'qualifier' : ''}">
        <td>${flag} ${escapeHtml(namePt)}</td>
        <td>${pg}</td>
        <td>${w}</td>
        <td>${d}</td>
        <td>${l}</td>
        <td>${gf}</td>
        <td>${ga}</td>
        <td>${gd}</td>
        <td class="pts-cell">${pts}</td>
      </tr>
    `;
  }).join('');

  return `
    <div class="group-card">
      <div class="group-card-header">
        ⚽ GRUPO ${groupName}
        <span style="font-size:0.45rem;opacity:0.7">Top 2 + melhores 3ºs</span>
      </div>
      <table class="group-table">
        <thead>
          <tr>
            <th>SELEÇÃO</th>
            <th>J</th><th>V</th><th>E</th><th>D</th>
            <th>GP</th><th>GC</th><th>SG</th><th>PTS</th>
          </tr>
        </thead>
        <tbody>
          ${teamsHtml || '<tr><td colspan="9" style="text-align:center;color:var(--text-dim);padding:1rem">Aguardando...</td></tr>'}
        </tbody>
      </table>
    </div>
  `;
}

// ============================================
// TOAST NOTIFICATIONS
// ============================================
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('removing');
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// ============================================
// LOADING
// ============================================
function showLoading(show) {
  const overlay = document.getElementById('loading-overlay');
  if (!overlay) return;
  if (show) overlay.classList.remove('hidden');
  else overlay.classList.add('hidden');
}

// ============================================
// UTILITIES
// ============================================
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
