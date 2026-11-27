import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Showdown from 'pokemon-showdown';

const { Battle, Dex, TeamValidator } = Showdown;
const root = path.dirname(fileURLToPath(import.meta.url));
const dex = Dex.mod('gen3');
const teamValidator = new TeamValidator('gen3customgame@@@Obtainable Moves');
const smogonSets = JSON.parse(readFileSync(path.join(root, 'DBs', 'gen3.json'), 'utf8'));
const smogonSetsBySpecies = new Map(Object.entries(smogonSets)
  .map(([name, sets]) => [Dex.toID(name), sets]));
const pokeapiIndex = JSON.parse(readFileSync(path.join(root, 'DBs', 'pokeapi.co.json'), 'utf8'));
const pokeapiPokemonUrls = new Map((pokeapiIndex.results || []).flatMap(pokemon => {
  const url = new URL(pokemon.url);
  const match = url.pathname.match(/^\/api\/v2\/pokemon\/(\d+)\/$/);
  return match ? [[Number(match[1]), pokemon.url]] : [];
}));
const randomBattleSets = JSON.parse(readFileSync(
  path.join(root, 'node_modules', 'pokemon-showdown', 'data', 'random-battles', 'gen3', 'sets.json'),
  'utf8',
));
const battles = new Map();
const trainerNames = [
  'Ace Trainer Maya', 'Cooltrainer Reid', 'Veteran Lena', 'Ranger Cole',
  'Poké Maniac Grant', 'Dragon Tamer Iris', 'Expert Nolan', 'Ruin Maniac Tess',
  'Hex Maniac Violet', 'Gentleman Arthur', 'Collector Jun', 'Battle Girl Kira',
  'Psychic Rowan', 'Black Belt Dax', 'Kindler Ember', 'Camper Finn',
];
const learnsetCache = new Map();
const speciesByMoveCache = new Map();
const usableSmogonSetsCache = new Map();
const pokemonCriesCache = new Map();
const MAX_BODY_BYTES = 100_000;

const speciesList = dex.species.all()
  .filter(species => species.exists && species.num > 0 && species.gen <= 3 && !species.isNonstandard)
  .sort((a, b) => a.name.localeCompare(b.name))
  .map(species => ({
    id: species.id,
    name: species.name,
    num: species.num,
    types: species.types,
    abilities: Object.values(species.abilities).filter(id => dex.abilities.get(id).gen <= 3),
    baseStats: species.baseStats,
    tier: species.tier,
  }));
const speciesById = new Map(speciesList.map(species => [species.id, species]));
const fullyEvolvedSpecies = speciesList.filter(species => {
  const speciesData = dex.species.get(species.id);
  return speciesData.tier !== 'NFE' && speciesData.evos.length === 0;
});
const items = dex.items.all()
  .filter(item => item.exists && item.gen <= 3 && !item.isNonstandard)
  .sort((a, b) => a.name.localeCompare(b.name))
  .map(item => ({
    id: item.id,
    name: item.name,
    num: item.num,
    shortDesc: item.shortDesc,
    desc: item.desc,
  }));
const abilities = [...new Set(speciesList.flatMap(species => species.abilities))]
  .map(id => dex.abilities.get(id))
  .filter(ability => ability.exists)
  .sort((a, b) => a.name.localeCompare(b.name))
  .map(ability => ({
    id: ability.id,
    name: ability.name,
    shortDesc: ability.shortDesc,
    desc: ability.desc,
  }));

const moves = dex.moves.all()
  .filter(move => move.exists && move.gen <= 3 && !move.isNonstandard)
  .sort((a, b) => a.name.localeCompare(b.name))
  .map(move => ({
    id: move.id,
    name: move.name,
    type: move.type,
    category: move.category,
    power: move.basePower,
    accuracy: move.accuracy,
    pp: move.pp,
    target: move.target,
    shortDesc: move.shortDesc,
    desc: move.desc,
  }));
const moveById = new Map(moves.map(move => [move.id, move]));
const itemsById = new Map(items.map(item => [item.id, item]));
const natures = dex.natures.all().map(nature => ({
  name: nature.name,
  plus: nature.plus || null,
  minus: nature.minus || null,
}));
const typeNames = dex.types.all().map(type => type.name);
const natureIds = new Set(natures.map(nature => Dex.toID(nature.name)));
const gen3Types = [...new Set(speciesList.flatMap(species => species.types))];
const typeChart = Object.fromEntries(gen3Types.map(attackingType => [
  attackingType,
  Object.fromEntries(gen3Types.map(defendingType => {
    const effectiveness = dex.types.get(defendingType).damageTaken[attackingType];
    return [defendingType, effectiveness === 1 ? 2 : effectiveness === 2 ? 0.5 : effectiveness === 3 ? 0 : 1];
  })),
]));

function sendJson(response, status, body) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  response.end(JSON.stringify(body));
}

async function readJson(request) {
  let body = '';
  for await (const chunk of request) {
    body += chunk;
    if (Buffer.byteLength(body) > MAX_BODY_BYTES) {
      const error = new Error('Request body is too large.');
      error.status = 413;
      throw error;
    }
  }
  try {
    return JSON.parse(body);
  } catch {
    const error = new Error('Request body must be valid JSON.');
    error.status = 400;
    throw error;
  }
}

function getLearnsetMoves(speciesId, level = 50) {
  const species = speciesById.get(speciesId);
  if (!species) return null;
  const cacheKey = `${speciesId}:${level}`;
  if (learnsetCache.has(cacheKey)) return learnsetCache.get(cacheKey);

  const learnset = dex.species.getFullLearnset(speciesId);
  const moveIds = new Set();
  for (const entry of learnset) {
    for (const [moveId, sources] of Object.entries(entry.learnset)) {
      const obtainableAtLevel = sources.some(source => {
        if (Number(source[0]) > 3) return false;
        return source[1] !== 'L' || Number(source.slice(2)) <= level;
      });
      if (obtainableAtLevel && moveById.has(moveId)) {
        moveIds.add(moveId);
      }
    }
  }
  const result = [...moveIds].map(id => moveById.get(id)).sort((a, b) => a.name.localeCompare(b.name));
  learnsetCache.set(cacheKey, result);
  return result;
}

