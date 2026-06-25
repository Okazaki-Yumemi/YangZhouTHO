const {
  COLLECTIONS,
  ERROR_CODES,
  acquireRequestLock,
  applyPositiveBonus,
  clampMinZero,
  createError,
  db,
  getConfig,
  getEnabledRandomEvents,
  getTeamsMap,
  getTitles,
  getUserByOpenid,
  getWxContext,
  nowSec,
  resolveActionOutcome,
  resolveRandomEvent,
  updateUserState,
  weightedPick,
  writeActionLog
} = require('../common');
const { createSeededRandom, getTitleByScore } = require('../../shared/logic');

exports.main = async (event) => {
  const { action_id, client_request_id } = event;
  const { OPENID } = getWxContext();

  return db.runTransaction(async (transaction) => {
    const config = await getConfig(transaction);
    if (!config.action_open) {
      throw createError(ERROR_CODES.ACTION_CLOSED, 'Action closed');
    }

    const user = await getUserByOpenid(OPENID, transaction);
    if (!user) {
      throw createError(ERROR_CODES.USER_NOT_FOUND, 'User not found');
    }
    if (user.banned) {
      throw createError(ERROR_CODES.USER_BANNED, 'User is banned');
    }

    await acquireRequestLock(transaction, OPENID, client_request_id);

    const teams = await getTeamsMap(transaction);
    const titles = await getTitles(transaction);
    const currentNow = nowSec();
    const staminaState = require('../../shared/logic').calculateCurrentStamina(user, currentNow, config);
    user.stamina = staminaState.stamina;
    user.last_stamina_at = staminaState.lastStaminaAt;

    const actionDoc = await transaction.collection(COLLECTIONS.ACTIONS_CONFIG).doc(action_id).get();
    const action = actionDoc.data;
    if (!action || !action.enabled) {
      throw createError(ERROR_CODES.ACTION_NOT_FOUND, 'Action not found');
    }
    if (user.stamina < action.stamina_cost) {
      throw createError(ERROR_CODES.STAMINA_NOT_ENOUGH, 'Not enough stamina');
    }

    const staminaBefore = user.stamina;
    user.stamina -= action.stamina_cost;
    const ownTeam = teams[user.team];
    const opponentTeamId = user.team === 'cirno' ? 'daiyousei' : 'cirno';
    const opponentTeam = teams[opponentTeamId];
    const random = createSeededRandom(`${OPENID}:${client_request_id}:${currentNow}`);

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
    opponentTeam.total_score = clampMinZero(
      opponentTeam.total_score + actionOutcome.teamDeltaOpponent
    );
    user.stamina = Math.min(config.stamina_cap, user.stamina + actionOutcome.staminaDelta);
    user.regen_buff_until = actionOutcome.regenBuffUntil;

    let randomEvent = { triggered: false };
    if (random() < config.random_event_chance) {
      const randomEvents = await getEnabledRandomEvents(transaction);
      const pickedEvent = weightedPick(randomEvents, random);
      if (pickedEvent) {
        const eventResult = resolveRandomEvent(pickedEvent, {
          config,
          user
        });
        user.score = clampMinZero(user.score + eventResult.scoreDelta);
        ownTeam.total_score = clampMinZero(ownTeam.total_score + eventResult.teamDelta);
        user.stamina = eventResult.staminaAfter;
        user.regen_buff_until = eventResult.regenBuffUntil;
        user.next_action_bonus = eventResult.nextActionBonus;
        randomEvent = eventResult;
      }
    }

    user.title = getTitleByScore(user.score, titles);
    user.updated_at = currentNow;
    await updateUserState(transaction, user);
    await transaction.collection(COLLECTIONS.TEAMS).doc(ownTeam._id).update({
      data: {
        total_score: ownTeam.total_score,
        updated_at: currentNow
      }
    });
    await transaction.collection(COLLECTIONS.TEAMS).doc(opponentTeam._id).update({
      data: {
        total_score: opponentTeam.total_score,
        updated_at: currentNow
      }
    });

    await writeActionLog(transaction, {
      user_id: user._id,
      openid: OPENID,
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
      user: {
        _id: user._id,
        display_name: user.display_name,
        team: user.team,
        score: user.score,
        title: user.title,
        stamina: user.stamina,
        regen_buff_until: user.regen_buff_until,
        next_action_bonus: user.next_action_bonus
      },
      teams: {
        [ownTeam._id]: ownTeam,
        [opponentTeam._id]: opponentTeam
      }
    };
  });
};
