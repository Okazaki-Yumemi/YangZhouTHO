const loginView = document.querySelector('#admin-login');
const adminApp = document.querySelector('#admin-app');
const loginBtn = document.querySelector('#admin-login-btn');
const loginError = document.querySelector('#admin-login-error');
const summaryBox = document.querySelector('#admin-summary');
const playerSearch = document.querySelector('#player-search');
const playerSearchBtn = document.querySelector('#player-search-btn');
const playerResults = document.querySelector('#player-results');
const selectedPlayerTitle = document.querySelector('#selected-player-title');
const selectedPlayerCard = document.querySelector('#selected-player-card');
const boothStatus = document.querySelector('#booth-status');
const adminLogs = document.querySelector('#admin-logs');
const actionMessage = document.querySelector('#admin-action-message');
const oneTimeSelect = document.querySelector('#one-time-activity');
const boothSelect = document.querySelector('#booth-select');
const resetPasswordInput = document.querySelector('#reset-password');
const adminPageButtons = document.querySelectorAll('[data-admin-page-target]');
const adminPages = document.querySelectorAll('.admin-page');
const lotteryDrawBtn = document.querySelector('#lottery-draw-btn');
const lotteryRoller = document.querySelector('#lottery-roller');
const lotteryResult = document.querySelector('#lottery-result');
const adminResetOpenBtn = document.querySelector('#admin-reset-open');
const adminResetConfirm = document.querySelector('#admin-reset-confirm');
const adminResetCancelBtn = document.querySelector('#admin-reset-cancel');
const adminResetSubmitBtn = document.querySelector('#admin-reset-submit');
const adminResetPasswordInput = document.querySelector('#admin-reset-password');
const adminResetMessage = document.querySelector('#admin-reset-message');

const adminState = {
  selectedPlayer: null,
  bootstrap: null,
  drawingLottery: false
};

const HTML_ESCAPE_MAP = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
};

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => HTML_ESCAPE_MAP[char]);
}

async function request(path, options = {}) {
  const response = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...options
  });
  return response.json();
}

function renderSummary(summary) {
  summaryBox.innerHTML = `
    <div class="summary-grid">
      <div class="summary-item"><span>总玩家</span><strong>${summary.total_users}</strong></div>
      <div class="summary-item"><span>琪露诺队</span><strong>${summary.cirno_users} 人 / ${summary.cirno_score} 分</strong></div>
      <div class="summary-item"><span>大妖精队</span><strong>${summary.daiyousei_users} 人 / ${summary.daiyousei_score} 分</strong></div>
    </div>
  `;
}

function renderPlayerResults(players) {
  if (!players.length) {
    playerResults.innerHTML = '<div class="empty-state">没有结果</div>';
    return;
  }

  playerResults.innerHTML = players
    .map(
      (player) => `
        <button class="player-result" data-player="${player._id}" type="button">
          <strong>${escapeHtml(player.display_name)}</strong>
          <span>${escapeHtml(player.ticket_code)} · ${escapeHtml(player.team_name)} · ${player.score} 分</span>
        </button>
      `
    )
    .join('');

  document.querySelectorAll('[data-player]').forEach((button) => {
    button.addEventListener('click', () => {
      const nextPlayer = players.find((item) => item._id === button.dataset.player);
      adminState.selectedPlayer = nextPlayer;
      renderSelectedPlayer();
    });
  });
}

function renderSelectedPlayer() {
  if (!adminState.selectedPlayer) {
    selectedPlayerTitle.textContent = '未选择';
    selectedPlayerCard.textContent = '先选中一个玩家。';
    return;
  }

  const player = adminState.selectedPlayer;
  selectedPlayerTitle.textContent = player.display_name;
  selectedPlayerCard.innerHTML = `
    <div class="summary-grid">
      <div class="summary-item"><span>ID</span><strong>${escapeHtml(player._id)}</strong></div>
      <div class="summary-item"><span>门票码</span><strong>${escapeHtml(player.ticket_code)}</strong></div>
      <div class="summary-item"><span>阵营</span><strong>${escapeHtml(player.team_name)}</strong></div>
      <div class="summary-item"><span>积分</span><strong>${player.score}</strong></div>
      <div class="summary-item"><span>体力</span><strong>${player.stamina}</strong></div>
      <div class="summary-item"><span>称号</span><strong>${escapeHtml(player.title)}</strong></div>
    </div>
    <p class="helper-text">小游戏记录：${escapeHtml((player.one_time_claims || []).join('、') || '无')}</p>
    <p class="helper-text">摊位记录：${escapeHtml((player.booth_claims || []).join('、') || '无')}</p>
  `;
}

