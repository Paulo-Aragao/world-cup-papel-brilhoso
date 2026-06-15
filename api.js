// ============================================
// api.js — World Cup 2026 API Client
// ============================================

const API_BASE = 'https://worldcup26.ir';
const CACHE_TTL = 60 * 1000; // 60 seconds

// Simple in-memory cache
const _cache = {};

async function apiFetch(endpoint) {
  const now = Date.now();
  if (_cache[endpoint] && now - _cache[endpoint].ts < CACHE_TTL) {
    return _cache[endpoint].data;
  }
  const res = await fetch(`${API_BASE}${endpoint}`);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  const data = await res.json();
  _cache[endpoint] = { data, ts: now };
  return data;
}

function invalidateCache() {
  Object.keys(_cache).forEach(k => delete _cache[k]);
}

// ---- ENDPOINTS ----

async function apiGetGames() {
  const data = await apiFetch('/get/games');
  return (data.games || []).sort((a, b) => parseInt(a.id) - parseInt(b.id));
}

async function apiGetGroups() {
  const data = await apiFetch('/get/groups');
  return data.groups || data || [];
}

async function apiGetTeams() {
  const data = await apiFetch('/get/teams');
  return data.teams || data || [];
}

// ---- HELPERS ----

// Parse "MM/DD/YYYY HH:mm" → Date object (local time)
function parseMatchDate(dateStr) {
  if (!dateStr) return null;
  // Format: "06/11/2026 13:00"
  const [datePart, timePart] = dateStr.split(' ');
  const [month, day, year] = datePart.split('/');
  const [hour, min] = (timePart || '00:00').split(':');
  return new Date(parseInt(year), parseInt(month) - 1, parseInt(day),
                  parseInt(hour), parseInt(min));
}

// Is match live right now?
function isMatchLive(game) {
  return game.finished !== 'TRUE' &&
         game.finished !== true &&
         game.time_elapsed !== 'notstarted' &&
         game.time_elapsed !== 'finished';
}

// Is match finished?
function isMatchFinished(game) {
  return game.finished === 'TRUE' || game.finished === true ||
         game.time_elapsed === 'finished';
}

// Is match today (local)?
function isMatchToday(game) {
  const d = parseMatchDate(game.local_date);
  if (!d) return false;
  const today = new Date();
  return d.getFullYear() === today.getFullYear() &&
         d.getMonth() === today.getMonth() &&
         d.getDate() === today.getDate();
}

// Has match started? (kickoff passed)
function hasMatchStarted(game) {
  if (isMatchFinished(game) || isMatchLive(game)) return true;
  const d = parseMatchDate(game.local_date);
  if (!d) return false;
  return Date.now() >= d.getTime();
}

// Get next upcoming match
function getNextMatch(games) {
  const now = Date.now();
  const upcoming = games
    .filter(g => !isMatchFinished(g) && !isMatchLive(g))
    .filter(g => {
      const d = parseMatchDate(g.local_date);
      return d && d.getTime() > now;
    })
    .sort((a, b) => {
      const da = parseMatchDate(a.local_date);
      const db = parseMatchDate(b.local_date);
      return da - db;
    });
  return upcoming[0] || null;
}

// Group games by date string
function groupGamesByDate(games) {
  const grouped = {};
  games.forEach(g => {
    const d = parseMatchDate(g.local_date);
    if (!d) return;
    const key = d.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(g);
  });
  return grouped;
}

// EN→PT team name mapping (API returns EN, users know PT names)
const TEAM_NAME_PT = {
  'Mexico': 'México',
  'South Africa': 'África do Sul',
  'South Korea': 'Coreia do Sul',
  'Czech Republic': 'República Tcheca',
  'Canada': 'Canadá',
  'Bosnia and Herzegovina': 'Bósnia',
  'United States': 'Estados Unidos',
  'Paraguay': 'Paraguai',
  'Qatar': 'Catar',
  'Switzerland': 'Suíça',
  'Brazil': 'Brasil',
  'Morocco': 'Marrocos',
  'Haiti': 'Haiti',
  'Scotland': 'Escócia',
  'Australia': 'Austrália',
  'Turkey': 'Turquia',
  'Germany': 'Alemanha',
  'Curaçao': 'Curaçao',
  'Ivory Coast': 'Costa do Marfim',
  'Ecuador': 'Equador',
  'Netherlands': 'Holanda',
  'Japan': 'Japão',
  'Sweden': 'Suécia',
  'Tunisia': 'Tunísia',
  'Spain': 'Espanha',
  'Cape Verde': 'Cabo Verde',
  'Saudi Arabia': 'Arábia Saudita',
  'Uruguay': 'Uruguai',
  'Belgium': 'Bélgica',
  'Egypt': 'Egito',
  'Iran': 'Irã',
  'New Zealand': 'Nova Zelândia',
  'France': 'França',
  'Senegal': 'Senegal',
  'Iraq': 'Iraque',
  'Norway': 'Noruega',
  'Austria': 'Áustria',
  'Jordan': 'Jordânia',
  'Argentina': 'Argentina',
  'Algeria': 'Argélia',
  'Portugal': 'Portugal',
  'Democratic Republic of the Congo': 'RD Congo',
  'Uzbekistan': 'Uzbequistão',
  'England': 'Inglaterra',
  'Croatia': 'Croácia',
  'Colombia': 'Colômbia',
  'Ghana': 'Gana',
  'Panama': 'Panamá',
  'Bolivia': 'Bolívia',
  'Albania': 'Albânia',
  'Denmark': 'Dinamarca',
  'Slovakia': 'Eslováquia',
};

