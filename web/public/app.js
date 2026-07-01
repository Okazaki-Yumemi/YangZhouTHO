const CHARACTER_ASSETS = {
  cirno: {
    name: '琪露诺',
    src: '/characters/cirno.png',
    width: 470,
    height: 730,
    bg: '#e5f8ff',
    line: 'rgba(45, 139, 208, 0.24)'
  },
  daiyousei: {
    name: '大妖精',
    src: '/characters/daiyousei.png',
    width: 520,
    height: 750,
    bg: '#e9f8ed',
    line: 'rgba(48, 150, 94, 0.24)'
  },
  sakuya: {
    name: '咲夜',
    src: '/characters/sakuya.png',
    width: 510,
    height: 830,
    bg: '#eef3fb',
    line: 'rgba(70, 96, 140, 0.22)'
  },
  seija: {
    name: '鬼人正邪',
    src: '/characters/seija.png',
    width: 420,
    height: 740,
    bg: '#f5eef9',
    line: 'rgba(139, 87, 169, 0.22)'
  },
  remilia: {
    name: '蕾米莉亚',
    src: '/characters/remilia.png',
    width: 720,
    height: 790,
    bg: '#fff0f3',
    line: 'rgba(193, 77, 98, 0.22)'
  },
  marisa: {
    name: '魔理沙',
    src: '/characters/marisa.png',
    width: 520,
    height: 810,
    bg: '#fff7df',
    line: 'rgba(194, 143, 44, 0.24)'
  },
  patchouli: {
    name: '帕秋莉',
    src: '/characters/patchouli.png',
    width: 520,
    height: 800,
    bg: '#f2edfb',
    line: 'rgba(103, 84, 166, 0.22)'
  },
  meiling: {
    name: '红美铃',
    src: '/characters/meiling.png',
    width: 620,
    height: 900,
    bg: '#eaf7ef',
    line: 'rgba(40, 150, 95, 0.24)'
  }
};

const TEAM_META = {
  cirno: { captain: '琪露诺', asset: CHARACTER_ASSETS.cirno },
  daiyousei: { captain: '大妖精', asset: CHARACTER_ASSETS.daiyousei }
};

const EVENT_META = {
  anti_fairy_trap: { name: '咲夜', asset: CHARACTER_ASSETS.sakuya },
  seija_reverse: { name: '鬼人正邪', asset: CHARACTER_ASSETS.seija },
  scarlet_dining: { name: '蕾米莉亚', asset: CHARACTER_ASSETS.remilia },
  marisa_gift: { name: '魔理沙', asset: CHARACTER_ASSETS.marisa },
  mystery_tea: { name: '帕秋莉', asset: CHARACTER_ASSETS.patchouli },
  meiling_sleep: { name: '红美铃', asset: CHARACTER_ASSETS.meiling }
};

const TEAM_NAME = {
  cirno: '琪露诺探索小队',
  daiyousei: '大妖精探索小队'
};

const uiState = { selectedTeam: '', current: null };
const registerView = document.querySelector('#register-view');
const homeView = document.querySelector('#home-view');
const ticketInput = document.querySelector('#ticket-code');
const nicknameInput = document.querySelector('#display-name');
const passwordInput = document.querySelector('#register-password');
const passwordConfirmInput = document.querySelector('#register-password-confirm');
const loginNameInput = document.querySelector('#login-name');
const loginPasswordInput = document.querySelector('#login-password');
const registerBtn = document.querySelector('#register-btn');
const loginBtn = document.querySelector('#login-btn');
const registerError = document.querySelector('#register-error');
const loginError = document.querySelector('#login-error');
const teamBoard = document.querySelector('#team-board');
const teamPicks = document.querySelector('#team-picks');
const leaderboardList = document.querySelector('#leaderboard-list');
const personalLog = document.querySelector('#personal-log');
const personalBlock = document.querySelector('#personal-block');
const actionsGrid = document.querySelector('#actions-grid');
const resultModal = document.querySelector('#result-modal');
const closeModalBtn = document.querySelector('#close-modal');
const COLLAPSED_LOG_VISIBLE_COUNT = 3;

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

