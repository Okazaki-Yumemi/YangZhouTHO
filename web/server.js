const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');
const { TEAM_IDS, TEAM_FULL_HINT, ERROR_CODES } = require('../shared/constants');
const {
  applyPositiveBonus,
  calculateCurrentStamina,
  canJoinTeam,
  clampMinZero,
  createSeededRandom,
  getTitleByScore,
  pickActions,
  resolveActionOutcome,
  resolveRandomEvent,
  weightedPick
} = require('../shared/logic');

const ROOT = path.resolve(__dirname, '..');
const PUBLIC_DIR = path.join(__dirname, 'public');
const DATA_DIR = path.join(ROOT, 'data');
const STATE_FILE = path.join(DATA_DIR, 'state.json');
const MIME_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg'
};

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function nowSec() {
  return Math.floor(Date.now() / 1000);
}

function ensureDataDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function buildInitialState() {
  return {
    config: readJson(path.join(ROOT, 'shared', 'seeds', 'activity-config.json')),
    teams: readJson(path.join(ROOT, 'shared', 'seeds', 'teams.json')),
    actions: readJson(path.join(ROOT, 'shared', 'seeds', 'actions-config.json')),
    randomEvents: readJson(path.join(ROOT, 'shared', 'seeds', 'random-events-config.json')),
    titles: readJson(path.join(ROOT, 'shared', 'seeds', 'titles-config.json')),
    ticketCodes: readJson(path.join(ROOT, 'shared', 'seeds', 'ticket-codes.json')),
    users: [],
    actionLogs: [],
    requestLocks: [],
    sessions: {}
  };
}

function loadState() {
  ensureDataDir();
  if (!fs.existsSync(STATE_FILE)) {
    const initialState = buildInitialState();
    fs.writeFileSync(STATE_FILE, JSON.stringify(initialState, null, 2), 'utf8');
    return initialState;
  }
  return readJson(STATE_FILE);
}

function saveState(state) {
  ensureDataDir();
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
}

function mapTeamsById(state) {
  return state.teams.reduce((acc, team) => {
    acc[team._id] = team;
    return acc;
  }, {});
}

function getUserByOpenid(state, openid) {
  return state.users.find((user) => user.openid === openid) || null;
}

function createSessionToken() {
  return crypto.randomBytes(16).toString('hex');
}

function readSession(req, state) {
  const cookie = req.headers.cookie || '';
  const token = cookie
    .split(';')
    .map((item) => item.trim())
    .find((item) => item.startsWith('tho_session='));
  if (!token) {
    return null;
  }
  const sessionId = token.split('=')[1];
  return state.sessions[sessionId] ? { sessionId, ...state.sessions[sessionId] } : null;
}

function ensureSession(req, res, state) {
  const existing = readSession(req, state);
  if (existing) {
    return existing;
  }

  const sessionId = createSessionToken();
  const session = {
    openid: `web_${createSessionToken()}`,
    created_at: nowSec()
  };
  state.sessions[sessionId] = session;
  saveState(state);
  res.setHeader('Set-Cookie', `tho_session=${sessionId}; Path=/; HttpOnly; SameSite=Lax`);
  return { sessionId, ...session };
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

function collectBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
    });
    req.on('end', () => {
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch (error) {
        reject(error);
      }
    });
    req.on('error', reject);
  });
}

function normalizeUser(user, state) {
  const staminaState = calculateCurrentStamina(user, nowSec(), state.config);
  user.stamina = staminaState.stamina;
  user.last_stamina_at = staminaState.lastStaminaAt;
  user.title = getTitleByScore(user.score, state.titles);
  const currentNow = nowSec();
  const interval =
    currentNow < user.regen_buff_until
      ? state.config.buff_regen_interval_sec
      : state.config.default_regen_interval_sec;
  const nextRegenInSec =
    user.stamina >= state.config.stamina_cap
      ? 0
      : Math.max(0, interval - (currentNow - user.last_stamina_at));
  return {
    _id: user._id,
    display_name: user.display_name,
    ticket_code: user.ticket_code,
    team: user.team,
    score: user.score,
    title: user.title,
    stamina: user.stamina,
    regen_buff_until: user.regen_buff_until,
    next_regen_in_sec: nextRegenInSec,
    regen_interval_sec: interval,
    next_action_bonus: user.next_action_bonus,
    banned: user.banned
  };
}

function selectActionsForUser(state, user, openid) {
  const seedBase = `${openid}:${user.action_refresh_nonce || 0}:${nowSec()}`;
  const random = createSeededRandom(seedBase);
  let pool = state.actions.filter((item) => item.enabled);

  if (user.last_action_id) {
    const filtered = pool.filter((item) => item._id !== user.last_action_id);
    if (filtered.length >= 3) {
      pool = filtered;
    }
  }

  const picks = [];
  const usedIds = new Set();
  while (picks.length < Math.min(3, pool.length)) {
    const candidate = weightedPick(pool.filter((item) => !usedIds.has(item._id)), random);
    if (!candidate) {
      break;
    }
    picks.push(candidate);
    usedIds.add(candidate._id);
  }

  return picks;
}