function renderBooths(booths) {
  boothStatus.innerHTML = booths
    .map(
      (booth) => `
        <div class="booth-item">
          <strong>${escapeHtml(booth.name)}</strong>
          <span>剩余 ${booth.remaining_slots}</span>
        </div>
      `
    )
    .join('');

  boothSelect.innerHTML = booths
    .map(
      (booth) =>
        `<option value="${escapeHtml(booth.id)}">${escapeHtml(booth.name)}（默认 ${booth.score} 分，剩余 ${booth.remaining_slots}）</option>`
    )
    .join('');
}

function renderActivities(activities) {
  oneTimeSelect.innerHTML = activities
    .map(
      (activity) =>
        `<option value="${escapeHtml(activity.id)}">${escapeHtml(activity.name)}（默认 ${activity.score} 分）</option>`
    )
    .join('');
}

function renderAdminLogs(logs) {
  if (!logs.length) {
    adminLogs.innerHTML = '<div class="empty-state">暂无记录</div>';
    return;
  }

  adminLogs.innerHTML = logs
    .map(
      (log) => `
        <div class="log-item">
          <strong>${escapeHtml(log.action)}</strong>
          <span>${escapeHtml(log.detail.target_display_name || '')} ${escapeHtml(log.detail.label || '')}</span>
        </div>
      `
    )
    .join('');
}

function renderLotteryResult(player) {
  lotteryResult.classList.remove('empty-state');
  lotteryResult.innerHTML = `
    <div class="summary-grid">
      <div class="summary-item"><span>中奖昵称</span><strong>${escapeHtml(player.display_name)}</strong></div>
      <div class="summary-item"><span>用户 ID</span><strong>${escapeHtml(player._id)}</strong></div>
      <div class="summary-item"><span>阵营</span><strong>${escapeHtml(player.team_name)}</strong></div>
    </div>
  `;
}

function renderBootstrap(admin) {
  adminState.bootstrap = admin;
  renderSummary(admin.summary);
  renderPlayerResults(admin.players);
  renderBooths(admin.booths);
  renderActivities(admin.one_time_activities);
  renderAdminLogs(admin.recent_admin_logs);
  renderSelectedPlayer();
}

function switchAdminPage(pageName) {
  adminPages.forEach((page) => {
    page.classList.toggle('hidden', page.id !== `admin-page-${pageName}`);
  });
  adminPageButtons.forEach((button) => {
    button.classList.toggle('active', button.dataset.adminPageTarget === pageName);
  });
}

