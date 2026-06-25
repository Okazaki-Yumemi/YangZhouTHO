const {
  db,
  getEnabledActions,
  getWxContext,
  hydrateUserState,
  normalizeUserForClient,
  pickActions,
  updateUserState
} = require('../common');

exports.main = async () => {
  const { OPENID } = getWxContext();

  return db.runTransaction(async (transaction) => {
    const state = await hydrateUserState(OPENID, transaction);
    if (!state.user) {
      return {
        registered: false
      };
    }

    state.user.updated_at = Math.floor(Date.now() / 1000);
    await updateUserState(transaction, state.user);

    const actions = await getEnabledActions(transaction);
    return {
      registered: true,
      user: normalizeUserForClient(state.user, state.titles),
      teams: state.teams,
      config: state.config,
      available_actions: pickActions(actions, OPENID, Math.floor(Date.now() / 1000))
    };
  });
};
