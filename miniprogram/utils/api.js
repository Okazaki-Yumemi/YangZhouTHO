function callFunction(name, data = {}) {
  return wx.cloud
    .callFunction({
      name,
      data
    })
    .then((result) => result.result);
}

module.exports = {
  callFunction
};
