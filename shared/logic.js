const { TEAM_FULL_HINT, TEAM_IDS } = require('./constants');

function clampMinZero(value) {
  return Math.max(0, Math.floor(value));
}

function getTitleByScore(score, titles) {
  const sortedTitles = [...titles].sort((a, b) => a.min_score - b.min_score);
  let current = sortedTitles[0] || { title: '' };
  for (const item of sortedTitles) {
    if (score >= item.min_score) {
      current = item;
    }
  }
  return current.title;
}

function calculateCurrentStamina(user, nowSec, config) {
  const staminaCap = config.stamina_cap;
  if (user.stamina >= staminaCap) {
    return {
      stamina: staminaCap,
      lastStaminaAt: nowSec
    };
  }

  const interval =
    nowSec < user.regen_buff_until
      ? config.buff_regen_interval_sec
      : config.default_regen_interval_sec;
  const elapsed = Math.max(0, nowSec - user.last_stamina_at);
  const recovered = Math.floor(elapsed / interval);
  const stamina = Math.min(staminaCap, user.stamina + recovered);
  const lastStaminaAt =
    recovered > 0 ? user.last_stamina_at + recovered * interval : user.last_stamina_at;

  return {
    stamina,
    lastStaminaAt: stamina >= staminaCap ? nowSec : lastStaminaAt
  };
}

function canJoinTeam(teamsMap, selectedTeamId, maxDiff) {
  const cirnoCount = teamsMap[TEAM_IDS.CIRNO].member_count;
  const daiyouseiCount = teamsMap[TEAM_IDS.DAIYOUSEI].member_count;
  const nextCirno = selectedTeamId === TEAM_IDS.CIRNO ? cirnoCount + 1 : cirnoCount;
  const nextDaiyousei =
    selectedTeamId === TEAM_IDS.DAIYOUSEI ? daiyouseiCount + 1 : daiyouseiCount;
  const diff = Math.abs(nextCirno - nextDaiyousei);
  const blocked =
    diff > maxDiff &&
    ((selectedTeamId === TEAM_IDS.CIRNO && nextCirno > nextDaiyousei) ||
      (selectedTeamId === TEAM_IDS.DAIYOUSEI && nextDaiyousei > nextCirno));

  return {
    allowed: !blocked,
    team_full_hint: blocked ? TEAM_FULL_HINT : ''
  };
}

function createSeededRandom(seedInput) {
  let seed = 0;
  const str = String(seedInput);
  for (let index = 0; index < str.length; index += 1) {
    seed = (seed * 31 + str.charCodeAt(index)) >>> 0;
  }

  return function next() {
    seed = (1664525 * seed + 1013904223) >>> 0;
    return seed / 0x100000000;
  };
}

function weightedPick(items, randomFn) {
  const enabledItems = items.filter((item) => item.enabled !== false);
  const totalWeight = enabledItems.reduce((sum, item) => sum + (item.weight || 0), 0);
  if (!enabledItems.length || totalWeight <= 0) {
    return null;
  }

  let cursor = randomFn() * totalWeight;
  for (const item of enabledItems) {
    cursor -= item.weight || 0;
    if (cursor <= 0) {
      return item;
    }
  }

  return enabledItems[enabledItems.length - 1];
}

function pickActions(actions, openid, nowSec, count = 3) {
  const random = createSeededRandom(`${openid}:${Math.floor(nowSec / 300)}`);
  const pool = actions.filter((item) => item.enabled);
  const picked = [];
  const usedIds = new Set();

  while (picked.length < Math.min(count, pool.length)) {
    const candidate = weightedPick(pool.filter((item) => !usedIds.has(item._id)), random);
    if (!candidate) {
      break;
    }
    picked.push(candidate);
    usedIds.add(candidate._id);
  }

  return picked;
}

function applyPositiveBonus(delta, bonus) {
  return delta > 0 && bonus > 0 ? Math.floor(delta * (1 + bonus)) : delta;
}

function swapHundredsAndTens(score) {
  if (score < 100) {
    return score;
  }

  const digits = String(score).split('');
  const tensIndex = digits.length - 2;
  const hundredsIndex = digits.length - 3;
  const temp = digits[tensIndex];
  digits[tensIndex] = digits[hundredsIndex];
  digits[hundredsIndex] = temp;
  return Number(digits.join(''));
}

