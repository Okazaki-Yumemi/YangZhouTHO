const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');
const { TEAM_IDS, TEAM_FULL_HINT, ERROR_CODES } = require('../shared/constants');
const { findUserByDisplayName, hashPassword, verifyPassword } = require('../shared/auth');
const {
  applyPositiveBonus,
  calculateCurrentStamina,
  canJoinTeam,
  clampMinZero,
  createSeededRandom,
  getTitleByScore,
  resolveActionOutcome,
  resolveRandomEvent,
  weightedPick
} = require('../shared/logic');

const ROOT = path.resolve(__dirname, '..');
const PUBLIC_DIR = path.join(__dirname, 'public');
const DATA_DIR = path.join(ROOT, 'data');
const STATE_FILE = path.join(DATA_DIR, 'state.json');
const ADMIN_CONFIG_FILE = path.join(DATA_DIR, 'admin.local.json');
const DEFAULT_ADMIN_CONFIG = {
  password: 'THOADMIN',
  entryPath: '/staff-only-admin.html'
};
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

function loadAdminConfig() {
  ensureDataDir();
  if (!fs.existsSync(ADMIN_CONFIG_FILE)) {
    fs.writeFileSync(ADMIN_CONFIG_FILE, JSON.stringify(DEFAULT_ADMIN_CONFIG, null, 2), 'utf8');
    return { ...DEFAULT_ADMIN_CONFIG };
  }

  const config = readJson(ADMIN_CONFIG_FILE);
  const password = String(config.password || DEFAULT_ADMIN_CONFIG.password).trim() || DEFAULT_ADMIN_CONFIG.password;
  let entryPath = String(config.entryPath || DEFAULT_ADMIN_CONFIG.entryPath).trim() || DEFAULT_ADMIN_CONFIG.entryPath;
  if (!entryPath.startsWith('/')) {
    entryPath = `/${entryPath}`;
  }
  return { password, entryPath };
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
    grantLogs: [],
    requestLocks: [],
    sessions: {},
    admin: {
      sessions: {},
      oneTimeActivities: [
        { id: 'stage_game_a', name: '舞台小游戏 A', score: 1 },
        { id: 'stage_game_b', name: '舞台小游戏 B', score: 1 },
        { id: 'stage_game_c', name: '舞台小游戏 C', score: 1 }
      ],
      boothCampaigns: [
        { id: 'booth_food', name: '小吃摊位', remaining_slots: 3, score: 2 },
        { id: 'booth_drink', name: '饮品摊位', remaining_slots: 3, score: 2 },
        { id: 'booth_goods', name: '周边摊位', remaining_slots: 3, score: 2 }
      ],
      logs: []
    }
  };
}