// Get team name in PT
function teamNamePt(nameEn) {
  return TEAM_NAME_PT[nameEn] || nameEn;
}

// Country flag emoji by team name (EN)
const TEAM_FLAGS = {
  'Mexico': '🇲🇽', 'South Africa': '🇿🇦', 'South Korea': '🇰🇷',
  'Czech Republic': '🇨🇿', 'Canada': '🇨🇦', 'Bosnia and Herzegovina': '🇧🇦',
  'United States': '🇺🇸', 'Paraguay': '🇵🇾', 'Qatar': '🇶🇦',
  'Switzerland': '🇨🇭', 'Brazil': '🇧🇷', 'Morocco': '🇲🇦',
  'Haiti': '🇭🇹', 'Scotland': '🏴󠁧󠁢󠁳󠁣󠁴󠁿', 'Australia': '🇦🇺',
  'Turkey': '🇹🇷', 'Germany': '🇩🇪', 'Curaçao': '🇨🇼',
  'Ivory Coast': '🇨🇮', 'Ecuador': '🇪🇨', 'Netherlands': '🇳🇱',
  'Japan': '🇯🇵', 'Sweden': '🇸🇪', 'Tunisia': '🇹🇳',
  'Spain': '🇪🇸', 'Cape Verde': '🇨🇻', 'Saudi Arabia': '🇸🇦',
  'Uruguay': '🇺🇾', 'Belgium': '🇧🇪', 'Egypt': '🇪🇬',
  'Iran': '🇮🇷', 'New Zealand': '🇳🇿', 'France': '🇫🇷',
  'Senegal': '🇸🇳', 'Iraq': '🇮🇶', 'Norway': '🇳🇴',
  'Austria': '🇦🇹', 'Jordan': '🇯🇴', 'Argentina': '🇦🇷',
  'Algeria': '🇩🇿', 'Portugal': '🇵🇹', 'Democratic Republic of the Congo': '🇨🇩',
  'Uzbekistan': '🇺🇿', 'England': '🏴󠁧󠁢󠁥󠁮󠁧󠁿', 'Croatia': '🇭🇷',
  'Colombia': '🇨🇴', 'Ghana': '🇬🇭', 'Panama': '🇵🇦',
  'Bolivia': '🇧🇴', 'Albania': '🇦🇱', 'Denmark': '🇩🇰',
  'Slovakia': '🇸🇰',
};

// Flagpedia / Flagcdn ISO codes
const TEAM_CODES = {
  'Mexico': 'mx', 'South Africa': 'za', 'South Korea': 'kr',
  'Czech Republic': 'cz', 'Canada': 'ca', 'Bosnia and Herzegovina': 'ba',
  'United States': 'us', 'Paraguay': 'py', 'Qatar': 'qa',
  'Switzerland': 'ch', 'Brazil': 'br', 'Morocco': 'ma',
  'Haiti': 'ht', 'Scotland': 'gb-sct', 'Australia': 'au',
  'Turkey': 'tr', 'Germany': 'de', 'Curaçao': 'cw',
  'Ivory Coast': 'ci', 'Ecuador': 'ec', 'Netherlands': 'nl',
  'Japan': 'jp', 'Sweden': 'se', 'Tunisia': 'tn',
  'Spain': 'es', 'Cape Verde': 'cv', 'Saudi Arabia': 'sa',
  'Uruguay': 'uy', 'Belgium': 'be', 'Egypt': 'eg',
  'Iran': 'ir', 'New Zealand': 'nz', 'France': 'fr',
  'Senegal': 'sn', 'Iraq': 'iq', 'Norway': 'no',
  'Austria': 'at', 'Jordan': 'jo', 'Argentina': 'ar',
  'Algeria': 'dz', 'Portugal': 'pt', 'Democratic Republic of the Congo': 'cd',
  'Uzbekistan': 'uz', 'England': 'gb-eng', 'Croatia': 'hr',
  'Colombia': 'co', 'Ghana': 'gh', 'Panama': 'pa',
  'Bolivia': 'bo', 'Albania': 'al', 'Denmark': 'dk',
  'Slovakia': 'sk'
};

function teamFlag(nameEn) {
  const code = TEAM_CODES[nameEn];
  if (!code) return '🏳️';
  return `<img src="https://flagcdn.com/w40/${code}.png" class="flag-pixel" alt="${nameEn}" />`;
}

function teamFlagEmoji(nameEn) {
  return TEAM_FLAGS[nameEn] || '🏳️';
}

// Phase label in PT
function phaseLabelPt(type) {
  const map = {
    group: 'Fase de Grupos',
    r32: '2ª Fase',
    r16: 'Oitavas de Final',
    qf: 'Quartas de Final',
    sf: 'Semifinal',
    third: 'Disputa de 3º Lugar',
    final: 'Final',
  };
  return map[type] || type;
}

// Format date for display
function formatMatchDate(dateStr) {
  const d = parseMatchDate(dateStr);
  if (!d) return '--';
  return d.toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit',
    hour: '2-digit', minute: '2-digit'
  });
}

// Format time only
function formatMatchTime(dateStr) {
  const d = parseMatchDate(dateStr);
  if (!d) return '--:--';
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

// Countdown to match
function countdownToMatch(dateStr) {
  const d = parseMatchDate(dateStr);
  if (!d) return '';
  const diff = d.getTime() - Date.now();
  if (diff <= 0) return 'Agora!';
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  if (h > 24) {
    const days = Math.floor(h / 24);
    return `em ${days}d`;
  }
  return `em ${h}h${m.toString().padStart(2,'0')}m`;
}
