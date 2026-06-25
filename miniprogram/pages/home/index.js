const { callFunction } = require('../../utils/api');
const { formatCountdown, toTeamArray } = require('../../utils/format');
const { decorateTeams, getEventCharacter } = require('../../utils/characters');

Page({
  data: {
    user: null,
    teams: [],
    actions: [],
    buffCountdown: '',
    loadingActionId: '',
    resultModal: {
      visible: false
    }
  },

  onShow() {
    this.loadState();
  },

  async loadState() {
    const result = await callFunction('getHomeState');
    if (!result.registered) {
      wx.reLaunch({ url: '/pages/register/index' });
      return;
    }

    this.setData({
      user: result.user,
      teams: decorateTeams(toTeamArray(result.teams)),
      actions: result.available_actions,
      buffCountdown:
        result.user.regen_buff_until > Math.floor(Date.now() / 1000)
          ? formatCountdown(result.user.regen_buff_until)
          : ''
    });
  },

  async onActionTap(event) {
    const actionId = event.currentTarget.dataset.actionId;
    this.setData({ loadingActionId: actionId });
    try {
      const result = await callFunction('performAction', {
        action_id: actionId,
        client_request_id: `${Date.now()}-${Math.random().toString(16).slice(2)}`
      });

      const randomEvent = result.random_event || { triggered: false };
      const eventCharacter = randomEvent.triggered
        ? getEventCharacter(randomEvent.eventId)
        : null;

      this.setData({
        resultModal: {
          visible: true,
          title: result.action_result.action_name,
          actionText: result.action_result.text,
          scoreText: `个人分数 ${result.action_result.score_delta >= 0 ? '+' : ''}${result.action_result.score_delta}`,
          teamText: `队伍分数 ${result.action_result.team_delta_self >= 0 ? '+' : ''}${result.action_result.team_delta_self}`,
          staminaText: `体力 ${result.action_result.stamina_before} → ${result.action_result.stamina_after}`,
          randomEventTriggered: randomEvent.triggered,
          eventTitle: randomEvent.triggered ? randomEvent.name : '',
          eventDescription: randomEvent.triggered ? randomEvent.description : '',
          eventImage: eventCharacter ? eventCharacter.image : '',
          eventCharacterName: eventCharacter ? eventCharacter.name : '',
          eventEffectText: randomEvent.triggered
            ? `事件结算：个人 ${randomEvent.scoreDelta >= 0 ? '+' : ''}${randomEvent.scoreDelta}，队伍 ${randomEvent.teamDelta >= 0 ? '+' : ''}${randomEvent.teamDelta}`
            : ''
        }
      });

      await this.loadState();
    } finally {
      this.setData({ loadingActionId: '' });
    }
  },

  closeResultModal() {
    this.setData({
      resultModal: {
        visible: false
      }
    });
  },

  goProfile() {
    wx.navigateTo({ url: '/pages/profile/index' });
  },

  noop() {}
});