function loadState() {
  ensureDataDir();
  if (!fs.existsSync(STATE_FILE)) {
    const initialState = buildInitialState();
    fs.writeFileSync(STATE_FILE, JSON.stringify(initialState, null, 2), 'utf8');
    return initialState;
  }

  const saved = readJson(STATE_FILE);
  if (!saved.admin) {
    saved.admin = buildInitialState().admin;
  }
  if (!saved.admin.sessions) {
    saved.admin.sessions = {};
  }
  if (!saved.admin.oneTimeActivities) {
    saved.admin.oneTimeActivities = buildInitialState().admin.oneTimeActivities;
  }
  if (!saved.admin.boothCampaigns) {
    saved.admin.boothCampaigns = buildInitialState().admin.boothCampaigns;
  }
  if (!saved.admin.logs) {
    saved.admin.logs = [];
  }
  if (!saved.grantLogs) {
    saved.grantLogs = [];
  }
  return saved;
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

function getCookie(req, name) {
  const cookie = req.headers.cookie || '';
  const token = cookie
    .split(';')
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${name}=`));
  return token ? token.split('=')[1] : '';
}

function createToken() {
  return crypto.randomBytes(16).toString('hex');
}

function getUserByOpenid(state, openid) {
  return state.users.find((user) => user.openid === openid) || null;
}

function getUserByCredentials(state, displayName, password) {
  const user = findUserByDisplayName(state.users, displayName);
  if (!user) {
    return null;
  }
  return verifyPassword(password, user.password_salt, user.password_hash) ? user : null;
}

function getSession(req, state) {
  const sessionId = getCookie(req, 'tho_session');
  return sessionId && state.sessions[sessionId] ? { sessionId, ...state.sessions[sessionId] } : null;
}

function ensureSession(req, res, state) {
  const existing = getSession(req, state);
  if (existing) {
    return existing;
  }

  const sessionId = createToken();
  const session = {
    openid: `web_${createToken()}`,
    created_at: nowSec()
  };
  state.sessions[sessionId] = session;
  saveState(state);
  res.setHeader('Set-Cookie', `tho_session=${sessionId}; Path=/; HttpOnly; SameSite=Lax`);
  return { sessionId, ...session };
}

function getAdminSession(req, state) {
  const sessionId = getCookie(req, 'tho_admin');
  return sessionId && state.admin.sessions[sessionId]
    ? { sessionId, ...state.admin.sessions[sessionId] }
    : null;
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
  const currentNow = nowSec();
  const staminaState = calculateCurrentStamina(user, currentNow, state.config);
  user.stamina = staminaState.stamina;
  user.last_stamina_at = staminaState.lastStaminaAt;
  user.title = getTitleByScore(user.score, state.titles);

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
    action_refresh_nonce: user.action_refresh_nonce || 0,
    next_action_bonus: user.next_action_bonus,
    banned: user.banned,
    one_time_claims: user.one_time_claims || [],
    booth_claims: user.booth_claims || []
  };
}

function selectActionsForUser(state, user, openid) {
  const poolSource = state.actions.filter((item) => item.enabled);
  let pool = poolSource;
  if (user.last_action_id) {
    const filtered = poolSource.filter((item) => item._id !== user.last_action_id);
    if (filtered.length >= 3) {
      pool = filtered;
    }
  }

  const random = createSeededRandom(`${openid}:${user.action_refresh_nonce || 0}:${nowSec()}`);
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

function buildRecentFeed(state) {
  return [...state.actionLogs, ...state.grantLogs]
    .sort((a, b) => b.created_at - a.created_at)
    .slice(0, 10);
}

function buildHomeState(state, openid) {
  const user = getUserByOpenid(state, openid);
  return {
    registered: Boolean(user),
    user: user ? normalizeUser(user, state) : null,
    teams: mapTeamsById(state),
    config: state.config,
    available_actions: user ? selectActionsForUser(state, user, openid) : [],
    recent_logs: buildRecentFeed(state)
  };
}

function registerUser(state, openid, payload) {
  const code = String(payload.code || '').trim();
  const displayName = String(payload.display_name || '').trim();
  const password = String(payload.password || '').trim();
  if (!code || !payload.team || !displayName || !password) {
    return { error: 'BAD_REQUEST', message: '请填写门票码并选择队伍。' };
  }
  if (!state.config.registration_open) {
    return { error: ERROR_CODES.REGISTRATION_CLOSED, message: '当前暂未开放注册。' };
  }
  if (getUserByOpenid(state, openid)) {
    return { error: ERROR_CODES.ALREADY_REGISTERED, message: '当前浏览器已经注册过了。' };
  }

  if (findUserByDisplayName(state.users, displayName)) {
    return { error: ERROR_CODES.DUPLICATE_DISPLAY_NAME, message: '这个昵称已经被使用，请换一个昵称。' };
  }

  const ticket = state.ticketCodes.find((item) => item.code === code);
  if (!ticket || ticket.status === 'disabled') {
    return { error: ERROR_CODES.INVALID_CODE, message: '门票码不存在。' };
  }
  if (ticket.status !== 'unused') {
    return { error: ERROR_CODES.CODE_ALREADY_USED, message: '这个门票码已经被使用。' };
  }

  const teamsMap = mapTeamsById(state);
  const joinCheck = canJoinTeam(teamsMap, payload.team, state.config.team_join_max_diff);
  if (!joinCheck.allowed) {
    return { error: ERROR_CODES.TEAM_JOIN_RESTRICTED, message: TEAM_FULL_HINT };
  }

  const currentNow = nowSec();
  const passwordRecord = hashPassword(password);
  const user = {
    _id: `user_${createToken()}`,
    openid,
    ticket_code: code,
    display_name: payload.display_name || `游客${String(state.users.length + 1).padStart(4, '0')}`,
    display_name: displayName,
    password_salt: passwordRecord.salt,
    password_hash: passwordRecord.hash,
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
    one_time_claims: [],
    booth_claims: [],
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

  return { success: true, state: buildHomeState(state, openid) };
}

function loginUser(state, sessionId, payload) {
  const displayName = String(payload.display_name || '').trim();
  const password = String(payload.password || '').trim();
  if (!displayName || !password) {
    return { error: 'BAD_REQUEST', message: '请填写昵称和密码。' };
  }

  const user = getUserByCredentials(state, displayName, password);
  if (!user) {
    return { error: ERROR_CODES.INVALID_CREDENTIALS, message: '昵称或密码错误。' };
  }

  state.sessions[sessionId].openid = user.openid;
  state.sessions[sessionId].logged_in_at = nowSec();
  saveState(state);
  return { success: true, state: buildHomeState(state, user.openid) };
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
    _id: `log_${createToken()}`,
    kind: 'action',
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

function getPlayerSummary(state, user) {
  const normalized = normalizeUser(user, state);
  return {
    ...normalized,
    team_name: user.team === TEAM_IDS.CIRNO ? '琪露诺探索小队' : '大妖精探索小队'
  };
}

function findUserForAdmin(state, payload) {
  if (payload.target_user_id) {
    return state.users.find((user) => user._id === payload.target_user_id) || null;
  }

  const query = String(payload.query || '').trim().toLowerCase();
  if (!query) {
    return null;
  }

  return (
    state.users.find(
      (user) =>
        user._id.toLowerCase() === query ||
        user.ticket_code.toLowerCase() === query ||
        user.display_name.toLowerCase() === query
    ) || null
  );
}

function logAdminAction(state, action, detail) {
  const entry = {
    _id: `admin_${createToken()}`,
    action,
    detail,
    created_at: nowSec()
  };
  state.admin.logs.push(entry);
  return entry;
}

function addGrantLog(state, user, summary) {
  state.grantLogs.push({
    _id: `grant_${createToken()}`,
    kind: 'grant',
    user_id: user._id,
    team: user.team,
    action_name: summary.label,
    score_delta: summary.score_delta,
    created_at: nowSec(),
    random_event_triggered: false,
    random_event_result: null
  });
}

function parseOptionalNumber(value) {
  if (value === '' || value === null || typeof value === 'undefined') {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function adminGrant(state, payload) {
  const user = findUserForAdmin(state, payload);
  if (!user) {
    return { error: 'USER_NOT_FOUND', message: '没有找到这个玩家。' };
  }

  const teamsMap = mapTeamsById(state);
  const team = teamsMap[user.team];
  const currentNow = nowSec();
  const grantType = payload.grant_type;
  let scoreDelta = 0;
  let label = '';
  const detail = {};

  if (grantType === 'custom_score') {
    scoreDelta = Number(payload.score_delta || 0);
    label = payload.reason || '手动加分';
  } else if (grantType === 'restore_stamina') {
    const staminaState = calculateCurrentStamina(user, currentNow, state.config);
    user.stamina = staminaState.stamina;
    user.last_stamina_at = staminaState.lastStaminaAt;
    user.stamina = state.config.stamina_cap;
    user.last_stamina_at = currentNow;
    label = payload.reason || '管理员恢复体力';
  } else if (grantType === 'stage_manual') {
    scoreDelta = Number(payload.score_delta || 0);
    label = payload.reason || '舞台互动加分';
    detail.sticker_code = payload.sticker_code || '';
  } else if (grantType === 'one_time_activity') {
    const activity = state.admin.oneTimeActivities.find((item) => item.id === payload.activity_id);
    if (!activity) {
      return { error: 'BAD_REQUEST', message: '一次性活动不存在。' };
    }
    if ((user.one_time_claims || []).includes(activity.id)) {
      return { error: 'ALREADY_CLAIMED', message: '这个玩家已经领过该小游戏奖励。' };
    }
    user.one_time_claims = user.one_time_claims || [];
    user.one_time_claims.push(activity.id);
    scoreDelta = parseOptionalNumber(payload.score_delta) ?? activity.score ?? 0;
    label = `一次性活动：${activity.name}`;
    detail.sticker_code = payload.sticker_code || '';
  } else if (grantType === 'booth_reward') {
    const booth = state.admin.boothCampaigns.find((item) => item.id === payload.booth_id);
    if (!booth) {
      return { error: 'BAD_REQUEST', message: '摊位不存在。' };
    }
    if (booth.remaining_slots <= 0) {
      return { error: 'NO_SLOT', message: '该摊位促销名额已经用完。' };
    }
    if ((user.booth_claims || []).includes(booth.id)) {
      return { error: 'ALREADY_CLAIMED', message: '这个玩家已经领过该摊位奖励。' };
    }
    booth.remaining_slots -= 1;
    user.booth_claims = user.booth_claims || [];
    user.booth_claims.push(booth.id);
    scoreDelta = parseOptionalNumber(payload.score_delta) ?? booth.score ?? 0;
    label = `摊位奖励：${booth.name}`;
    detail.sticker_code = payload.sticker_code || '';
  } else {
    return { error: 'BAD_REQUEST', message: '不支持的管理员操作。' };
  }

  if (scoreDelta !== 0) {
    user.score = clampMinZero(user.score + scoreDelta);
    team.total_score = clampMinZero(team.total_score + scoreDelta);
  }

  user.title = getTitleByScore(user.score, state.titles);
  user.updated_at = currentNow;
  team.updated_at = currentNow;

  const summary = {
    label,
    score_delta: scoreDelta,
    target_user_id: user._id,
    target_display_name: user.display_name,
    ...detail
  };
  logAdminAction(state, grantType, summary);
  addGrantLog(state, user, summary);
  saveState(state);

  return {
    success: true,
    message: '操作已完成。',
    player: getPlayerSummary(state, user),
    admin: buildAdminState(state)
  };
}

function buildAdminState(state) {
  const teamsMap = mapTeamsById(state);
  return {
    summary: {
      total_users: state.users.length,
      cirno_users: teamsMap[TEAM_IDS.CIRNO].member_count,
      daiyousei_users: teamsMap[TEAM_IDS.DAIYOUSEI].member_count,
      cirno_score: teamsMap[TEAM_IDS.CIRNO].total_score,
      daiyousei_score: teamsMap[TEAM_IDS.DAIYOUSEI].total_score
    },
    booths: state.admin.boothCampaigns,
    one_time_activities: state.admin.oneTimeActivities,
    players: state.users.map((user) => getPlayerSummary(state, user)).sort((a, b) => b.score - a.score),
    recent_admin_logs: [...state.admin.logs].sort((a, b) => b.created_at - a.created_at).slice(0, 20)
  };
}

function resetState() {
  const initialState = buildInitialState();
  saveState(initialState);
  return initialState;
}

function serveStatic(res, pathname, adminConfig) {
  let routePath = pathname === '/' ? '/index.html' : pathname;
  if (routePath === adminConfig.entryPath) {
    routePath = '/admin.html';
  }

  const relativePath = decodeURIComponent(routePath).replace(/^\/+/, '');
  const filePath = path.join(PUBLIC_DIR, relativePath);

  if (!filePath.startsWith(PUBLIC_DIR)) {
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
  const adminConfig = loadAdminConfig();
  const state = loadState();
  const session = ensureSession(req, res, state);

  if (url.pathname === '/admin.html') {
    res.writeHead(404);
    res.end('Not Found');
    return;
  }

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

  if (req.method === 'POST' && url.pathname === '/api/login') {
    try {
      const body = await collectBody(req);
      const result = loginUser(state, session.sessionId, body);
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

  if (req.method === 'POST' && url.pathname === '/api/admin/login') {
    try {
      const body = await collectBody(req);
      if (body.password !== adminConfig.password) {
        sendJson(res, 401, { error: 'FORBIDDEN', message: '口令错误。' });
        return;
      }
      const adminSessionId = createToken();
      state.admin.sessions[adminSessionId] = { created_at: nowSec() };
      saveState(state);
      res.setHeader('Set-Cookie', `tho_admin=${adminSessionId}; Path=/; HttpOnly; SameSite=Lax`);
      sendJson(res, 200, { success: true, admin: buildAdminState(state) });
    } catch {
      sendJson(res, 400, { error: 'BAD_REQUEST', message: '请求格式错误。' });
    }
    return;
  }

  if (url.pathname.startsWith('/api/admin/')) {
    const adminSession = getAdminSession(req, state);
    if (!adminSession) {
      sendJson(res, 401, { error: 'FORBIDDEN', message: '请先登录。' });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/admin/bootstrap') {
      sendJson(res, 200, { success: true, admin: buildAdminState(state) });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/admin/players') {
      const query = String(url.searchParams.get('q') || '').trim().toLowerCase();
      const players = buildAdminState(state).players.filter((player) => {
        if (!query) {
          return true;
        }
        return (
          player._id.toLowerCase().includes(query) ||
          player.ticket_code.toLowerCase().includes(query) ||
          player.display_name.toLowerCase().includes(query)
        );
      });
      sendJson(res, 200, { success: true, players });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/admin/grant') {
      try {
        const body = await collectBody(req);
        const result = adminGrant(state, body);
        sendJson(res, result.error ? 400 : 200, result);
      } catch {
        sendJson(res, 400, { error: 'BAD_REQUEST', message: '请求格式错误。' });
      }
      return;
    }
  }

  serveStatic(res, url.pathname, adminConfig);
});

server.listen(3000, () => {
  const adminConfig = loadAdminConfig();
  console.log(`Yangzhou THO web is running at http://127.0.0.1:3000`);
  console.log(`Admin entry: http://127.0.0.1:3000${adminConfig.entryPath}`);
});