const LITTLE_CUP_ALLOWED_EXCEPTIONS = new Set([
  'Abra',
  'Magnemite',
  'Aipom',
  'Cutiefly',
  'Drifloon',
  'Gligar',
  'Gothita',
  'Meditite',
  'Misdreavus',
  'Murkrow',
  'Porygon',
  'Scyther',
  'Sneasel',
  'Tangela',
  'Trapinch',
  'Vulpix',
  'Wingull',
  'Yanma',
].map(Dex.toID));

function isLittleCupEligible(speciesId) {
  const species = dex.species.get(speciesId);
  if (!species?.exists) return false;
  return species.tier === 'LC' || LITTLE_CUP_ALLOWED_EXCEPTIONS.has(species.id);
}

function validateTeam(team, facility = 'tower') {
  if (!Array.isArray(team) || team.length !== 6) {
    return 'A team must contain exactly six Pokémon.';
  }

  const speciesSeen = new Set();
  for (const [index, set] of team.entries()) {
    const position = index + 1;
    const speciesId = Dex.toID(set?.species);
    if (!speciesById.has(speciesId)) return `Pokémon ${position} is not available in Generation 3.`;
    if (speciesSeen.has(speciesId)) return 'A team cannot use the same species more than once.';
    speciesSeen.add(speciesId);
    if (facility === 'little-cup' && !isLittleCupEligible(speciesId)) {
      return `${speciesById.get(speciesId).name} is not eligible for Little Cup.`;
    }
    const expectedLevel = facility === 'little-cup' ? 5 : 50;
    if (set.level !== expectedLevel) return `Pokémon ${position} must be level ${expectedLevel}.`;
    if (set.name != null && (typeof set.name !== 'string' || set.name.length > 18 || /[|\r\n]/.test(set.name))) {
      return `Pokémon ${position} has an invalid nickname.`;
    }
    if (!natureIds.has(Dex.toID(set.nature))) return `${speciesById.get(speciesId).name} has an invalid nature.`;

    const learnable = new Set(getLearnsetMoves(speciesId, expectedLevel).map(move => move.id));
    if (!Array.isArray(set.moves) || set.moves.length < 1 || set.moves.length > 4) {
      return `Pokémon ${position} needs between one and four moves.`;
    }
    const moveSeen = new Set();
    for (const moveName of set.moves) {
      const moveId = Dex.toID(moveName);
      if (!learnable.has(moveId)) return `${speciesById.get(speciesId).name} cannot learn ${moveName} in Generation 3.`;
      if (moveSeen.has(moveId)) return `${speciesById.get(speciesId).name} cannot use the same move twice.`;
      moveSeen.add(moveId);
    }

    const itemId = Dex.toID(set.item || '');
    if (itemId && !itemsById.has(itemId)) return `${set.item} is not a Generation 3 item.`;
    const speciesData = dex.species.get(speciesId);
    const allowedAbilities = Object.values(speciesData.abilities)
      .filter(id => dex.abilities.get(id).gen <= 3)
      .map(Dex.toID);
    if (!allowedAbilities.includes(Dex.toID(set.ability))) {
      return `${speciesData.name} does not have that Generation 3 ability.`;
    }

    const evTotal = Object.values(set.evs || {}).reduce((total, value) => total + Number(value || 0), 0);
    if (evTotal > 508 || Object.values(set.evs || {}).some(value => !Number.isInteger(value) || value < 0 || value > 255)) {
      return `${speciesData.name} has an invalid EV spread.`;
    }
    const stats = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];
    if (!set.ivs || stats.some(stat => !Number.isInteger(set.ivs[stat]) || set.ivs[stat] < 0 || set.ivs[stat] > 31)) {
      return `${speciesData.name} has invalid IVs.`;
    }
  }
  const validationErrors = teamValidator.validateTeam(team);
  return validationErrors?.[0] || null;
}

function pickRandom(itemsList) {
  return itemsList[Math.floor(Math.random() * itemsList.length)];
}

function createOpponentTeam(facility = 'tower') {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const team = createOpponentTeamAttempt(facility);
    if (!teamValidator.validateTeam(team)) return team;
  }
  throw new Error('Could not generate a legal Generation 3 opponent team.');
}

function createOpponentTeamAttempt(facility = 'tower') {
  const usedSpecies = new Set();
  const usedItems = new Set();
  const pool = facility === 'little-cup'
    ? speciesList.filter(species => dex.species.get(species.id).tier === 'LC')
    : [...fullyEvolvedSpecies];
  const team = [];

  while (team.length < 6) {
    if (!pool.length) throw new Error('Not enough eligible species have usable opponent sets.');
    const speciesIndex = Math.floor(Math.random() * pool.length);
    const [species] = pool.splice(speciesIndex, 1);
    if (usedSpecies.has(species.id)) continue;
    usedSpecies.add(species.id);

    const level = facility === 'little-cup' ? 5 : 50;
    const set = createSmogonSet(species, level) || createRandomBattleSet(species, usedItems, level);
    if (!set) continue;
    set.shiny = Math.random() < 1 / 4096;
    if (set.item) usedItems.add(Dex.toID(set.item));
    team.push(set);
  }
  return team;
}

function chooseOption(value) {
  return Array.isArray(value) ? pickRandom(value) : value;
}

function normalizedMoveId(moveName) {
  const id = Dex.toID(moveName);
  return id.startsWith('hiddenpower') ? 'hiddenpower' : id;
}

