// ============================================
// scoring.js — Pontuação do Bolão
// ============================================

const POINTS = {
  EXACT:        5, // Placar exato
  LOSER_GOALS:  3, // Gols do perdedor (apenas se acertar o vencedor)
  WINNER_GOALS: 3, // Gols do vencedor (apenas se acertar o vencedor)
  DIFF_GOALS:   2, // Saldo de gols (apenas se acertar o vencedor)
  DRAW:         2, // Empate (acertou que seria empate mas errou o placar)
  WINNER:       1, // Apenas acertou o vencedor (com saldo/gols diferentes)
  CHAMPION:    15, // Bônus campeão acertado
  RUNNER:       0, // Bônus vice-campeão (futuro)
};

// Calcula resultado de um palpite vs placar real
// Retorna: { points, result: 'exact' | 'loser_goals' | 'winner_goals' | 'diff_goals' | 'draw' | 'winner' | 'wrong' | 'pending' }
function calcGuessResult(guess, game) {
  if (!guess) return { points: 0, result: 'pending' };
  if (guess.home_score == null || guess.away_score == null) return { points: 0, result: 'pending' };
  if (!isMatchFinished(game)) return { points: 0, result: 'pending' };

  const realHome = parseInt(game.home_score);
  const realAway = parseInt(game.away_score);
  const guessHome = parseInt(guess.home_score);
  const guessAway = parseInt(guess.away_score);

  if (isNaN(realHome) || isNaN(realAway) || isNaN(guessHome) || isNaN(guessAway)) {
    return { points: 0, result: 'pending' };
  }

  // 1. Placar exato (5 pts)
  if (guessHome === realHome && guessAway === realAway) {
    return { points: POINTS.EXACT, result: 'exact' };
  }

  const realOutcome = Math.sign(realHome - realAway);   // 1 (Home win), -1 (Away win), 0 (Draw)
  const guessOutcome = Math.sign(guessHome - guessAway); // 1, -1, 0

  // Se errou o vencedor / empate principal, ganha 0 pontos
  if (realOutcome !== guessOutcome) {
    return { points: 0, result: 'wrong' };
  }

  // A partir daqui, o desfecho principal está correto

  // 2. Empate (2 pts) — já sabemos que não é placar exato, mas acertou que empatou
  if (realOutcome === 0) {
    return { points: POINTS.DRAW, result: 'draw' };
  }

  // Há vencedor e perdedor
  const isHomeWinner = realHome > realAway;
  const realWinnerScore = isHomeWinner ? realHome : realAway;
  const realLoserScore = isHomeWinner ? realAway : realHome;

  const guessWinnerScore = isHomeWinner ? guessHome : guessAway;
  const guessLoserScore = isHomeWinner ? guessAway : guessHome;

  // 3. Acertou gols do perdedor (3 pts)
  if (guessLoserScore === realLoserScore) {
    return { points: POINTS.LOSER_GOALS, result: 'loser_goals' };
  }

  // 4. Acertou gols do vencedor (3 pts)
  if (guessWinnerScore === realWinnerScore) {
    return { points: POINTS.WINNER_GOALS, result: 'winner_goals' };
  }

  // 5. Acertou saldo de gols (2 pts)
  const realDiff = realWinnerScore - realLoserScore;
  const guessDiff = guessWinnerScore - guessLoserScore;
  if (realDiff === guessDiff) {
    return { points: POINTS.DIFF_GOALS, result: 'diff_goals' };
  }

  // 6. Acertou vencedor apenas (1 pt)
  return { points: POINTS.WINNER, result: 'winner' };
}

// Calcula pontuação total de um usuário
// guesses: array de {match_id, home_score, away_score}
// games: array completo da API
// champion: string com nome do campeão chutado
// realChampion: string com nome do campeão real (quando disponível)
function calcUserScore(guesses, games, champion = '', realChampion = '') {
  let total = 0;
  let exact = 0;
  let correct = 0;
  let wrong = 0;
  let pending = 0;
  const details = {};

  const guessMap = {};
  (guesses || []).forEach(g => { guessMap[g.match_id] = g; });

  (games || []).forEach(game => {
    const matchId = parseInt(game.id);
    const guess = guessMap[matchId];
    const { points, result } = calcGuessResult(guess, game);

    details[matchId] = { points, result, guess, game };
    total += points;

    if (result === 'exact') exact++;
    else if (result === 'wrong') wrong++;
    else if (result === 'pending') pending++;
    else correct++; // Gols do perdedor, vencedor, saldo, empate ou apenas vencedor
  });

  // Bônus campeão
  let championBonus = 0;
  if (realChampion && champion &&
      champion.toLowerCase() === realChampion.toLowerCase()) {
    championBonus = POINTS.CHAMPION;
    total += championBonus;
  }

  return { total, exact, correct, wrong, pending, details, championBonus };
}

// Calcula ranking completo
// users: [{id, nickname, avatar_seed, champion}]
// allGuesses: [{user_id, match_id, home_score, away_score}]
// games: array da API
// realChampion: string (quando a copa terminar)
function calcRanking(users, allGuesses, games, realChampion = '') {
  // Group guesses by user
  const guessByUser = {};
  (allGuesses || []).forEach(g => {
    if (!guessByUser[g.user_id]) guessByUser[g.user_id] = [];
    guessByUser[g.user_id].push(g);
  });

  const ranked = (users || []).map(user => {
    const userGuesses = guessByUser[user.id] || [];
    const score = calcUserScore(userGuesses, games, user.champion, realChampion);
    return {
      ...user,
      ...score,
      guessCount: userGuesses.length,
    };
  });

  // Sort: by total DESC, then exact DESC, then correct DESC
  ranked.sort((a, b) => {
    if (b.total !== a.total) return b.total - a.total;
    if (b.exact !== a.exact) return b.exact - a.exact;
    return b.correct - a.correct;
  });

  // Assign positions
  ranked.forEach((user, idx) => {
    user.position = idx + 1;
  });

  return ranked;
}

// Map detailed result to simplified output classes for styling
function outcomeClass(result) {
  if (result === 'exact') return 'exact';
  if (result === 'wrong') return 'wrong';
  if (result === 'pending') return 'pending';
  return 'correct';
}

// Emoji de resultado
function resultEmoji(result) {
  if (result === 'exact')   return '✅';
  if (result === 'wrong')   return '❌';
  if (result === 'pending') return '⏳';
  return '🟡';
}

// CSS class de resultado
function resultClass(result) {
  const oc = outcomeClass(result);
  if (oc === 'exact')   return 'result-exact';
  if (oc === 'correct') return 'result-correct';
  if (oc === 'wrong')   return 'result-wrong';
  return '';
}