function buildHomeState(state, openid) {
  const user = getUserByOpenid(state, openid);
  return {
    registered: Boolean(user),
    user: user ? normalizeUser(user, state) : null,
    teams: mapTeamsById(state),
    config: state.config,
    available_actions: user ? selectActionsForUser(state, user, openid) : [],
    recent_logs: state.actionLogs.slice(-10).reverse()
  };
}

function registerUser(state, openid, payload) {
  if (!payload.code || !payload.team) {
    return { error: 'BAD_REQUEST', message: '请填写门票码并选择队伍。' };
  }
  if (!state.config.registration_open) {
    return { error: ERROR_CODES.REGISTRATION_CLOSED, message: '当前暂未开放注册。' };
  }
  if (getUserByOpenid(state, openid)) {
    return { error: ERROR_CODES.ALREADY_REGISTERED, message: '当前浏览器已经注册过。' };
  }

  const ticket = state.ticketCodes.find((item) => item.code === payload.code);
  if (!ticket || ticket.status === 'disabled') {
    return { error: ERROR_CODES.INVALID_CODE, message: '门票码不存在。' };
  }
  if (ticket.status !== 'unused') {
    return { error: ERROR_CODES.CODE_ALREADY_USED, message: '这个门票码已经被使用。' };
  }

  const teamsMap = mapTeamsById(state);
  const joinCheck = canJoinTeam(teamsMap, payload.team, state.config.team_join_max_diff);
  if (!joinCheck.allowed) {
    return {
      error: ERROR_CODES.TEAM_JOIN_RESTRICTED,
      message: TEAM_FULL_HINT
    };
  }

  const currentNow = nowSec();
  const user = {
    _id: `user_${createSessionToken()}`,
    openid,
    ticket_code: payload.code,
    display_name: payload.display_name || `游客${String(state.users.length + 1).padStart(4, '0')}`,
    team: payload.team,
    score: 0,
    title: getTitleByScore(0, state.titles),
    stamina: state.config.stamina_cap,
    last_stamina_at: currentNow,
    regen_buff_until: 0,
    action_refresh_nonce: 0,
    last_action_id: '',
    next_action_bonus: 0,
    banned: false,
    created_at: currentNow,
    updated_at: currentNow
  };

  state.users.push(user);
  ticket.status = 'bound';
  ticket.bound_openid = openid;
  ticket.bound_user_id = user._id;
  ticket.bound_at = currentNow;
  teamsMap[payload.team].member_count += 1;
  teamsMap[payload.team].updated_at = currentNow;
  saveState(state);

  return {
    success: true,
    state: buildHomeState(state, openid)
  };
}