function normalizeSetMoves(moveOptions, speciesId, level = 50) {
  if (!Array.isArray(moveOptions)) return null;
  const learnableIds = new Set(getLearnsetMoves(speciesId, level).map(move => move.id));
  const selected = [];
  const selectedIds = new Set();
  for (const moveOption of moveOptions) {
    const options = Array.isArray(moveOption) ? moveOption : [moveOption];
    const usable = options.filter(moveName =>
      typeof moveName === 'string' &&
      learnableIds.has(normalizedMoveId(moveName)) &&
      !selectedIds.has(normalizedMoveId(moveName)),
    );
    if (!usable.length) return null;
    const moveName = pickRandom(usable);
    selected.push(moveName);
    selectedIds.add(normalizedMoveId(moveName));
  }
  return selected.length > 0 && selected.length <= 4 ? selected : null;
}

function normalizeOpponentSet(species, sourceSet, level = 50) {
  const set = {
    name: '',
    species: species.name,
    ability: chooseOption(sourceSet.ability) || species.abilities[0],
    item: chooseOption(sourceSet.item) || '',
    level,
    nature: chooseOption(sourceSet.nature) || 'Serious',
    evs: chooseOption(sourceSet.evs) || {},
    ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31, ...(sourceSet.ivs || {}) },
    moves: normalizeSetMoves(sourceSet.moves, species.id, level),
  };
  if (!set.moves || !set.ivs || Array.isArray(set.ivs)) return null;
  if (Object.values(set.evs).some(value => !Number.isInteger(value) || value < 0 || value > 255) ||
    Object.values(set.evs).reduce((total, value) => total + value, 0) > 508) return null;
  if (teamValidator.validateTeam([set])) return null;
  return set;
}

function getSmogonSetOptions(species) {
  const speciesSets = smogonSetsBySpecies.get(species.id);
  if (!speciesSets || typeof speciesSets !== 'object') return [];
  return Object.values(speciesSets)
    .filter(tierSets => tierSets && typeof tierSets === 'object')
    .flatMap(tierSets => Object.values(tierSets))
    .filter(set => set && typeof set === 'object' && Array.isArray(set.moves));
}

function createSmogonSet(species, level = 50) {
  const cacheKey = `${species.id}:${level}`;
  if (!usableSmogonSetsCache.has(cacheKey)) {
    const usableSets = getSmogonSetOptions(species)
      .map(set => normalizeOpponentSet(species, set, level))
      .filter(Boolean);
    usableSmogonSetsCache.set(cacheKey, usableSets);
  }
  const usableSets = usableSmogonSetsCache.get(cacheKey);
  return usableSets.length ? pickRandom(usableSets) : null;
}

function createRandomBattleSet(species, usedItems, level = 50) {
  const randomSpecies = randomBattleSets[species.id];
  const learnableIds = new Set(getLearnsetMoves(species.id, level).map(move => move.id));
  const options = (randomSpecies?.sets || [])
    .map(randomSet => {
      const moves = [...new Set((randomSet.movepool || [])
        .filter(moveId => learnableIds.has(normalizedMoveId(moveId)))
        .map(moveId => dex.moves.get(moveId))
        .filter(move => move.exists)
        .map(move => move.name))];
      if (!moves.length) return null;
      const selectedMoves = [];
      while (selectedMoves.length < Math.min(4, moves.length)) {
        const move = pickRandom(moves.filter(candidate => !selectedMoves.includes(candidate)));
        selectedMoves.push(move);
      }
      const availableItems = items.filter(item => !usedItems.has(item.id));
      const item = pickRandom(availableItems.length ? availableItems : items);
      const set = {
        name: '',
        species: species.name,
        ability: chooseOption(randomSet.abilities) || species.abilities[0],
        item: item?.name || '',
        level,
        nature: 'Serious',
        evs: { hp: 84, atk: 84, def: 84, spa: 84, spd: 84, spe: 84 },
        ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 },
        moves: selectedMoves,
      };
      return teamValidator.validateTeam([set]) ? null : set;
    })
    .filter(Boolean);
  return options.length ? pickRandom(options) : null;
}

function pokemonSummary(pokemon, { revealMoves = false, slot = 0, hidden = false } = {}) {
  if (hidden) return { slot, revealed: false };
  const summary = {
    slot,
    revealed: true,
    name: pokemon.name,
    species: pokemon.species.name,
    level: pokemon.level,
    num: pokemon.species.num,
    types: pokemon.species.types,
    hp: pokemon.hp,
    maxhp: pokemon.maxhp,
    status: pokemon.status,
    fainted: pokemon.fainted,
    shiny: Boolean(pokemon.shiny),
    active: pokemon.isActive,
    boosts: { ...pokemon.boosts },
    volatiles: {
      leechseed: Boolean(pokemon.volatiles.leechseed),
      endure: Boolean(pokemon.volatiles.endure),
    },
  };
  if (revealMoves === true) {
    const nature = pokemon.set.nature || 'Serious';
    Object.assign(summary, {
      item: pokemon.item || '',
      ability: pokemon.ability,
      nature,
      stats: Object.fromEntries(['hp', 'atk', 'def', 'spa', 'spd', 'spe'].map(stat => [
        stat,
        stat === 'hp' ? pokemon.maxhp : pokemon.getStat(stat),
      ])),
    });
  }
  if (revealMoves) {
    summary.moves = pokemon.moveSlots
      .filter(move => revealMoves === 'used' ? move.used : true)
      .map(move => ({
        id: move.id,
        name: move.move,
        pp: move.pp,
        maxpp: move.maxpp,
      }));
  }
  return summary;
}

function getSideHazards(side) {
  const hazards = {
    spikes: 'Spikes',
    stealthrock: 'Stealth Rock',
    toxicspikes: 'Toxic Spikes',
    stickyweb: 'Sticky Web',
  };
  return Object.entries(hazards)
    .filter(([id]) => side.sideConditions[id])
    .map(([id, name]) => ({
      id,
      name,
      layers: Math.max(1, Number(side.sideConditions[id].layers) || 1),
    }));
}

function getSideScreens(side) {
  const screens = {
    reflect: 'Reflect',
    lightscreen: 'Light Screen',
  };
  return Object.entries(screens)
    .filter(([id]) => side.sideConditions[id])
    .map(([id, name]) => ({
      id,
      name,
      turns: Number.isFinite(side.sideConditions[id].duration)
        ? side.sideConditions[id].duration
        : null,
    }));
}

