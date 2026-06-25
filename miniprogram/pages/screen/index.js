const { callFunction } = require('../../utils/api');
const { toTeamArray } = require('../../utils/format');

Page({
  data: {
    teams: [],
    leaderText: '加载中'
  },

  async onShow() {
    const result = await callFunction('getInitState');
    const teams = toTeamArray(result.teams);
    const sorted = [...teams].sort((a, b) => b.total_score - a.total_score);
    const diff = sorted.length >= 2 ? sorted[0].total_score - sorted[1].total_score : 0;
    this.setData({
      teams,
      leaderText: sorted.length ? `${sorted[0].name} 领先 ${diff} 分` : '暂无数据'
    });
  }
});