function renderCharacterFrame(asset, alt, options = {}) {
  const loading = options.loading || 'lazy';
  const priority = options.priority ? ' fetchpriority="high"' : '';
  return `
    <span class="character-frame" style="--asset-bg: ${asset.bg}; --asset-line: ${asset.line};">
      <img
        src="${asset.src}"
        alt="${escapeHtml(alt || asset.name)}"
        width="${asset.width}"
        height="${asset.height}"
        loading="${loading}"
        decoding="async"${priority}
      />
    </span>
  `;
}

function formatSeconds(totalSec) {
  const value = Math.max(0, Number(totalSec || 0));
  const minutes = Math.floor(value / 60);
  const seconds = value % 60;
  return `${minutes}分 ${String(seconds).padStart(2, '0')}秒`;
}

async function request(path, options = {}) {
  const response = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...options
  });
  return response.json();
}

function setFieldInvalid(input, invalid) {
  input.classList.toggle('invalid', invalid);
}

function validateRequiredFields(fields) {
  let valid = true;
  fields.forEach((input) => {
    const missing = !input.value.trim();
    setFieldInvalid(input, missing);
    if (missing) {
      valid = false;
    }
  });
  return valid;
}

function clearRegisterErrors() {
  registerError.classList.add('hidden');
  [ticketInput, nicknameInput, passwordInput, passwordConfirmInput].forEach((input) =>
    setFieldInvalid(input, false)
  );
}

function clearLoginErrors() {
  loginError.classList.add('hidden');
  [loginNameInput, loginPasswordInput].forEach((input) => setFieldInvalid(input, false));
}

function renderLogItem(log) {
  const actionName = escapeHtml(log.action_name || '记录');
  const teamName = escapeHtml(TEAM_NAME[log.team] || log.team || '-');
  const scoreDelta =
    typeof log.score_delta === 'number' ? `${log.score_delta > 0 ? '+' : ''}${log.score_delta}` : '-';

  return `
    <div class="log-item">
      <strong>${actionName}</strong>
      <span>${teamName} · 个人 ${scoreDelta}</span>
    </div>
  `;
}

function renderRecentLogs(logs, container, options = {}) {
  if (!logs.length) {
    container.innerHTML = '<div class="log-item">还没有记录。</div>';
    return;
  }

  const collapsedCount = options.collapsedCount ?? COLLAPSED_LOG_VISIBLE_COUNT;
  const visibleLogs = logs.slice(0, collapsedCount);
  const foldedLogs = logs.slice(collapsedCount);

  container.innerHTML = [
    visibleLogs.map(renderLogItem).join(''),
    foldedLogs.length
      ? `
        <details class="log-fold">
          <summary>展开另外 ${foldedLogs.length} 条记录</summary>
          <div class="log-fold-list">
            ${foldedLogs.map(renderLogItem).join('')}
          </div>
        </details>
      `
      : ''
  ].join('');
}

function renderLeaderboard(entries, currentUserId) {
  if (!entries.length) {
    leaderboardList.innerHTML = '<div class="empty-state">暂无排行数据</div>';
    return;
  }

  leaderboardList.innerHTML = entries
    .map(
      (entry, index) => `
        <div class="leaderboard-row ${entry.user_id === currentUserId ? 'current' : ''}">
          <div class="leaderboard-main">
            <span class="rank-badge">#${index + 1}</span>
            <div>
              <strong>${escapeHtml(entry.display_name)}</strong>
              <p class="leaderboard-meta">${escapeHtml(entry.title)}</p>
            </div>
          </div>
          <strong>${entry.score} 分</strong>
        </div>
      `
    )
    .join('');
}