function getFieldState(battle) {
  const weatherState = battle.field.weatherState;
  const trickRoom = battle.field.pseudoWeather.trickroom;
  return {
    weather: battle.field.weather || '',
    weatherTurns: weatherState?.duration ?? null,
    trickRoom: Boolean(trickRoom),
    trickRoomTurns: trickRoom?.duration ?? null,
    hazards: {
      player: getSideHazards(battle.p1),
      opponent: getSideHazards(battle.p2),
    },
    screens: {
      player: getSideScreens(battle.p1),
      opponent: getSideScreens(battle.p2),
    },
  };
}

function availableActions(side) {
  const request = side.activeRequest;
  if (!request || request.wait) return { kind: 'waiting' };
  if (request.forceSwitch?.some(Boolean)) {
    return {
      kind: 'switch',
      options: request.side.pokemon
        .map((pokemon, index) => ({ pokemon, index }))
        .filter(({ pokemon, index }) => !pokemon.active && !pokemon.condition.includes('fnt'))
        .map(({ pokemon, index }) => ({ index: index + 1, name: pokemon.ident.split(': ').pop(), num: side.pokemon[index].species.num })),
    };
  }
  return {
    kind: 'move',
    moves: request.active?.[0]?.moves?.map((move, index) => ({
      index: index + 1,
      name: move.move,
      id: move.id,
      disabled: Boolean(move.disabled),
      pp: move.pp,
    })) || [],
    switches: side.pokemon
      .map((pokemon, index) => ({ pokemon, index }))
      .filter(({ pokemon }) => !pokemon.isActive && !pokemon.fainted)
      .map(({ pokemon, index }) => ({ index: index + 1, name: pokemon.name, num: pokemon.species.num, hp: pokemon.hp, maxhp: pokemon.maxhp })),
  };
}

function battleState(entry) {
  const { battle } = entry;
  for (const [index, pokemon] of battle.p2.pokemon.entries()) {
    if (pokemon.isActive || pokemon.fainted || pokemon.hp < pokemon.maxhp || pokemon.status) {
      entry.revealedOpponentSlots.add(index);
    }
  }
  return {
    id: entry.id,
    turn: battle.turn,
    field: getFieldState(battle),
    ended: battle.ended,
    winner: battle.winner || null,
    log: battle.log.slice(entry.lastLogPosition),
    player: {
      name: battle.p1.name,
      team: battle.p1.pokemon.map((pokemon, index) => pokemonSummary(pokemon, {
        revealMoves: true,
        slot: index,
      })),
      actions: availableActions(battle.p1),
    },
    opponent: {
      name: battle.p2.name,
      team: battle.p2.pokemon.map((pokemon, index) => pokemonSummary(pokemon, {
        revealMoves: 'used',
        slot: index,
        hidden: !entry.revealedOpponentSlots.has(index),
      })),
    },
  };
}

function estimateDamage(battle, source, target, moveId) {
  const savedSeed = battle.prng.getSeed();
  const savedTarget = battle.activeTarget;
  let total = 0;
  let samples = 0;
  try {
    battle.activeTarget = target;
    for (let sample = 0; sample < 5; sample += 1) {
      const damage = battle.actions.getDamage(source, target, moveId, true);
      if (typeof damage === 'number') {
        total += damage;
        samples += 1;
      }
    }
  } finally {
    battle.prng.setSeed(savedSeed);
    battle.activeTarget = savedTarget;
  }
  return samples ? total / samples : 0;
}

function scoreStatChanges(boosts, pokemon) {
  if (!boosts) return 0;
  const weights = { atk: 10, spa: 10, spe: 11, def: 8, spd: 8, accuracy: 4, evasion: 5 };
  let score = 0;
  for (const [stat, change] of Object.entries(boosts)) {
    const current = pokemon.boosts[stat] || 0;
    const stages = change > 0
      ? Math.min(change, 6 - current)
      : Math.min(-change, 6 + current);
    score += stages * (weights[stat] || 6);
  }
  return score;
}

function weatherAffinity(side, weather, revealedOnly = false) {
  let score = 0;
  const team = side.pokemon.filter(pokemon =>
    !pokemon.fainted && (!revealedOnly || pokemon.isActive),
  );
  for (const pokemon of team) {
    if (pokemon.fainted) continue;
    const ability = pokemon.ability;
    if (!revealedOnly && weather === 'raindance') {
      if (['swiftswim', 'raindish', 'hydration'].includes(ability)) score += 9;
    } else if (!revealedOnly && weather === 'sunnyday') {
      if (['chlorophyll', 'forecast'].includes(ability)) score += 9;
    } else if (!revealedOnly && weather === 'sandstorm') {
      if (['sandveil'].includes(ability)) score += 5;
    }
    if (weather === 'sandstorm' && pokemon.hasType('Rock')) score += 3;

    for (const move of pokemon.moveSlots) {
      if (revealedOnly && !move.used) continue;
      const moveData = dex.moves.get(move.id);
      if (weather === 'raindance') {
        if (moveData.type === 'Water' && moveData.category !== 'Status') score += 2;
        if (moveData.type === 'Fire' && moveData.category !== 'Status') score -= 2;
      } else if (weather === 'sunnyday') {
        if (moveData.type === 'Fire' && moveData.category !== 'Status') score += 2;
        if (moveData.type === 'Water' && moveData.category !== 'Status') score -= 2;
      }
    }
  }
  return score;
}

function weatherMoveUtility(battle, source, moveData) {
  const weather = Dex.toID(moveData.weather);
  if (!weather || battle.field.weather === weather) return 0;
  const ownAffinity = weatherAffinity(source.side, weather);
  const opposingAffinity = weatherAffinity(source.side.foe, weather, true);
  return Math.max(-18, Math.min(24, ownAffinity - opposingAffinity + 4));
}

