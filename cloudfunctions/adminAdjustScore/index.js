const {
  COLLECTIONS,
  clampMinZero,
  db,
  ensureAdmin,
  getWxContext,
  nowSec,
  writeAdminLog
} = require('../common');

exports.main = async (event) => {
  const { target_user_id, score_delta, reason } = event;
  const { OPENID } = getWxContext();
  await ensureAdmin(OPENID);

  return db.runTransaction(async (transaction) => {
    const userDoc = await transaction.collection(COLLECTIONS.USERS).doc(target_user_id).get();
    const user = userDoc.data;
    const teamDoc = await transaction.collection(COLLECTIONS.TEAMS).doc(user.team).get();
    const team = teamDoc.data;
    user.score = clampMinZero(user.score + score_delta);
    team.total_score = clampMinZero(team.total_score + score_delta);
    user.updated_at = nowSec();
    team.updated_at = nowSec();
    await transaction.collection(COLLECTIONS.USERS).doc(user._id).update({
      data: {
        score: user.score,
        updated_at: user.updated_at
      }
    });
    await transaction.collection(COLLECTIONS.TEAMS).doc(team._id).update({
      data: {
        total_score: team.total_score,
        updated_at: team.updated_at
      }
    });
    await writeAdminLog(OPENID, 'adminAdjustScore', event);

    return {
      success: true,
      user,
      team,
      reason
    };
  });
};
