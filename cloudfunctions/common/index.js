const cloud = require('wx-server-sdk');
const {
  applyPositiveBonus,
  calculateCurrentStamina,
  clampMinZero,
  getTitleByScore,
  pickActions,
  resolveActionOutcome,
  resolveRandomEvent,
  weightedPick
} = require('../../shared/logic');
const { ERROR_CODES } = require('../../shared/constants');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;

const COLLECTIONS = {
  ACTIVITY_CONFIG: 'activity_config',
  ACTION_LOGS: 'action_logs',
  ACTIONS_CONFIG: 'actions_config',
  ADMIN_LOGS: 'admin_logs',
  ADMIN_USERS: 'admin_users',
  RANDOM_EVENTS_CONFIG: 'random_events_config',
  REQUEST_LOCKS: 'request_locks',
  TEAMS: 'teams',
  TICKET_CODES: 'ticket_codes',
  TITLES_CONFIG: 'titles_config',
  USERS: 'users'
};

function nowSec() {
  return Math.floor(Date.now() / 1000);
}

function createError(code, message, extra = {}) {
  const error = new Error(message || code);
  error.code = code;
  Object.assign(error, extra);
  return error;
}

async function getConfig(transaction) {
  const executor = transaction || db;
  const { data } = await executor.collection(COLLECTIONS.ACTIVITY_CONFIG).doc('main').get();
  return data;
}

async function getTeamsMap(transaction) {
  const executor = transaction || db;
  const { data } = await executor.collection(COLLECTIONS.TEAMS).get();
  return data.reduce((map, team) => {
    map[team._id] = team;
    return map;
  }, {});
}

async function getTitles(transaction) {
  const executor = transaction || db;
  const { data } = await executor.collection(COLLECTIONS.TITLES_CONFIG).get();
  return data;
}

async function getEnabledActions(transaction) {
  const executor = transaction || db;
  const { data } = await executor.collection(COLLECTIONS.ACTIONS_CONFIG).where({ enabled: true }).get();
  return data;
}

async function getEnabledRandomEvents(transaction) {
  const executor = transaction || db;
  const { data } = await executor
    .collection(COLLECTIONS.RANDOM_EVENTS_CONFIG)
    .where({ enabled: true })
    .get();
  return data;
}

async function getUserByOpenid(openid, transaction) {
  const executor = transaction || db;
  const { data } = await executor.collection(COLLECTIONS.USERS).where({ openid }).limit(1).get();
  return data[0] || null;
}

async function ensureAdmin(openid) {
  const { data } = await db.collection(COLLECTIONS.ADMIN_USERS).doc(openid).get();
  if (!data || !data.enabled) {
    throw createError(ERROR_CODES.FORBIDDEN, 'Admin only');
  }
  return data;
}

function getWxContext() {
  return cloud.getWXContext();
}

function normalizeUserForClient(user, titles) {
  return {
    _id: user._id,
    display_name: user.display_name,
    ticket_code: user.ticket_code,
    team: user.team,
    score: user.score,
    title: user.title || getTitleByScore(user.score, titles),
    stamina: user.stamina,
    regen_buff_until: user.regen_buff_until,
    next_action_bonus: user.next_action_bonus,
    banned: user.banned
  };
}

async function hydrateUserState(openid, transaction) {
  const config = await getConfig(transaction);
  const teams = await getTeamsMap(transaction);
  const titles = await getTitles(transaction);
  const user = await getUserByOpenid(openid, transaction);

  if (!user) {
    return { config, teams, titles, user: null };
  }

  const staminaState = calculateCurrentStamina(user, nowSec(), config);
  user.stamina = staminaState.stamina;
  user.last_stamina_at = staminaState.lastStaminaAt;
  user.title = getTitleByScore(user.score, titles);

  return { config, teams, titles, user };
}

async function acquireRequestLock(transaction, openid, clientRequestId) {
  const lockId = `${openid}:${clientRequestId}`;
  const lockRef = transaction.collection(COLLECTIONS.REQUEST_LOCKS).doc(lockId);
  try {
    await lockRef.get();
    throw createError(ERROR_CODES.DUPLICATE_REQUEST, 'Duplicate request');
  } catch (error) {
    if (error.code && error.code !== 'DOCUMENT_NOT_FOUND') {
      throw error;
    }
  }

  await lockRef.set({
    data: {
      _id: lockId,
      openid,
      client_request_id: clientRequestId,
      created_at: nowSec()
    }
  });
}

async function updateUserState(transaction, user) {
  const { _id, ...payload } = user;
  await transaction.collection(COLLECTIONS.USERS).doc(_id).update({ data: payload });
}

async function writeActionLog(transaction, log) {
  await transaction.collection(COLLECTIONS.ACTION_LOGS).add({ data: log });
}

async function writeAdminLog(openid, action, payload) {
  await db.collection(COLLECTIONS.ADMIN_LOGS).add({
    data: {
      admin_openid: openid,
      action,
      payload,
      created_at: nowSec()
    }
  });
}

async function exportCollection(name) {
  const { data } = await db.collection(name).limit(1000).get();
  return data;
}

module.exports = {
  COLLECTIONS,
  ERROR_CODES,
  _,
  acquireRequestLock,
  applyPositiveBonus,
  calculateCurrentStamina,
  clampMinZero,
  cloud,
  createError,
  db,
  ensureAdmin,
  exportCollection,
  getConfig,
  getEnabledActions,
  getEnabledRandomEvents,
  getTeamsMap,
  getTitles,
  getUserByOpenid,
  getWxContext,
  getTitleByScore,
  hydrateUserState,
  normalizeUserForClient,
  nowSec,
  pickActions,
  resolveActionOutcome,
  resolveRandomEvent,
  updateUserState,
  weightedPick,
  writeActionLog,
  writeAdminLog
};