function hazardMoveUtility(battle, source, target, moveData) {
  if (!moveData.sideCondition) return 0;
  const hazard = ['spikes', 'stealthrock', 'toxicspikes', 'stickyweb'].includes(moveData.sideCondition);
  const side = hazard ? target.side : source.side;
  if (side.sideConditions[moveData.sideCondition]) return 0;
  if (!hazard) return 12;

  const eligible = target.side.pokemon.filter(pokemon =>
    !pokemon.fainted && !pokemon.hasType('Flying') && !pokemon.hasAbility('levitate'),
  ).length;
  if (!eligible) return 0;
  const existingLayers = Number(side.sideConditions[moveData.sideCondition]?.layers) || 0;
  return Math.min(24, 8 + eligible * 2 - existingLayers * 3);
}

function focusPunchUtility(battle, source, target, moveData) {
  if (source.volatiles.substitute || target.volatiles.mustrecharge) return 26;
  const focusPriority = moveData.priority || 0;
  const canInterrupt = target.moveSlots.some(move => {
    if (move.pp <= 0) return false;
    const candidate = dex.moves.get(move.id);
    if (!candidate.exists || candidate.category === 'Status' || candidate.basePower <= 0) return false;
    const actsFirst = candidate.priority > focusPriority ||
      (candidate.priority === focusPriority && target.getStat('spe') >= source.getStat('spe'));
    return actsFirst && estimateDamage(battle, target, source, move.id) > 0;
  });
  return canInterrupt ? -220 : 24;
}

function moveUtility(battle, source, target, moveData) {
  let score = 0;
  const selfBoosts = moveData.self?.boosts;
  const selfBoostUtility = scoreStatChanges(selfBoosts, source);
  // Stat boosts on the opponent are harmful to the trainer and should make
  // debuff moves attractive, rather than rewarding the opponent's boost.
  score -= scoreStatChanges(moveData.boosts, target);
  score += selfBoostUtility;
  if (battle.turn <= 2 && selfBoostUtility > 0 && source.hp / source.maxhp > 0.55) score += 10;
  if (selfBoostUtility > 0 && source.hp / source.maxhp < 0.3) score -= 18;

  const heal = moveData.heal || moveData.self?.heal;
  if (heal && source.hp < source.maxhp) {
    const missingHealth = 1 - source.hp / source.maxhp;
    score += Math.min(36, missingHealth * (heal[0] / heal[1]) * source.maxhp * 0.8);
  }

  const status = moveData.status || moveData.self?.status;
  const selfInflictedStatus = Boolean(moveData.self?.status);
  const statusTarget = selfInflictedStatus ? source : target;
  if (status && !selfInflictedStatus && !statusTarget.status &&
    statusTarget.runStatusImmunity(status, false)) {
    score += ({ slp: 30, frz: 30, par: 26, tox: 24, brn: 20, psn: 17 })[status] || 15;
  }

  const volatileStatus = moveData.volatileStatus;
  const volatileTarget = moveData.target === 'self' ? source : target;
  if (volatileStatus && !volatileTarget.volatiles[volatileStatus]) score += 16;
  if (moveData.id === 'focuspunch') score += focusPunchUtility(battle, source, target, moveData);

  score += hazardMoveUtility(battle, source, target, moveData);
  if (moveData.weather) score += weatherMoveUtility(battle, source, moveData);
  if (moveData.forceSwitch) {
    score += 8 + Object.values(target.boosts).filter(boost => boost > 0).length * 3;
  }
  if (moveData.stallingMove) {
    score -= source.volatiles.stall ? 24 : 4;
    if (source.item === 'leftovers' && source.hp < source.maxhp) score += 5;
  }

  return score;
}

function scoreOpponentMove(battle, source, target, move) {
  const moveData = dex.moves.get(move.id);
  if (!moveData.exists) return { index: move.index, score: 0 };

  const accuracy = moveData.accuracy === true
    ? 1
    : Number.isFinite(moveData.accuracy) ? Math.max(0, moveData.accuracy) / 100 : 1;
  const damage = estimateDamage(battle, source, target, move.id);
  const utility = moveUtility(battle, source, target, moveData);
  const expectedDamage = damage * accuracy;
  let score = expectedDamage + utility;
  if (damage >= target.hp && damage > 0) score += 32;
  else if (damage >= target.hp * 0.75) score += 12;
  if (moveData.selfdestruct && damage < target.hp) score -= 40;
  if (moveData.priority > 0) {
    const targetThreat = estimateIncomingThreat(battle, target, source);
    score += moveData.priority * (targetThreat >= source.hp ? 10 : 2);
  }
  if (moveData.recoil && damage > 0) {
    const recoilFraction = Array.isArray(moveData.recoil) ? moveData.recoil[0] / moveData.recoil[1] : 0.25;
    if (source.hp <= damage * recoilFraction + 1 && damage < target.hp) score -= 28;
  }
  const secondaries = moveData.secondaries || (moveData.secondary ? [moveData.secondary] : []);
  if (moveData.category !== 'Status' && !target.status) {
    for (const secondary of secondaries) {
      if (!secondary.status || !target.runStatusImmunity(secondary.status, false)) continue;
      score += (({ slp: 30, frz: 30, par: 26, tox: 24, brn: 20, psn: 17 })[secondary.status] || 15) *
        (secondary.chance || 100) / 100 * accuracy;
    }
  }
  return { index: move.index, score };
}

function bestMoveScore(battle, source, target) {
  const moves = source.moveSlots
    .filter(move => move.pp > 0)
    .map((move, index) => ({ id: move.id, index }));
  if (!moves.length) return 0;
  return Math.max(...moves.map(move => scoreOpponentMove(battle, source, target, move).score));
}

