// ============================================
// supabase-client.js — Supabase Client Setup
// ============================================

const SUPABASE_URL = 'https://ehngxartzdjpdkcekymd.supabase.co';
const SUPABASE_KEY = 'sb_publishable_XbxbjWxjSA1P5dr-bubhpg_rS24BULs';

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ---- USER OPERATIONS ----

async function dbLogin(username) {
  // Try to find existing user by username
  const { data: existing, error: findErr } = await supabaseClient
    .from('users')
    .select('*')
    .eq('username', username)
    .maybeSingle();

  if (findErr) throw findErr;

  if (!existing) {
    throw new Error('ID de acesso não cadastrado! Peça para o administrador criar seu usuário.');
  }

  return existing;
}

async function dbGetAllUsers() {
  const { data, error } = await supabaseClient
    .from('users')
    .select('*')
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data || [];
}

async function dbUpdateChampion(userId, champion) {
  const { error } = await supabaseClient
    .from('users')
    .update({ champion })
    .eq('id', userId);
  if (error) throw error;
}

// ---- GUESS OPERATIONS ----

async function dbGetMyGuesses(userId) {
  const { data, error } = await supabaseClient
    .from('guesses')
    .select('*')
    .eq('user_id', userId);
  if (error) throw error;
  return data || [];
}

async function dbGetAllGuesses() {
  const { data, error } = await supabaseClient
    .from('guesses')
    .select('*, users(nickname, avatar_seed)');
  if (error) throw error;
  return data || [];
}

async function dbSaveGuess(userId, matchId, homeScore, awayScore) {
  const { error } = await supabaseClient
    .from('guesses')
    .upsert(
      { user_id: userId, match_id: matchId, home_score: homeScore, away_score: awayScore },
      { onConflict: 'user_id,match_id' }
    );
  if (error) throw error;
}

async function dbSaveGuesses(userId, guessArray) {
  // guessArray: [{match_id, home_score, away_score}, ...]
  const rows = guessArray.map(g => ({
    user_id: userId,
    match_id: g.match_id,
    home_score: g.home_score,
    away_score: g.away_score
  }));

  const { error } = await supabaseClient
    .from('guesses')
    .upsert(rows, { onConflict: 'user_id,match_id' });

  if (error) throw error;
}

// ---- REALTIME SUBSCRIPTIONS ----

function subscribeToGuesses(callback) {
  return supabaseClient
    .channel('guesses-realtime')
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'guesses'
    }, (payload) => {
      callback(payload);
    })
    .subscribe();
}

function subscribeToUsers(callback) {
  return supabaseClient
    .channel('users-realtime')
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'users'
    }, (payload) => {
      callback(payload);
    })
    .subscribe();
}