function renderTeams(teamsMap) {
  const teams = Object.values(teamsMap);

  teamBoard.innerHTML = teams
    .map((team) => {
      const meta = TEAM_META[team._id];
      const teamName = escapeHtml(team.name);
      return `
        <article class="team-card compact">
          ${renderCharacterFrame(meta.asset, team.name)}
          <div>
            <p class="eyebrow">领队 ${meta.captain}</p>
            <h3>${teamName}</h3>
            <p>${team.member_count} 人</p>
            <p>${team.total_score} 分</p>
          </div>
        </article>
      `;
    })
    .join('');

  teamPicks.innerHTML = teams
    .map((team) => {
      const meta = TEAM_META[team._id];
      const selectedClass = uiState.selectedTeam === team._id ? 'selected' : '';
      const teamName = escapeHtml(team.name);
      return `
        <article class="team-card ${selectedClass}" data-team="${team._id}">
          ${renderCharacterFrame(meta.asset, team.name, { loading: 'eager', priority: true })}
          <div>
            <p class="eyebrow">领队 ${meta.captain}</p>
            <h3>${teamName}</h3>
            <p>${team.member_count} 人</p>
            <p>${team.total_score} 分</p>
            <button type="button">选择这支队伍</button>
          </div>
        </article>
      `;
    })
    .join('');

  document.querySelectorAll('[data-team]').forEach((node) => {
    node.addEventListener('click', () => {
      uiState.selectedTeam = node.dataset.team;
      renderTeams(teamsMap);
    });
  });
}

function renderHome(current) {
  uiState.current = current;
  renderTeams(current.teams);
  renderLeaderboard(current.leaderboard || [], current.user?._id);

  if (!current.registered) {
    registerView.classList.remove('hidden');
    homeView.classList.add('hidden');
    personalBlock.classList.add('hidden');
    return;
  }

  registerView.classList.add('hidden');
  homeView.classList.remove('hidden');
  personalBlock.classList.remove('hidden');

  document.querySelector('#user-name').textContent = current.user.display_name;
  document.querySelector('#user-team').textContent = `所属：${TEAM_NAME[current.user.team] || current.user.team}`;
  document.querySelector('#user-score').textContent = current.user.score;
  document.querySelector('#user-title').textContent = current.user.title;
  document.querySelector('#user-stamina').textContent =
    current.user.stamina >= current.config.stamina_cap
      ? `${current.user.stamina} / ${current.config.stamina_cap}（已满）`
      : `${current.user.stamina} / ${current.config.stamina_cap} · ${formatSeconds(
          current.user.next_regen_in_sec
        )}后恢复 1 点`;

  actionsGrid.innerHTML = current.available_actions
    .map(
      (action) => `
        <article class="action-card">
          <h3>${escapeHtml(action.name)}</h3>
          <p>${escapeHtml(action.description)}</p>
          <button type="button" data-action="${action._id}">消耗 ${action.stamina_cost} 点体力</button>
        </article>
      `
    )
    .join('');

  document.querySelectorAll('[data-action]').forEach((button) => {
    button.addEventListener('click', async () => {
      const result = await request('/api/action', {
        method: 'POST',
        body: JSON.stringify({
          action_id: button.dataset.action,
          client_request_id: `${Date.now()}-${Math.random().toString(16).slice(2)}`
        })
      });
      if (result.error) {
        alert(result.message);
        return;
      }
      openResultModal(result);
      renderHome(result.state);
    });
  });

  renderRecentLogs(current.recent_logs || [], personalLog);
}