function estimateStabThreat(attacker, defender) {
  const attack = attacker.species.baseStats.atk * stageMultiplier(attacker.boosts.atk);
  const specialAttack = attacker.species.baseStats.spa * stageMultiplier(attacker.boosts.spa);
  const attackerStat = Math.max(attack, specialAttack);
  const defenseStat = attack >= specialAttack
    ? defender.species.baseStats.def * stageMultiplier(defender.boosts.def)
    : defender.species.baseStats.spd * stageMultiplier(defender.boosts.spd);
  const statRatio = Math.max(0.65, Math.min(1.35, attackerStat / Math.max(1, defenseStat)));
  const stabThreats = attacker.species.types.map(type => {
    let effectiveness = 1;
    for (const targetType of defender.species.types) {
      const code = dex.types.get(targetType).damageTaken[type];
      if (code === 1) effectiveness *= 2;
      if (code === 2) effectiveness *= 0.5;
      if (code === 3) return 0;
    }
    if (type === 'Ground' && defender.hasAbility('levitate')) return 0;
    return defender.maxhp * 0.2 * 1.5 * effectiveness * statRatio;
  });
  return Math.max(...stabThreats, 0);
}

function stageMultiplier(stage = 0) {
  return stage >= 0 ? (2 + stage) / 2 : 2 / (2 - stage);
}

function estimateIncomingThreat(battle, attacker, defender) {
  const threats = attacker.moveSlots
    // The Tower trainer is allowed to inspect the player's submitted set. Include
    // unrevealed moves here so switch and survival decisions account for the
    // strongest legal attack the player can actually bring.
    .filter(move => move.pp > 0)
    .map(move => {
      const data = dex.moves.get(move.id);
      if (!data.exists || data.category === 'Status' || !data.basePower) return 0;
      const accuracy = data.accuracy === true
        ? 1
        : Number.isFinite(data.accuracy) ? Math.max(0, data.accuracy) / 100 : 1;
      return estimateDamage(battle, attacker, defender, move.id) * accuracy;
    })
    .filter(damage => damage > 0)
    .sort((a, b) => b - a);
  const observedThreat = threats.length > 1
    ? threats[0] * 0.8 + threats[1] * 0.2
    : threats[0] || 0;
  return Math.max(observedThreat, estimateStabThreat(attacker, defender));
}

function switchHazardDamage(side, pokemon) {
  const spikes = side.sideConditions.spikes;
  if (!spikes || pokemon.hasType('Flying') || pokemon.hasAbility('levitate')) return 0;
  const layers = Number(spikes.layers) || 1;
  const fraction = layers >= 3 ? 0.25 : layers === 2 ? 1 / 6 : 1 / 8;
  return Math.floor(pokemon.maxhp * fraction);
}

function switchEntryBonus(source, target, knownThreat) {
  let score = 0;
  if (source.ability === 'intimidate' && knownThreat > 0) {
    const physicalMoves = target.moveSlots.filter(move => {
      if (!move.used || move.pp <= 0) return false;
      return dex.moves.get(move.id).category === 'Physical';
    });
    if (physicalMoves.length) score += 10;
  }
  return score;
}

function chooseForcedSwitch(battle) {
  const opponentSide = battle.p2;
  const target = battle.p1.active[0];
  const candidates = opponentSide.pokemon
    .map((pokemon, index) => ({ pokemon, index }))
    .filter(({ pokemon }) => !pokemon.isActive && !pokemon.fainted);
  if (!candidates.length) throw new Error('Opponent has no available Pokémon to switch in.');
  if (!target) return candidates[0].index + 1;

  const scored = candidates.map(candidate => {
    const offense = bestMoveScore(battle, candidate.pokemon, target);
    const incoming = estimateIncomingThreat(battle, target, candidate.pokemon);
    const hazardDamage = switchHazardDamage(opponentSide, candidate.pokemon);
    const health = candidate.pokemon.hp / Math.max(1, candidate.pokemon.maxhp);
    const entryBonus = switchEntryBonus(candidate.pokemon, target, incoming);
    const likelyKnockoutPenalty = incoming >= candidate.pokemon.hp
      ? 70
      : incoming >= candidate.pokemon.hp * 0.65 ? 26 : 0;
    return {
      index: candidate.index + 1,
      score: offense * 0.75 - incoming * 0.8 - likelyKnockoutPenalty -
        hazardDamage + health * 14 + entryBonus,
    };
  });
  const bestScore = Math.max(...scored.map(candidate => candidate.score));
  return pickRandom(scored.filter(candidate => candidate.score >= bestScore - 1)).index;
}

function chooseStrategicSwitch(entry, request, current, target, bestMove) {
  const battle = entry.battle;
  if (request.active?.[0]?.trapped || !target) return null;

  const currentRisk = estimateIncomingThreat(battle, target, current);
  const currentPosition = bestMove.score - (currentRisk || 0) * 0.55;
  const imminentKnockout = currentRisk !== null && currentRisk >= current.hp * 0.82;
  const switchedLastTurn = entry.lastStrategicSwitchTurn === battle.turn - 1;
  const candidates = battle.p2.pokemon
    .map((pokemon, index) => ({ pokemon, index }))
    .filter(({ pokemon }) => !pokemon.isActive && !pokemon.fainted)
    .map(({ pokemon, index }) => {
      // Evaluate each candidate against every move in the player's known set,
      // including moves the player has not revealed in battle yet.
      const risk = estimateIncomingThreat(battle, target, pokemon);
      const offense = bestMoveScore(battle, pokemon, target);
      const hazardDamage = switchHazardDamage(battle.p2, pokemon);
      const naturalCureBonus = current.ability === 'naturalcure' && current.status ? 7 : 0;
      const entryBonus = switchEntryBonus(pokemon, target, risk || 0) + naturalCureBonus;
      const position = offense - (risk || 0) * 0.55 - hazardDamage + entryBonus;
      const savesFromKnockout = imminentKnockout && risk !== null &&
        risk < pokemon.hp * 0.65 && offense >= bestMove.score * 0.45;
      return { index: index + 1, risk, offense, position, savesFromKnockout };
    })
    .filter(candidate => candidate.savesFromKnockout ||
      (!switchedLastTurn && candidate.position >= currentPosition + 22));
  if (!candidates.length) return null;

  const best = Math.max(...candidates.map(candidate =>
    candidate.position + (candidate.savesFromKnockout ? 40 : 0),
  ));
  return pickRandom(candidates.filter(candidate =>
    candidate.position + (candidate.savesFromKnockout ? 40 : 0) >= best - 1,
  )).index;
}

