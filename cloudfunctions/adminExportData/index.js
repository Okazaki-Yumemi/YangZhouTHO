const { COLLECTIONS, ensureAdmin, exportCollection, getWxContext } = require('../common');

exports.main = async () => {
  const { OPENID } = getWxContext();
  await ensureAdmin(OPENID);

  return {
    users: await exportCollection(COLLECTIONS.USERS),
    teams: await exportCollection(COLLECTIONS.TEAMS),
    action_logs: await exportCollection(COLLECTIONS.ACTION_LOGS)
  };
};
