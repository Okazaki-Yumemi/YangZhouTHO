const TEAM_CHARACTER_MAP = {
  cirno: {
    name: '琪露诺',
    image: '/assets/images/characters/cirno.png',
    accent: 'team-cirno'
  },
  daiyousei: {
    name: '大妖精',
    image: '/assets/images/characters/daiyousei.png',
    accent: 'team-daiyousei'
  }
};

const RANDOM_EVENT_CHARACTER_MAP = {
  anti_fairy_trap: {
    name: '咲夜',
    image: '/assets/images/characters/sakuya.png'
  },
  seija_reverse: {
    name: '鬼人正邪',
    image: '/assets/images/characters/seija.png'
  },
  scarlet_dining: {
    name: '蕾米莉亚',
    image: '/assets/images/characters/remilia.png'
  },
  marisa_gift: {
    name: '魔理沙',
    image: '/assets/images/characters/marisa.png'
  },
  mystery_tea: {
    name: '帕秋莉',
    image: '/assets/images/characters/patchouli.png'
  },
  meiling_sleep: {
    name: '红美铃',
    image: '/assets/images/characters/meiling.png'
  }
};

function decorateTeams(teams) {
  return teams.map((team) => {
    const character = TEAM_CHARACTER_MAP[team.id] || {};
    return {
      ...team,
      portrait_url: character.image || team.portrait_url,
      character_name: character.name || team.name,
      accent: character.accent || ''
    };
  });
}

function getEventCharacter(eventId) {
  return (
    RANDOM_EVENT_CHARACTER_MAP[eventId] || {
      name: '红魔馆居民',
      image: '/assets/images/characters/remilia.png'
    }
  );
}

module.exports = {
  decorateTeams,
  getEventCharacter
};