function chooseOpponentAction(entry) {
  const battle = entry.battle;
  const side = battle.p2;
  const request = side.activeRequest;
  if (!request || request.wait) return;

  if (request.forceSwitch?.some(Boolean)) {
    const switchIndex = chooseForcedSwitch(battle);
    if (!battle.choose('p2', `switch ${switchIndex}`)) {
      throw new Error('Opponent could not make its required legal switch.');
    }
    return;
  }

  const choices = request.active?.[0]?.moves || [];
  const validMoves = choices
    .map((move, index) => ({ move, index, id: move.id }))
    .filter(({ move }) => !move.disabled && move.pp !== 0);
  if (!validMoves.length) throw new Error('Opponent has no legal move available in its battle request.');

  const active = side.active[0];
  const target = battle.p1.active[0];
  const scoredMoves = target
    ? validMoves.map(({ move, index, id }) => scoreOpponentMove(battle, active, target, { ...move, id, index }))
    : validMoves.map(({ index }) => ({ index, score: 0 }));
  const highestScore = Math.max(...scoredMoves.map(candidate => candidate.score));
  const bestMove = pickRandom(scoredMoves.filter(candidate => candidate.score >= highestScore - 1));
  const switchIndex = chooseStrategicSwitch(entry, request, active, target, bestMove);
  if (switchIndex !== null) {
    if (!battle.choose('p2', `switch ${switchIndex}`)) {
      throw new Error('Opponent could not make its selected legal switch.');
    }
    entry.lastStrategicSwitchTurn = battle.turn;
    return;
  }
  if (!battle.choose('p2', `move ${bestMove.index + 1}`)) {
    throw new Error('Opponent could not select its chosen legal move.');
  }
}

function settleOpponentChoices(entry) {
  const battle = entry.battle;
  let choicesMade = 0;
  while (!battle.ended && choicesMade < 12) {
    const request = battle.p2.activeRequest;
    if (!request || request.wait) return;
    if (choicesMade > 0 && battle.p1.activeRequest && !battle.p1.activeRequest.wait) return;
    chooseOpponentAction(entry);
    choicesMade += 1;
  }
  if (!battle.ended && battle.p1.activeRequest?.wait && battle.p2.activeRequest && !battle.p2.activeRequest.wait) {
    throw new Error('Opponent could not resolve its pending battle choices.');
  }
}

async function handleApi(request, response, url) {
  if (request.method === 'GET' && url.pathname === '/api/dex') {
    sendJson(response, 200, { species: speciesList, items, abilities, moves, natures, types: gen3Types, typeChart });
    return;
  }

  if (request.method === 'GET' && url.pathname === '/api/cries') {
    const pokemonNumber = Number(url.searchParams.get('pokemon'));
    if (!Number.isInteger(pokemonNumber) || pokemonNumber < 1 || pokemonNumber > 386) {
      sendJson(response, 404, { error: 'No PokéAPI record exists for this Pokémon.' });
      return;
    }
    const pokemonUrl = pokeapiPokemonUrls.get(pokemonNumber) ||
      `https://pokeapi.co/api/v2/pokemon/${pokemonNumber}/`;

    if (!pokemonCriesCache.has(pokemonNumber)) {
      const cryPromise = (async () => {
        let detailResponse;
        try {
          detailResponse = await fetch(pokemonUrl, {
            headers: { Accept: 'application/json' },
            redirect: 'error',
            signal: AbortSignal.timeout(8_000),
          });
        } catch {
          const error = new Error('PokéAPI could not be reached to load this Pokémon’s cry.');
          error.status = 502;
          throw error;
        }
        if (!detailResponse.ok) {
          const error = new Error(`PokéAPI returned ${detailResponse.status} for this Pokémon.`);
          error.status = 502;
          throw error;
        }

        const detail = await detailResponse.json();
        const cries = {};
        for (const variant of ['latest', 'legacy']) {
          const source = detail.cries?.[variant];
          if (!source) continue;
          const audioUrl = new URL(source);
          if (
            audioUrl.protocol !== 'https:' ||
            audioUrl.hostname !== 'raw.githubusercontent.com' ||
            !/^\/PokeAPI\/cries\/[^/]+\/cries\/pokemon\/(?:latest|legacy)\/\d+\.ogg$/.test(audioUrl.pathname)
          ) {
            throw new Error(`PokéAPI returned an unsupported ${variant} cry URL.`);
          }
          cries[variant] = audioUrl.href;
        }
        return cries;
      })();
      pokemonCriesCache.set(pokemonNumber, cryPromise);
    }

    try {
      const cries = await pokemonCriesCache.get(pokemonNumber);
      sendJson(response, 200, { cries });
    } catch (error) {
      pokemonCriesCache.delete(pokemonNumber);
      sendJson(response, error.status || 502, { error: error.message || 'PokéAPI returned invalid cry data.' });
    }
    return;
  }

  if (request.method === 'GET' && url.pathname === '/api/learnset') {
    const speciesId = Dex.toID(url.searchParams.get('species') || '');
    const level = Number(url.searchParams.get('level')) === 5 ? 5 : 50;
    const learnableMoves = getLearnsetMoves(speciesId, level);
    if (!learnableMoves) {
      sendJson(response, 404, { error: 'Choose a Generation 3 Pokémon first.' });
      return;
    }
    sendJson(response, 200, { moves: learnableMoves });
    return;
  }

  if (request.method === 'GET' && url.pathname === '/api/species-filter') {
    const moveId = Dex.toID(url.searchParams.get('move') || '');
    if (!moveId) {
      sendJson(response, 200, { speciesIds: speciesList.map(species => species.id) });
      return;
    }
    if (!moveById.has(moveId)) {
      sendJson(response, 400, { error: 'Choose a Generation 3 move.' });
      return;
    }
    if (!speciesByMoveCache.has(moveId)) {
      const matchingSpecies = speciesList
        .filter(species => getLearnsetMoves(species.id)?.some(move => move.id === moveId))
        .map(species => species.id);
      speciesByMoveCache.set(moveId, matchingSpecies);
    }
    sendJson(response, 200, { speciesIds: speciesByMoveCache.get(moveId) });
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/battles') {
    const payload = await readJson(request);
    const facility = ['little-cup', 'randoms'].includes(payload?.facility) ? payload.facility : 'tower';
    const generatedRandoms = facility === 'randoms';
    const playerTeam = generatedRandoms ? createOpponentTeam('tower') : payload?.team;
    const problem = validateTeam(playerTeam, facility === 'little-cup' ? 'little-cup' : 'tower');
    if (problem) {
      sendJson(response, 400, { error: problem });
      return;
    }

    const id = randomUUID();
    const opponentTeam = createOpponentTeam(facility);
    const trainerName = pickRandom(trainerNames);
    const battle = new Battle({
      formatid: 'gen3customgame',
      p1: { name: 'You', team: playerTeam },
      p2: { name: trainerName, team: opponentTeam },
    });
    const entry = {
      id,
      battle,
      lastLogPosition: 0,
      revealedOpponentSlots: new Set(),
      lastStrategicSwitchTurn: null,
    };
    battles.set(id, entry);
    sendJson(response, 201, battleState(entry));
    entry.lastLogPosition = battle.log.length;
    return;
  }

  const match = url.pathname.match(/^\/api\/battles\/([a-f0-9-]+)$/);
  if (request.method === 'POST' && match) {
    const entry = battles.get(match[1]);
    if (!entry) {
      sendJson(response, 404, { error: 'This battle has expired. Start a new battle.' });
      return;
    }
    const payload = await readJson(request);
    if (entry.battle.ended) {
      sendJson(response, 409, { error: 'This battle is already over.' });
      return;
    }
    const choice = payload?.choice;
    if (typeof choice !== 'string' || choice.length > 40 || !/^(move [1-4]|switch [1-6])$/.test(choice)) {
      sendJson(response, 400, { error: 'Choose one of the available moves or Pokémon.' });
      return;
    }

    const accepted = entry.battle.choose('p1', choice);
    if (!accepted) {
      const reason = entry.battle.p1.choice.error || 'That action is not available.';
      entry.battle.p1.clearChoice();
      sendJson(response, 400, { error: reason });
      return;
    }
    settleOpponentChoices(entry);
    const state = battleState(entry);
    entry.lastLogPosition = entry.battle.log.length;
    sendJson(response, 200, state);
    return;
  }

  sendJson(response, 404, { error: 'API route not found.' });
}

