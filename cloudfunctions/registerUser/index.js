const {
  COLLECTIONS,
  ERROR_CODES,
  cloud,
  createError,
  db,
  getConfig,
  getTeamsMap,
  getTitles,
  getUserByOpenid,
  getWxContext,
  nowSec
} = require('../common');
const { TEAM_FULL_HINT } = require('../../shared/constants');
const { canJoinTeam, getTitleByScore } = require('../../shared/logic');

exports.main = async (event) => {
  const { code, team, display_name } = event;
  const { OPENID } = getWxContext();
  const currentNow = nowSec();

  return db.runTransaction(async (transaction) => {
    const config = await getConfig(transaction);
    if (!config.registration_open) {
      throw createError(ERROR_CODES.REGISTRATION_CLOSED, 'Registration closed');
    }

    const existingUser = await getUserByOpenid(OPENID, transaction);
    if (existingUser) {
      throw createError(ERROR_CODES.ALREADY_REGISTERED, 'Already registered');
    }

    const ticketRef = transaction.collection(COLLECTIONS.TICKET_CODES).doc(code);
    let ticket;
    try {
      const result = await ticketRef.get();
      ticket = result.data;
    } catch (error) {
      throw createError(ERROR_CODES.INVALID_CODE, 'Invalid code');
    }

    if (!ticket || ticket.status === 'disabled') {
      throw createError(ERROR_CODES.INVALID_CODE, 'Invalid code');
    }
    if (ticket.status !== 'unused') {
      throw createError(ERROR_CODES.CODE_ALREADY_USED, 'Code already used');
    }

    const teams = await getTeamsMap(transaction);
    const teamCheck = canJoinTeam(teams, team, config.team_join_max_diff);
    if (!teamCheck.allowed) {
      throw createError(ERROR_CODES.TEAM_JOIN_RESTRICTED, TEAM_FULL_HINT, {
        team_full_hint: TEAM_FULL_HINT
      });
    }

    const titles = await getTitles(transaction);
    const userId = `user_${OPENID}`;
    const title = getTitleByScore(0, titles);
    await transaction.collection(COLLECTIONS.USERS).doc(userId).set({
      data: {
        _id: userId,
        openid: OPENID,
        ticket_code: code,
        display_name: display_name || `游客${String(currentNow).slice(-4)}`,
        team,
        score: 0,
        title,
        stamina: config.stamina_cap,
        last_stamina_at: currentNow,
        regen_buff_until: 0,
        next_action_bonus: 0,
        banned: false,
        created_at: currentNow,
        updated_at: currentNow
      }
    });

    await ticketRef.update({
      data: {
        status: 'bound',
        bound_openid: OPENID,
        bound_user_id: userId,
        bound_at: currentNow
      }
    });

    await transaction.collection(COLLECTIONS.TEAMS).doc(team).update({
      data: {
        member_count: cloud.database().command.inc(1),
        updated_at: currentNow
      }
    });

    return {
      success: true,
      user_id: userId,
      team
    };
  });
};