function openResultModal(result) {
  document.querySelector('#modal-title').textContent = result.action_result.action_name;
  document.querySelector('#modal-copy').textContent = result.action_result.text;
  document.querySelector('#modal-score').textContent = `个人积分 ${
    result.action_result.score_delta > 0 ? '+' : ''
  }${result.action_result.score_delta}`;
  document.querySelector('#modal-team').textContent = `队伍积分 ${
    result.action_result.team_delta_self > 0 ? '+' : ''
  }${result.action_result.team_delta_self}`;
  document.querySelector('#modal-stamina').textContent = `体力 ${result.action_result.stamina_before} -> ${result.action_result.stamina_after}`;

  const eventBox = document.querySelector('#event-box');
  if (result.random_event && result.random_event.triggered) {
    const meta = EVENT_META[result.random_event.eventId] || {
      name: '红魔馆住民',
      asset: CHARACTER_ASSETS.remilia
    };
    const eventImage = document.querySelector('#event-image');
    eventImage.src = meta.asset.src;
    eventImage.alt = meta.name;
    eventImage.width = meta.asset.width;
    eventImage.height = meta.asset.height;
    eventImage.parentElement.style.setProperty('--asset-bg', meta.asset.bg);
    eventImage.parentElement.style.setProperty('--asset-line', meta.asset.line);
    document.querySelector('#event-character').textContent = meta.name;
    document.querySelector('#event-title').textContent = result.random_event.name;
    document.querySelector('#event-description').textContent = result.random_event.description;
    document.querySelector('#event-effect').textContent = `事件结算：个人 ${
      result.random_event.scoreDelta > 0 ? '+' : ''
    }${result.random_event.scoreDelta}，队伍${result.random_event.teamDelta > 0 ? '+' : ''}${
      result.random_event.teamDelta
    }`;
    eventBox.classList.remove('hidden');
  } else {
    eventBox.classList.add('hidden');
  }

  resultModal.classList.remove('hidden');
}

registerBtn.addEventListener('click', async () => {
  clearRegisterErrors();
  if (!validateRequiredFields([ticketInput, nicknameInput, passwordInput, passwordConfirmInput])) {
    registerError.textContent = '请填写门票码、昵称、密码和确认密码。';
    registerError.classList.remove('hidden');
    return;
  }
  if (passwordInput.value !== passwordConfirmInput.value) {
    setFieldInvalid(passwordInput, true);
    setFieldInvalid(passwordConfirmInput, true);
    registerError.textContent = '两次输入的密码不一致。';
    registerError.classList.remove('hidden');
    return;
  }
  if (!uiState.selectedTeam) {
    registerError.textContent = '请选择队伍。';
    registerError.classList.remove('hidden');
    return;
  }

  const result = await request('/api/register', {
    method: 'POST',
    body: JSON.stringify({
      code: ticketInput.value.trim(),
      team: uiState.selectedTeam,
      display_name: nicknameInput.value.trim(),
      password: passwordInput.value.trim()
    })
  });
  if (result.error) {
    registerError.textContent = result.message;
    registerError.classList.remove('hidden');
    return;
  }
  renderHome(result.state);
});

loginBtn.addEventListener('click', async () => {
  clearLoginErrors();
  if (!validateRequiredFields([loginNameInput, loginPasswordInput])) {
    loginError.textContent = '请填写昵称和密码。';
    loginError.classList.remove('hidden');
    return;
  }

  const result = await request('/api/login', {
    method: 'POST',
    body: JSON.stringify({
      display_name: loginNameInput.value.trim(),
      password: loginPasswordInput.value.trim()
    })
  });
  if (result.error) {
    loginError.textContent = result.message;
    loginError.classList.remove('hidden');
    return;
  }
  renderHome(result.state);
});

[ticketInput, nicknameInput, passwordInput, passwordConfirmInput].forEach((input) => {
  input.addEventListener('input', () => setFieldInvalid(input, false));
});
[loginNameInput, loginPasswordInput].forEach((input) => {
  input.addEventListener('input', () => setFieldInvalid(input, false));
});

closeModalBtn.addEventListener('click', () => resultModal.classList.add('hidden'));
resultModal.addEventListener('click', (event) => {
  if (event.target === resultModal) {
    resultModal.classList.add('hidden');
  }
});

request('/api/init').then(renderHome);
