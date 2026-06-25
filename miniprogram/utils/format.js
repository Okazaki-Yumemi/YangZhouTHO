function formatCountdown(targetSec) {
  const now = Math.floor(Date.now() / 1000);
  const remain = Math.max(0, targetSec - now);
  const minutes = Math.floor(remain / 60);
  const seconds = remain % 60;
  return `${minutes}分${String(seconds).padStart(2, '0')}秒`;
}

function toTeamArray(teamsMap) {
  return Object.keys(teamsMap || {}).map((id) => ({
    ...teamsMap[id],
    id
  }));
}

module.exports = {
  formatCountdown,
  toTeamArray
};
