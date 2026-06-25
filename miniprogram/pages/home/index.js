const { callFunction } = require('../../utils/api');
const { formatCountdown, toTeamArray } = require('../../utils/format');

Page({
  data: {
    user: null,
    teams: [],
    actions: [],
    buffCountdown: '',
    loadingActionId: ''
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
      teams: toTeamArray(result.teams),
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
      const randomEventText = result.random_event.triggered
        ? `\n触发事件：${result.random_event.name}`
        : '';
      await wx.showModal({
        title: result.action_result.action_name,
        content:
          `${result.action_result.text}\n个人分数 ${result.action_result.score_delta}\n队伍分数 ${result.action_result.team_delta_self}${randomEventText}`,
        showCancel: false
      });
      this.loadState();
    } finally {
      this.setData({ loadingActionId: '' });
    }
  },

  goProfile() {
    wx.navigateTo({ url: '/pages/profile/index' });
  }
});