async function loadBootstrap() {
  const result = await request('/api/admin/bootstrap');
  if (result.error) {
    return;
  }
  loginView.classList.add('hidden');
  adminApp.classList.remove('hidden');
  renderBootstrap(result.admin);
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function runLotteryAnimation(winner) {
  const players = (adminState.bootstrap?.players || []).filter((player) => player.display_name);
  const names = players.length ? players.map((player) => player.display_name) : [winner.display_name];
  const rounds = 34;

  lotteryRoller.classList.add('rolling');
  for (let index = 0; index < rounds; index += 1) {
    lotteryRoller.textContent = names[index % names.length];
    const progress = index / rounds;
    await sleep(42 + progress * 70);
  }
  lotteryRoller.textContent = winner.display_name;
  lotteryRoller.classList.remove('rolling');
  lotteryRoller.classList.add('winner');
}

async function drawLottery() {
  if (adminState.drawingLottery) {
    return;
  }
  adminState.drawingLottery = true;
  lotteryDrawBtn.disabled = true;
  lotteryResult.classList.add('empty-state');
  lotteryResult.textContent = '抽奖中...';
  lotteryRoller.classList.remove('winner');

  const result = await request('/api/admin/lottery/draw', { method: 'POST' });
  if (result.error) {
    lotteryResult.textContent = result.message || '抽奖失败';
    adminState.drawingLottery = false;
    lotteryDrawBtn.disabled = false;
    return;
  }

  await runLotteryAnimation(result.winner);
  renderLotteryResult(result.winner);
  renderBootstrap(result.admin);
  adminState.drawingLottery = false;
  lotteryDrawBtn.disabled = false;
}

async function searchPlayers() {
  const result = await request(`/api/admin/players?q=${encodeURIComponent(playerSearch.value.trim())}`);
  if (!result.error) {
    renderPlayerResults(result.players);
  }
}

function readOptionalNumber(selector) {
  const raw = document.querySelector(selector).value.trim();
  return raw === '' ? null : Number(raw);
}

async function submitAdminAction(grantType) {
  if (!adminState.selectedPlayer) {
    actionMessage.textContent = '请先选择玩家。';
    return;
  }

  const payload = {
    grant_type: grantType,
    target_user_id: adminState.selectedPlayer._id
  };

  if (grantType === 'reset_password') {
    payload.password = resetPasswordInput.value.trim();
    if (!payload.password) {
      actionMessage.textContent = '请输入新的密码。';
      resetPasswordInput.classList.add('invalid');
      return;
    }
    resetPasswordInput.classList.remove('invalid');
  } else if (grantType === 'custom_score') {
    payload.score_delta = Number(document.querySelector('#custom-score').value || 0);
    payload.reason = document.querySelector('#custom-reason').value.trim() || '手动加分';
  } else if (grantType === 'restore_stamina') {
    payload.reason = document.querySelector('#restore-reason').value.trim() || '管理员恢复体力';
  } else if (grantType === 'stage_manual') {
    payload.score_delta = Number(document.querySelector('#stage-score').value || 0);
    payload.reason = document.querySelector('#stage-reason').value.trim() || '舞台互动';
    payload.sticker_code = document.querySelector('#stage-sticker').value.trim();
  } else if (grantType === 'one_time_activity') {
    payload.activity_id = oneTimeSelect.value;
    payload.score_delta = readOptionalNumber('#one-time-score');
    payload.sticker_code = document.querySelector('#one-time-sticker').value.trim();
  } else if (grantType === 'booth_reward') {
    payload.booth_id = boothSelect.value;
    payload.score_delta = readOptionalNumber('#booth-score');
    payload.sticker_code = document.querySelector('#booth-sticker').value.trim();
  }

  const result = await request('/api/admin/grant', {
    method: 'POST',
    body: JSON.stringify(payload)
  });

  actionMessage.textContent = result.message || result.error || '操作失败';
  if (!result.error) {
    adminState.selectedPlayer = result.player;
    renderBootstrap(result.admin);
    if (grantType === 'reset_password') {
      resetPasswordInput.value = '';
    }
  }
}

function showAdminResetMessage(message, isError = true) {
  adminResetMessage.textContent = message;
  adminResetMessage.classList.toggle('error-text', isError);
  adminResetMessage.classList.toggle('helper-text', !isError);
  adminResetMessage.classList.remove('hidden');
}

function closeAdminResetConfirm() {
  adminResetConfirm.classList.add('hidden');
  adminResetPasswordInput.value = '';
  adminResetPasswordInput.classList.remove('invalid');
  adminResetMessage.classList.add('hidden');
}

async function resetAllData() {
  const password = adminResetPasswordInput.value.trim();
  if (!password) {
    adminResetPasswordInput.classList.add('invalid');
    showAdminResetMessage('请输入管理员口令。');
    return;
  }

  adminResetSubmitBtn.disabled = true;
  const result = await request('/api/admin/reset', {
    method: 'POST',
    body: JSON.stringify({ password })
  });
  adminResetSubmitBtn.disabled = false;

  if (result.error) {
    adminResetPasswordInput.classList.add('invalid');
    showAdminResetMessage(result.message || '重置失败。');
    return;
  }

  adminState.selectedPlayer = null;
  playerSearch.value = '';
  closeAdminResetConfirm();
  renderBootstrap(result.admin);
  actionMessage.textContent = result.message || '数据已重置。';
}

loginBtn.addEventListener('click', async () => {
  loginError.classList.add('hidden');
  const result = await request('/api/admin/login', {
    method: 'POST',
    body: JSON.stringify({
      password: document.querySelector('#admin-password').value.trim()
    })
  });
  if (result.error) {
    loginError.textContent = result.message;
    loginError.classList.remove('hidden');
    return;
  }
  loginView.classList.add('hidden');
  adminApp.classList.remove('hidden');
  renderBootstrap(result.admin);
});

playerSearchBtn.addEventListener('click', searchPlayers);
playerSearch.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    searchPlayers();
  }
});

resetPasswordInput.addEventListener('input', () => resetPasswordInput.classList.remove('invalid'));
adminResetPasswordInput.addEventListener('input', () => {
  adminResetPasswordInput.classList.remove('invalid');
  adminResetMessage.classList.add('hidden');
});

document.querySelectorAll('[data-admin-action]').forEach((button) => {
  button.addEventListener('click', () => submitAdminAction(button.dataset.adminAction));
});

adminPageButtons.forEach((button) => {
  button.addEventListener('click', () => switchAdminPage(button.dataset.adminPageTarget));
});

lotteryDrawBtn.addEventListener('click', drawLottery);
adminResetOpenBtn.addEventListener('click', () => {
  adminResetConfirm.classList.remove('hidden');
  adminResetPasswordInput.focus();
});
adminResetCancelBtn.addEventListener('click', closeAdminResetConfirm);
adminResetSubmitBtn.addEventListener('click', resetAllData);

loadBootstrap();