function performAction(state, openid, payload) {
  if (!state.config.action_open) {
    return { error: ERROR_CODES.ACTION_CLOSED, message: '当前暂未开放行动。' };
  }

  const user = getUserByOpenid(state, openid);
  if (!user) {
    return { error: ERROR_CODES.USER_NOT_FOUND, message: '请先注册。' };
  }
  if (user.banned) {
    return { error: ERROR_CODES.USER_BANNED, message: '当前账号已被封禁。' };
  }

  const requestKey = `${openid}:${payload.client_request_id}`;
  if (state.requestLocks.includes(requestKey)) {
    return { error: ERROR_CODES.DUPLICATE_REQUEST, message: '请不要重复点击。' };
  }

  const currentNow = nowSec();
  const staminaState = calculateCurrentStamina(user, currentNow, state.config);
  user.stamina = staminaState.stamina;
  user.last_stamina_at = staminaState.lastStaminaAt;

  const action = state.actions.find((item) => item._id === payload.action_id && item.enabled);
  if (!action) {
    return { error: ERROR_CODES.ACTION_NOT_FOUND, message: '行动不存在。' };
  }
  if (user.stamina < action.stamina_cost) {
    return { error: ERROR_CODES.STAMINA_NOT_ENOUGH, message: '体力不足。' };
  }
  state.requestLocks.push(requestKey);

  const teamsMap = mapTeamsById(state);
  const ownTeam = teamsMap[user.team];
  const opponentTeam = teamsMap[user.team === TEAM_IDS.CIRNO ? TEAM_IDS.DAIYOUSEI : TEAM_IDS.CIRNO];
  const random = createSeededRandom(`${openid}:${payload.client_request_id}:${currentNow}`);
  const staminaBefore = user.stamina;

  user.stamina -= action.stamina_cost;

  const actionOutcome = resolveActionOutcome(action, random, {
    nowSec: currentNow,
    user,
    ownTeam,
    opponentTeam
  });

  actionOutcome.scoreDelta = applyPositiveBonus(actionOutcome.scoreDelta, user.next_action_bonus || 0);
  actionOutcome.teamDeltaSelf = applyPositiveBonus(
    actionOutcome.teamDeltaSelf,
    user.next_action_bonus || 0
  );
  user.next_action_bonus = 0;

  user.score = clampMinZero(user.score + actionOutcome.scoreDelta);
  ownTeam.total_score = clampMinZero(ownTeam.total_score + actionOutcome.teamDeltaSelf);
  opponentTeam.total_score = clampMinZero(opponentTeam.total_score + actionOutcome.teamDeltaOpponent);
  user.stamina = Math.min(state.config.stamina_cap, user.stamina + actionOutcome.staminaDelta);
  user.regen_buff_until = actionOutcome.regenBuffUntil;

  let randomEvent = { triggered: false };
  if (random() < state.config.random_event_chance) {
    const event = weightedPick(state.randomEvents.filter((item) => item.enabled), random);
    if (event) {
      const eventResult = resolveRandomEvent(event, { config: state.config, user });
      user.score = clampMinZero(user.score + eventResult.scoreDelta);
      ownTeam.total_score = clampMinZero(ownTeam.total_score + eventResult.teamDelta);
      user.stamina = eventResult.staminaAfter;
      user.regen_buff_until = eventResult.regenBuffUntil;
      user.next_action_bonus = eventResult.nextActionBonus;
      randomEvent = eventResult;
    }
  }

  user.title = getTitleByScore(user.score, state.titles);
  user.action_refresh_nonce = (user.action_refresh_nonce || 0) + 1;
  user.last_action_id = action._id;
  user.updated_at = currentNow;
  ownTeam.updated_at = currentNow;
  opponentTeam.updated_at = currentNow;

  state.actionLogs.push({
    _id: `log_${createSessionToken()}`,
    user_id: user._id,
    openid,
    team: user.team,
    action_id: action._id,
    action_name: action.name,
    score_delta: actionOutcome.scoreDelta,
    team_delta_self: actionOutcome.teamDeltaSelf,
    team_delta_opponent: actionOutcome.teamDeltaOpponent,
    stamina_before: staminaBefore,
    stamina_after: user.stamina,
    random_event_triggered: randomEvent.triggered,
    random_event_id: randomEvent.eventId || '',
    random_event_result: randomEvent.triggered ? randomEvent : null,
    created_at: currentNow
  });

  saveState(state);
  return {
    success: true,
    action_result: {
      action_name: action.name,
      text: actionOutcome.text,
      score_delta: actionOutcome.scoreDelta,
      team_delta_self: actionOutcome.teamDeltaSelf,
      team_delta_opponent: actionOutcome.teamDeltaOpponent,
      stamina_before: staminaBefore,
      stamina_after: user.stamina
    },
    random_event: randomEvent,
    state: buildHomeState(state, openid)
  };
}

function resetState() {
  const initialState = buildInitialState();
  saveState(initialState);
  return initialState;
}

function serveStatic(req, res, pathname) {
  const routePath = pathname === '/' ? '/index.html' : pathname;
  const decodedPath = decodeURIComponent(routePath);
  const relativePath = decodedPath.replace(/^\/+/, '');
  const filePath = decodedPath.startsWith('/pictures/')
    ? path.join(ROOT, relativePath)
    : path.join(PUBLIC_DIR, relativePath);

  if (!filePath.startsWith(PUBLIC_DIR) && !filePath.startsWith(path.join(ROOT, 'pictures'))) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    res.writeHead(404);
    res.end('Not Found');
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
  fs.createReadStream(filePath).pipe(res);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  const state = loadState();
  const session = ensureSession(req, res, state);

  if (req.method === 'GET' && url.pathname === '/api/init') {
    sendJson(res, 200, buildHomeState(state, session.openid));
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/register') {
    try {
      const body = await collectBody(req);
      const result = registerUser(state, session.openid, body);
      sendJson(res, result.error ? 400 : 200, result);
    } catch {
      sendJson(res, 400, { error: 'BAD_REQUEST', message: '请求格式错误。' });
    }
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/action') {
    try {
      const body = await collectBody(req);
      const result = performAction(state, session.openid, body);
      sendJson(res, result.error ? 400 : 200, result);
    } catch {
      sendJson(res, 400, { error: 'BAD_REQUEST', message: '请求格式错误。' });
    }
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/reset') {
    const nextState = resetState();
    sendJson(res, 200, { success: true, state: buildHomeState(nextState, session.openid) });
    return;
  }

  serveStatic(req, res, url.pathname);
});

server.listen(3000, () => {
  console.log('Yangzhou THO web is running at http://127.0.0.1:3000');
});
