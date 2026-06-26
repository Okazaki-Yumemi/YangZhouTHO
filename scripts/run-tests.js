const assert = require('node:assert/strict');
const {
  calculateCurrentStamina,
  canJoinTeam,
  pickActions,
  resolveActionOutcome,
  resolveRandomEvent,
  swapHundredsAndTens
} = require('../shared/logic');
const { findUserByDisplayName, hashPassword, normalizeDisplayName, verifyPassword } = require('../shared/auth');

function testCalculateCurrentStamina() {
  const result = calculateCurrentStamina(
    {
      stamina: 1,
      last_stamina_at: 0,
      regen_buff_until: 0
    },
    660,
    {
      stamina_cap: 3,
      default_regen_interval_sec: 300,
      buff_regen_interval_sec: 240
    }
  );
  assert.equal(result.stamina, 3);
}

function testJoinRestriction() {
  const outcome = canJoinTeam(
    {
      cirno: { member_count: 20 },
      daiyousei: { member_count: 9 }
    },
    'cirno',
    10
  );
  assert.equal(outcome.allowed, false);
}

function testPickActionsStable() {
  const actions = [
    { _id: 'a', enabled: true, weight: 100 },
    { _id: 'b', enabled: true, weight: 80 },
    { _id: 'c', enabled: true, weight: 70 }
  ];
  const first = pickActions(actions, 'openid_1', 1710000000);
  const second = pickActions(actions, 'openid_1', 1710000020);
  assert.deepEqual(
    first.map((item) => item._id),
    second.map((item) => item._id)
  );
}

function testStealOutcome() {
  const result = resolveActionOutcome(
    {
      _id: 'sabotage',
      type: 'steal',
      description: '偷分',
      params: { amount: 18 }
    },
    () => 0.1,
    {
      user: { regen_buff_until: 0, next_action_bonus: 0 },
      ownTeam: { total_score: 100 },
      opponentTeam: { total_score: 9 },
      nowSec: 0
    }
  );
  assert.equal(result.scoreDelta, 9);
  assert.equal(result.teamDeltaOpponent, -9);
}

function testReverseDigits() {
  assert.equal(swapHundredsAndTens(1234), 1324);
  assert.equal(swapHundredsAndTens(987), 897);
}

function testRandomEventPercentGain() {
  const result = resolveRandomEvent(
    {
      _id: 'marisa_gift',
      name: '魔理沙分礼',
      description: '',
      type: 'score_percent_gain',
      params: { percent: 0.08, max_gain: 120 }
    },
    {
      config: { stamina_cap: 3 },
      user: { score: 1000, stamina: 1, regen_buff_until: 0, next_action_bonus: 0 }
    }
  );
  assert.equal(result.scoreDelta, 80);
}

function testPasswordHashing() {
  const record = hashPassword('secret-pass');
  assert.equal(verifyPassword('secret-pass', record.salt, record.hash), true);
  assert.equal(verifyPassword('wrong-pass', record.salt, record.hash), false);
}

function testDisplayNameLookup() {
  const users = [{ display_name: ' Alice ' }, { display_name: 'Bob' }];
  assert.equal(normalizeDisplayName('  ALICE  '), 'alice');
  assert.deepEqual(findUserByDisplayName(users, 'alice'), users[0]);
  assert.equal(findUserByDisplayName(users, 'charlie'), null);
}

function run() {
  testCalculateCurrentStamina();
  testJoinRestriction();
  testPickActionsStable();
  testStealOutcome();
  testReverseDigits();
  testRandomEventPercentGain();
  testPasswordHashing();
  testDisplayNameLookup();
  console.log('All tests passed');
}

run();
