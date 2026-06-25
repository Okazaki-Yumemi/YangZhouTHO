const { callFunction } = require('../../utils/api');

Page({
  data: {
    exportData: null,
    loading: false
  },

  async onExportTap() {
    this.setData({ loading: true });
    try {
      const exportData = await callFunction('adminExportData');
      this.setData({ exportData });
    } finally {
      this.setData({ loading: false });
    }
  }
});
