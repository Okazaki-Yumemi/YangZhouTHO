const { callFunction } = require('../../utils/api');
const { toTeamArray } = require('../../utils/format');

Page({
  data: {
    code: '',
    selectedTeam: '',
    teams: [],
    config: null,
    registered: false,
    loading: false,
    errorText: ''
  },

  onLoad(query) {
    this.setData({
      code: query.code || ''
    });
    this.loadState();
  },

  async loadState() {
    const result = await callFunction('getInitState');
    if (result.registered) {
      wx.reLaunch({ url: '/pages/home/index' });
      return;
    }
    this.setData({
      teams: toTeamArray(result.teams),
      config: result.config
    });
  },

  onCodeInput(event) {
    this.setData({ code: event.detail.value.trim() });
  },

  onSelectTeam(event) {
    this.setData({ selectedTeam: event.currentTarget.dataset.teamId, errorText: '' });
  },

  async onSubmit() {
    if (!this.data.code || !this.data.selectedTeam) {
      this.setData({ errorText: '请先填写门票码并选择队伍。' });
      return;
    }

    this.setData({ loading: true, errorText: '' });
    try {
      await callFunction('registerUser', {
        code: this.data.code,
        team: this.data.selectedTeam
      });
      wx.reLaunch({ url: '/pages/home/index' });
    } catch (error) {
      this.setData({
        errorText:
          (error && error.errMsg && error.errMsg.includes('TEAM_JOIN_RESTRICTED')
            ? '这边队伍已经太热闹了，请加入另一边。'
            : '') || '注册失败，请检查门票码后重试。'
      });
    } finally {
      this.setData({ loading: false });
    }
  }
});
