const {
  getEnabledActions,
  getWxContext,
  hydrateUserState,
  normalizeUserForClient,
  pickActions
} = require('../common');

exports.main = async () => {
  const { OPENID } = getWxContext();
  const state = await hydrateUserState(OPENID);
  const availableActions = state.user ? pickActions(await getEnabledActions(), OPENID, Date.now() / 1000) : [];

  return {
    registered: Boolean(state.user),
    user: state.user ? normalizeUserForClient(state.user, state.titles) : null,
    teams: state.teams,
    config: state.config,
    available_actions: availableActions
  };
};
