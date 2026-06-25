App({
  globalData: {
    env: 'your-cloud-env-id',
    initState: null
  },

  onLaunch() {
    if (!wx.cloud) {
      throw new Error('请使用支持云开发的基础库');
    }

    wx.cloud.init({
      env: this.globalData.env,
      traceUser: true
    });
  }
});