const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.md': 'text/markdown; charset=utf-8',
};

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://localhost');
    if (url.pathname.startsWith('/api/')) {
      await handleApi(request, response, url);
      return;
    }

    const audioMatch = url.pathname.match(/^\/audio\/([a-z0-9][a-z0-9.-]*\.(?:ogg|wav))$/i);
    if (audioMatch) {
      const filename = audioMatch[1];
      const contents = await readFile(path.join(root, 'public', 'audio', filename));
      response.writeHead(200, {
        'Content-Type': contentTypes[path.extname(filename).toLowerCase()],
        'Cache-Control': 'public, max-age=31536000, immutable',
        'X-Content-Type-Options': 'nosniff',
      });
      response.end(contents);
      return;
    }

    const cryMatch = url.pathname.match(/^\/audio\/cries\/(\d+)\.ogg$/);
    const spriteMatch = url.pathname.match(/^\/sprites\/gen5\/(front|back)-(\d+)\.png$/);
    const animatedSpriteMatch = url.pathname.match(/^\/sprites\/gen5\/(gen5ani(?:-back)?(?:-shiny)?)\/([a-z0-9-]+)\.gif$/i);
    if (cryMatch || spriteMatch || animatedSpriteMatch) {
      const relativePath = cryMatch
        ? path.join('audio', 'cries', `${cryMatch[1]}.ogg`)
        : spriteMatch
          ? path.join('sprites', 'gen5', `${spriteMatch[1]}-${spriteMatch[2]}.png`)
          : path.join('sprites', 'gen5', animatedSpriteMatch[1], `${animatedSpriteMatch[2]}.gif`);
      const contents = await readFile(path.join(root, 'public', relativePath));
      const extension = path.extname(relativePath);
      response.writeHead(200, {
        'Content-Type': contentTypes[extension],
        'Cache-Control': 'public, max-age=31536000, immutable',
        'X-Content-Type-Options': 'nosniff',
      });
      response.end(contents);
      return;
    }

    const publicRoot = path.resolve(root, 'public');
    const requestedPath = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
    const filename = path.resolve(publicRoot, `.${requestedPath}`);
    const relativePath = path.relative(publicRoot, filename);
    if (!relativePath || relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
      response.writeHead(404);
      response.end('Not found');
      return;
    }
    const contents = await readFile(filename);
    const mutablePageAsset = ['index.html', 'app.js', 'styles.css', 'showdown-animations.js'].includes(relativePath.replaceAll(path.sep, '/'));
    response.writeHead(200, {
      'Content-Type': contentTypes[path.extname(filename)],
      'Cache-Control': mutablePageAsset ? 'no-store' : 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
    });
    response.end(contents);
  } catch (error) {
    if (response.headersSent) {
      response.destroy(error);
      return;
    }
    if (error.code === 'ENOENT') {
      response.writeHead(404);
      response.end('Not found');
      return;
    }
    const status = error.status || 500;
    sendJson(response, status, { error: status === 500 ? 'The simulator could not complete that request.' : error.message });
    if (status === 500) console.error(error);
  }
});

const port = Number(process.env.PORT) || 3000;
server.listen(port, '127.0.0.1', () => {
  console.log(`Gen 3 Battle Tower is running at http://127.0.0.1:${port}`);
});
