const { callFunction } = require('../../utils/api');

Page({
  data: {
    user: null,
    actionLogs: [],
    randomEventLogs: []
  },

  async onShow() {
    const result = await callFunction('getHomeState');
    this.setData({
      user: result.user,
      actionLogs: [],
      randomEventLogs: []
    });
  }
});