function resolveActionOutcome(action, randomFn, context) {
  const result = {
    text: action.description,
    scoreDelta: 0,
    teamDeltaSelf: 0,
    teamDeltaOpponent: 0,
    staminaDelta: 0,
    regenBuffUntil: context.user.regen_buff_until,
    nextActionBonus: context.user.next_action_bonus || 0
  };

  switch (action.type) {
    case 'fixed_gain': {
      const gain = action.params.gain || 0;
      result.scoreDelta = gain;
      result.teamDeltaSelf = gain;
      break;
    }
    case 'random_outcome': {
      const outcome = weightedPick(
        (action.params.outcomes || []).map((item, index) => ({
          ...item,
          _id: `${action._id}:${index}`,
          enabled: true,
          weight: item.prob
        })),
        randomFn
      );
      if (outcome) {
        result.text = outcome.text || result.text;
        result.scoreDelta = outcome.score_delta || 0;
        result.teamDeltaSelf = outcome.team_delta || 0;
        result.staminaDelta = outcome.stamina_delta || 0;
      }
      break;
    }
    case 'steal': {
      const amount = action.params.amount || 0;
      const stolen = Math.min(amount, context.opponentTeam.total_score);
      result.scoreDelta = stolen;
      result.teamDeltaSelf = stolen;
      result.teamDeltaOpponent = -stolen;
      result.text = action.description;
      break;
    }
    case 'regen_buff': {
      result.scoreDelta = action.params.score_delta || 0;
      result.teamDeltaSelf = action.params.team_delta || 0;
      const duration = action.params.buff_duration_sec || 0;
      const alreadyBuffed =
        action.params.non_stackable && context.nowSec < (context.user.regen_buff_until || 0);
      result.regenBuffUntil = alreadyBuffed
        ? context.user.regen_buff_until
        : context.nowSec + duration;
      break;
    }
    default:
      throw new Error(`Unsupported action type: ${action.type}`);
  }

  return result;
}

function resolveRandomEvent(event, context) {
  const result = {
    triggered: true,
    eventId: event._id,
    name: event.name,
    description: event.description,
    scoreDelta: 0,
    teamDelta: 0,
    staminaAfter: context.user.stamina,
    regenBuffUntil: context.user.regen_buff_until,
    nextActionBonus: context.user.next_action_bonus || 0
  };

  switch (event.type) {
    case 'score_delta': {
      result.scoreDelta = event.params.score_delta || 0;
      result.teamDelta = event.params.team_delta || 0;
      break;
    }
    case 'reverse_digits': {
      const newScore = swapHundredsAndTens(context.user.score);
      result.scoreDelta = newScore - context.user.score;
      result.teamDelta = result.scoreDelta;
      break;
    }
    case 'restore_stamina': {
      if (event.params.restore_to_full) {
        result.staminaAfter = context.config.stamina_cap;
      }
      break;
    }
    case 'score_percent_gain': {
      const percent = event.params.percent || 0;
      const maxGain = event.params.max_gain || Number.MAX_SAFE_INTEGER;
      const gain = Math.min(Math.floor(context.user.score * percent), maxGain);
      result.scoreDelta = gain;
      result.teamDelta = gain;
      break;
    }
    case 'restore_and_penalty': {
      if (event.params.restore_stamina_to_full) {
        result.staminaAfter = context.config.stamina_cap;
      }
      result.scoreDelta = event.params.score_delta || 0;
      result.teamDelta = event.params.team_delta || 0;
      break;
    }
    case 'next_action_bonus': {
      result.nextActionBonus = event.params.bonus || 0;
      break;
    }
    default:
      throw new Error(`Unsupported random event type: ${event.type}`);
  }

  return result;
}

module.exports = {
  applyPositiveBonus,
  calculateCurrentStamina,
  canJoinTeam,
  clampMinZero,
  createSeededRandom,
  getTitleByScore,
  pickActions,
  resolveActionOutcome,
  resolveRandomEvent,
  swapHundredsAndTens,
  weightedPick
};
