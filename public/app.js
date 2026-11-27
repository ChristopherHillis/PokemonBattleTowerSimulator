import { playShowdownMove, playShowdownPrepare } from './showdown-animations.js?v=0.4.2';

const TYPE_COLORS = {
  Normal: '#a9a58f', Fire: '#f08c62', Water: '#6caee9', Electric: '#e5c650',
  Grass: '#83bd72', Ice: '#80c9d2', Fighting: '#df7968', Poison: '#b578c3',
  Ground: '#d2ad69', Flying: '#9da9e6', Psychic: '#e077a8', Bug: '#a9ba57',
  Rock: '#b9a265', Ghost: '#8879c5', Dragon: '#7965dc', Dark: '#8e8179',
  Steel: '#8da6b6',
};
const STAT_LABELS = [
  ['hp', 'HP'], ['atk', 'ATK'], ['def', 'DEF'],
  ['spa', 'SP.ATK'], ['spd', 'SP.DEF'], ['spe', 'SPEED'],
];
const BATTLE_THEMES = [
  'bw2-homika-dogars.ogg', 'bw2-kanto-gym-leader.ogg', 'bw2-rival.ogg',
  'bw-rival.ogg', 'bw-subway-trainer.ogg', 'bw-trainer.ogg',
  'colosseum-miror-b.ogg', 'dpp-rival.ogg', 'dpp-trainer.ogg',
  'hgss-johto-trainer.ogg', 'hgss-kanto-trainer.ogg', 'oras-rival.ogg',
  'oras-trainer.ogg', 'sm-rival.ogg', 'sm-trainer.ogg', 'spl-elite4.ogg',
  'xd-miror-b.ogg', 'xy-rival.ogg', 'xy-trainer.ogg',
];
const SAMPLE_TEAM = [
  { species: 'Swampert', item: 'Leftovers', ability: 'Torrent', nature: 'Adamant', moves: ['Surf', 'Earthquake', 'Ice Beam', 'Protect'], evs: { hp: 4, atk: 252, def: 0, spa: 0, spd: 0, spe: 252 } },
  { species: 'Salamence', item: 'Choice Band', ability: 'Intimidate', nature: 'Adamant', moves: ['Dragon Claw', 'Earthquake', 'Rock Slide', 'Flamethrower'], evs: { hp: 4, atk: 252, def: 0, spa: 0, spd: 0, spe: 252 } },
  { species: 'Metagross', item: 'Lum Berry', ability: 'Clear Body', nature: 'Adamant', moves: ['Meteor Mash', 'Earthquake', 'Shadow Ball', 'Rock Slide'], evs: { hp: 4, atk: 252, def: 0, spa: 0, spd: 0, spe: 252 } },
  { species: 'Starmie', item: 'Leftovers', ability: 'Natural Cure', nature: 'Timid', moves: ['Surf', 'Ice Beam', 'Thunderbolt', 'Recover'], evs: { hp: 4, atk: 0, def: 0, spa: 252, spd: 0, spe: 252 } },
  { species: 'Snorlax', item: 'Leftovers', ability: 'Thick Fat', nature: 'Adamant', moves: ['Return', 'Earthquake', 'Shadow Ball', 'Rest'], evs: { hp: 252, atk: 252, def: 0, spa: 0, spd: 4, spe: 0 } },
  { species: 'Gengar', item: 'Spell Tag', ability: 'Levitate', nature: 'Timid', moves: ['Shadow Ball', 'Thunderbolt', 'Ice Punch', 'Giga Drain'], evs: { hp: 6, atk: 0, def: 0, spa: 252, spd: 0, spe: 252 } },
].map(set => ({
  ...set,
  name: '',
  level: 50,
  ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 },
}));

function savedSfxVolume() {
  try {
    const stored = localStorage.getItem('tower-sfx-volume');
    if (stored === null) return 55;
    const saved = Number(stored);
    return Number.isFinite(saved) ? Math.min(100, Math.max(0, saved)) : 55;
  } catch {
    return 55;
  }
}

function savedMusicVolume() {
  try {
    const stored = localStorage.getItem('tower-music-volume');
    if (stored === null) return 35;
    const saved = Number(stored);
    return Number.isFinite(saved) ? Math.min(100, Math.max(0, saved)) : 35;
  } catch {
    return 35;
  }
}

function parseFloorStreak(value) {
  const streak = Number(value);
  return Number.isFinite(streak) ? Math.max(0, Math.floor(streak)) : 0;
}

function loadFacilityStreak(facility) {
  return parseFloorStreak(localStorage.getItem(`tower-streak-${facility}`));
}

function saveFacilityStreak(facility, streak) {
  const value = String(parseFloorStreak(streak));
  localStorage.setItem(`tower-streak-${facility}`, value);
  if (facility === 'tower') localStorage.setItem('tower-streak', value);
}

const savedFacility = localStorage.getItem('tower-facility');
const initialFacility = ['little-cup', 'randoms'].includes(savedFacility) ? savedFacility : 'tower';
const initialFacilityStreak = localStorage.getItem(`tower-streak-${initialFacility}`) ??
  (savedFacility === null || savedFacility === initialFacility ? localStorage.getItem('tower-streak') : null);

const state = {
  dex: null,
  speciesById: new Map(),
  movesById: new Map(),
  learnsets: new Map(),
  speciesByMove: new Map(),
  speciesFilterRequest: 0,
  team: [],
  facility: initialFacility,
  selected: 0,
  battle: null,
  currentLogSide: null,
  hpByActive: new Map(),
  streak: parseFloorStreak(initialFacilityStreak),
  sfxVolume: savedSfxVolume(),
  musicVolume: savedMusicVolume(),
  battleMusic: null,
  busy: false,
  cryWarningShown: false,
  criesByPokemon: new Map(),
};

const $ = selector => document.querySelector(selector);
const rosterList = $('#roster-list');
const toast = $('#toast');

async function api(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || `Request failed (${response.status}).`);
  return result;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function titleCase(value) {
  return value ? value.replace(/\b\w/g, letter => letter.toUpperCase()) : '';
}

function getSpecies(set) {
  return state.speciesById.get(toId(set.species));
}

function toId(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function spriteUrls(pokemon, isBack = false) {
  const speciesId = toId(pokemon.species || pokemon.name);
  const folder = isBack ? 'gen5ani-back' : 'gen5ani';
  const formFallbacks = { castformsunny: 'castform', castformrainy: 'castform', castformsnowy: 'castform', deoxysattack: 'deoxys', deoxysdefense: 'deoxys', deoxysspeed: 'deoxys' };
  const fallbackId = formFallbacks[speciesId];
  const regular = `/sprites/gen5/${folder}/${speciesId}.gif`;
  const sources = pokemon.shiny ? [`/sprites/gen5/${folder}-shiny/${speciesId}.gif`] : [];
  sources.push(regular);
  if (fallbackId) {
    if (pokemon.shiny) sources.splice(1, 0, `/sprites/gen5/${folder}-shiny/${fallbackId}.gif`);
    sources.push(`/sprites/gen5/${folder}/${fallbackId}.gif`);
  }
  return sources;
}

function setPokemonSprite(image, pokemon, isBack = false) {
  const sources = spriteUrls(pokemon, isBack);
  image.dataset.spriteSources = JSON.stringify(sources);
  image.dataset.spriteSourceIndex = '0';
  image.dataset.spriteSpecies = toId(pokemon.species || pokemon.name);
  image.dataset.spriteNum = String(pokemon.num);
  image.dataset.spriteBack = String(isBack);
  image.dataset.spriteShiny = String(Boolean(pokemon.shiny));
  image.hidden = false;
  image.src = sources[0];
  image.onerror = () => {
    const sourceIndex = Number(image.dataset.spriteSourceIndex || 0) + 1;
    if (sourceIndex < sources.length) {
      image.dataset.spriteSourceIndex = String(sourceIndex);
      image.src = sources[sourceIndex];
      return;
    }
    image.hidden = true;
  };
}

function setPartySprite(image, pokemon) {
  const speciesId = toId(pokemon.species || pokemon.name);
  const aliases = { castformsunny: 'castform', castformrainy: 'castform', castformsnowy: 'castform', deoxysattack: 'deoxys', deoxysdefense: 'deoxys', deoxysspeed: 'deoxys' };
  const spriteId = aliases[speciesId] || speciesId;
  image.src = pokemon.shiny
    ? `/sprites/gen5/gen5ani-shiny/${speciesId}.gif`
    : `/sprites/gen5/gen5ani/${speciesId}.gif`;
  image.onerror = () => {
    image.onerror = null;
    image.src = pokemon.shiny
      ? `/sprites/gen5/gen5ani-shiny/${spriteId}.gif`
      : `/sprites/gen5/gen5ani/${spriteId}.gif`;
    image.onerror = () => {
      image.onerror = null;
      image.src = `/sprites/gen5/gen5ani/${spriteId}.gif`;
    };
  };
}

function setSfxVolume(volume) {
  state.sfxVolume = Math.min(100, Math.max(0, Number(volume) || 0));
  $('#sfx-volume').value = String(state.sfxVolume);
  $('#sfx-volume-value').value = `${state.sfxVolume}%`;
  $('#sfx-volume-value').textContent = `${state.sfxVolume}%`;
  try {
    localStorage.setItem('tower-sfx-volume', String(state.sfxVolume));
  } catch {
    showToast('Your browser could not save the sound setting.');
  }
}

function setMusicVolume(volume) {
  state.musicVolume = Math.min(100, Math.max(0, Number(volume) || 0));
  $('#music-volume').value = String(state.musicVolume);
  $('#music-volume-value').value = `${state.musicVolume}%`;
  $('#music-volume-value').textContent = `${state.musicVolume}%`;
  if (state.battleMusic) state.battleMusic.volume = state.musicVolume / 100;
  try {
    localStorage.setItem('tower-music-volume', String(state.musicVolume));
  } catch {
    showToast('Your browser could not save the music setting.');
  }
}

function stopBattleMusic() {
  if (!state.battleMusic) return;
  state.battleMusic.pause();
  state.battleMusic.currentTime = 0;
  state.battleMusic = null;
}

function setBattleLoading(visible) {
  const overlay = $('#battle-loading');
  overlay.hidden = !visible;
  overlay.setAttribute('aria-busy', String(visible));
}

function prepareBattleTheme() {
  stopBattleMusic();
  const theme = BATTLE_THEMES[Math.floor(Math.random() * BATTLE_THEMES.length)];
  const audio = new Audio(`/audio/${theme}`);
  audio.loop = true;
  audio.volume = 0;
  state.battleMusic = audio;
  audio.play().catch(error => {
    if (state.battleMusic !== audio) return;
    state.battleMusic = null;
    showToast(`Could not play battle music: ${error.message}`);
  });
}

function startBattleMusic() {
  if (!state.battleMusic) return;
  state.battleMusic.currentTime = 0;
  state.battleMusic.volume = state.musicVolume / 100;
}

function showToast(message) {
  toast.textContent = message;
  toast.hidden = false;
  clearTimeout(showToast.timeout);
  showToast.timeout = setTimeout(() => { toast.hidden = true; }, 4200);
}

function persistTeam() {
  try {
    localStorage.setItem(`tower-team-${state.facility}`, JSON.stringify(state.team));
    if (state.facility === 'tower') localStorage.setItem('tower-team', JSON.stringify(state.team));
  } catch {
    showToast('Your browser could not save this team. It will be lost when you leave this page.');
  }
}

function ensureTeamDefaults(team) {
  return team.map((set, index) => {
    const species = state.speciesById.get(toId(set.species)) || state.dex.species[index];
    const evs = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0, ...(set.evs || {}) };
    for (const [stat] of STAT_LABELS) {
      evs[stat] = Math.min(255, Math.max(0, Math.trunc(Number(evs[stat]) || 0)));
    }
    let remainingEvs = 508;
    for (const [stat] of [...STAT_LABELS].reverse()) {
      evs[stat] = Math.min(evs[stat], remainingEvs);
      remainingEvs -= evs[stat];
    }
    return {
      ...set,
      species: species.name,
      name: set.name || '',
      item: set.item || '',
      ability: set.ability || species.abilities[0],
      level: set.level === 5 ? 5 : 50,
      nature: set.nature || 'Serious',
      shiny: Boolean(set.shiny),
      evs,
      ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31, ...(set.ivs || {}) },
      moves: Array.isArray(set.moves) ? set.moves.slice(0, 4) : [],
    };
  });
}

function renderRoster() {
  rosterList.replaceChildren();
  state.team.forEach((set, index) => {
    const species = getSpecies(set);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `roster-card${index === state.selected ? ' selected' : ''}`;
    button.setAttribute('aria-pressed', String(index === state.selected));

    const avatar = document.createElement('span');
    avatar.className = 'roster-avatar';
    const image = document.createElement('img');
    setPartySprite(image, { ...species, shiny: set.shiny });
    image.alt = '';
    avatar.append(image);

    const meta = document.createElement('span');
    meta.className = 'roster-meta';
    const title = document.createElement('span');
    title.className = 'roster-title';
    title.textContent = set.name.trim() || species.name;
    const subtitle = document.createElement('span');
    subtitle.className = 'roster-subtitle';
    subtitle.textContent = `${species.types.join(' / ').toUpperCase()} · ${set.item || 'NO ITEM'}`;
    meta.append(title, subtitle);

    const slot = document.createElement('span');
    slot.className = 'roster-slot';
    slot.textContent = String(index + 1).padStart(2, '0');
    button.append(avatar, meta, slot);
    button.addEventListener('click', () => {
      state.selected = index;
      renderRoster();
      renderEditor();
    });
    rosterList.append(button);
  });
  $('#team-count').innerHTML = `${String(state.team.length).padStart(2, '0')} <b>/ 06</b>`;
}

function option(value, label, selected) {
  const element = document.createElement('option');
  element.value = value;
  element.textContent = label;
  element.selected = value === selected;
  return element;
}

async function loadLearnset(species, level = 50) {
  const cacheKey = `${species.id}:${level}`;
  if (state.learnsets.has(cacheKey)) return state.learnsets.get(cacheKey);
  const result = await api(`/api/learnset?species=${encodeURIComponent(species.id)}&level=${level}`);
  state.learnsets.set(cacheKey, result.moves);
  return result.moves;
}

function populateSpeciesPicker() {
  const typeSelect = $('#species-type-filter');
  typeSelect.replaceChildren(option('', 'All types', ''));
  const speciesTypes = [...new Set(state.dex.species.flatMap(species => species.types))]
    .sort((a, b) => a.localeCompare(b));
  typeSelect.append(...speciesTypes.map(type => option(type, type, '')));

  const moveSelect = $('#species-move-filter');
  moveSelect.replaceChildren(option('', 'Any move', ''));
  moveSelect.append(...state.dex.moves.map(move => option(move.id, move.name, '')));

  const statSelect = $('#species-sort-stat');
  statSelect.replaceChildren(option('name', 'Sort: Name', 'name'));
  statSelect.append(...STAT_LABELS.map(([stat, label]) => option(stat, `Sort: ${label}`, 'name')));

  const directionSelect = $('#species-sort-direction');
  directionSelect.replaceChildren(
    option('asc', 'Ascending', 'asc'),
    option('desc', 'Descending', 'asc'),
  );
}

async function refreshSpeciesOptions() {
  const requestId = ++state.speciesFilterRequest;
  const moveId = $('#species-move-filter').value;
  if (moveId && !state.speciesByMove.has(moveId)) {
    $('#species-results-note').textContent = 'Finding Pokémon that can learn this move…';
    try {
      const result = await api(`/api/species-filter?move=${encodeURIComponent(moveId)}`);
      state.speciesByMove.set(moveId, new Set(result.speciesIds));
    } catch (error) {
      if (requestId === state.speciesFilterRequest) showToast(error.message);
      return;
    }
  }
  if (requestId === state.speciesFilterRequest) renderSpeciesOptions();
}

const LITTLE_CUP_EXTRA_ALLOWED = new Set([
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
].map(toId));

function isLittleCupEligible(species) {
  return Boolean(species) && (species.tier === 'LC' || LITTLE_CUP_EXTRA_ALLOWED.has(species.id));
}

function renderSpeciesOptions() {
  const query = $('#species-search').value.trim().toLowerCase();
  const type = $('#species-type-filter').value;
  const moveId = $('#species-move-filter').value;
  const sortStat = $('#species-sort-stat').value;
  const direction = $('#species-sort-direction').value === 'desc' ? -1 : 1;
  const moveMatches = moveId ? state.speciesByMove.get(moveId) : null;
  const speciesOptions = state.dex.species.filter(species => {
    if (state.facility === 'little-cup' && !isLittleCupEligible(species)) return false;
    const matchesSearch = !query ||
      species.name.toLowerCase().includes(query) ||
      String(species.num).includes(query.replace(/^#/, ''));
    return matchesSearch &&
      (!type || species.types.includes(type)) &&
      (!moveMatches || moveMatches.has(species.id));
  });
  speciesOptions.sort((a, b) => {
    const comparison = sortStat === 'name'
      ? a.name.localeCompare(b.name)
      : a.baseStats[sortStat] - b.baseStats[sortStat];
    return comparison * direction || a.name.localeCompare(b.name);
  });

  const container = $('#species-options');
  container.replaceChildren();
  const selectedSpecies = getSpecies(state.team[state.selected]);
  for (const species of speciesOptions) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `species-option${species.id === selectedSpecies.id ? ' selected' : ''}`;
    button.setAttribute('role', 'option');
    button.setAttribute('aria-selected', String(species.id === selectedSpecies.id));
    const image = document.createElement('img');
    image.className = 'species-option-sprite';
    setPartySprite(image, species);
    image.alt = '';
    image.loading = 'lazy';

    const identity = document.createElement('span');
    identity.className = 'species-option-identity';
    const name = document.createElement('span');
    name.className = 'species-option-name';
    name.textContent = `#${String(species.num).padStart(3, '0')} ${species.name}`;
    const typeChips = document.createElement('span');
    typeChips.className = 'species-option-types';
    typeChips.append(...species.types.map(makeTypeChip));
    identity.append(name, typeChips);

    const stats = document.createElement('span');
    stats.className = 'species-option-stats';
    for (const [stat, label] of STAT_LABELS) {
      const value = document.createElement('span');
      value.textContent = `${label.replace('SP.ATK', 'SPA').replace('SP.DEF', 'SPD')} ${species.baseStats[stat]}`;
      stats.append(value);
    }
    button.append(image, identity, stats);
    button.addEventListener('click', () => selectSpecies(species));
    container.append(button);
  }
  $('#species-results-note').textContent = `${speciesOptions.length} Pokémon · sorted by ${sortStat === 'name' ? 'name' : STAT_LABELS.find(([stat]) => stat === sortStat)?.[1]} ${direction === 1 ? 'ascending' : 'descending'}`;
}

function makeTypeChip(type) {
  const chip = document.createElement('span');
  chip.className = 'type-chip';
  chip.textContent = type.toUpperCase();
  chip.style.borderColor = `${TYPE_COLORS[type] || '#87949b'}80`;
  chip.style.color = TYPE_COLORS[type] || '#c3ceca';
  return chip;
}

function selectSpecies(species) {
  const set = state.team[state.selected];
  if (set.species === species.name) return;
  set.species = species.name;
  set.ability = species.abilities[0];
  set.moves = [];
  const button = $('#start-battle');
  button.disabled = true;
  $('#species-search').value = '';
  renderEditor().then(() => { button.disabled = false; }).catch(error => {
    button.disabled = false;
    showToast(error.message);
  });
  persistTeam();
}

async function renderEditor() {
  const set = state.team[state.selected];
  const species = getSpecies(set);
  const battleLevel = state.facility === 'little-cup' ? 5 : 50;
  const learnset = await loadLearnset(species, battleLevel);
  if (state.team[state.selected] !== set) return;

  renderSpeciesOptions();
  const itemSelect = $('#item-select');
  itemSelect.replaceChildren(
    option('', 'No held item', toId(set.item)),
    ...state.dex.items.map(item => option(item.id, item.name, toId(set.item))),
  );
  const abilitySelect = $('#ability-select');
  abilitySelect.replaceChildren(...species.abilities.map(ability => option(ability, ability, set.ability)));
  if (!species.abilities.includes(set.ability)) set.ability = species.abilities[0];
  updateItemDetail(itemSelect.value);
  updateAbilityDetail(abilitySelect.value);
  const natureSelect = $('#nature-select');
  natureSelect.replaceChildren(...state.dex.natures.map(nature => option(
    toId(nature.name),
    formatNature(nature),
    toId(set.nature),
  )));

  $('#nickname-input').value = set.name;
  $('#editor-level').textContent = String(battleLevel);
  $('#locked-level-value').firstChild.textContent = String(battleLevel);
  $('#learnset-note').textContent = `UP TO 4 · LEVEL ${battleLevel} LEARNSET`;
  $('.calculated-stats-heading').textContent = `LEVEL ${battleLevel} STATS AFTER EVS & NATURE`;
  $('#shiny-toggle').checked = set.shiny;
  setPokemonSprite($('#editor-sprite'), { ...species, shiny: set.shiny });
  $('#editor-number').textContent = `#${String(species.num).padStart(3, '0')}`;
  const chips = $('#type-chips');
  chips.replaceChildren(...species.types.map(makeTypeChip));
  renderBaseStats(species);
  renderMoves(learnset, set);
  renderEvs(set);
  renderCalculatedStats(set, species);
  renderRoster();
}

function formatNature(nature) {
  if (!nature.plus || !nature.minus) return `${nature.name} (neutral)`;
  return `${nature.name} (+${statName(nature.plus)} -${statName(nature.minus)})`;
}

function statName(stat) {
  return ({
    hp: 'HP', atk: 'Atk', def: 'Def', spa: 'Sp. Atk', spd: 'Sp. Def',
    spe: 'Spe', accuracy: 'Accuracy', evasion: 'Evasion',
  })[stat] || stat;
}

function updateItemDetail(itemId) {
  const item = state.dex.items.find(entry => entry.id === itemId);
  const container = $('#item-detail');
  container.replaceChildren();
  const iconWrap = document.createElement('span');
  iconWrap.className = 'choice-icon item-icon-wrap';
  const fallback = document.createElement('span');
  fallback.className = 'item-icon-fallback';
  fallback.setAttribute('aria-hidden', 'true');
  fallback.textContent = '◆';
  const image = document.createElement('img');
  image.className = 'item-icon';
  image.alt = '';
  if (item) {
    const slug = item.name.toLowerCase().replace(/'/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    image.src = `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/${slug}.png`;
    image.onload = () => { fallback.hidden = true; };
    image.onerror = () => { image.hidden = true; };
  } else {
    image.hidden = true;
  }
  iconWrap.append(fallback, image);
  const text = document.createElement('span');
  text.className = 'choice-description';
  text.textContent = item?.shortDesc || item?.desc || 'No held item.';
  container.append(iconWrap, text);
}

function updateAbilityDetail(abilityName) {
  const ability = state.dex.abilities.find(entry => entry.name === abilityName);
  const container = $('#ability-detail');
  container.replaceChildren();
  const icon = document.createElement('span');
  icon.className = 'choice-icon ability-icon';
  icon.setAttribute('aria-hidden', 'true');
  icon.textContent = '✦';
  const text = document.createElement('span');
  text.className = 'choice-description';
  text.textContent = ability?.shortDesc || ability?.desc || 'No ability description available.';
  container.append(icon, text);
}

function renderBaseStats(species) {
  const container = $('#base-stats');
  container.replaceChildren();
  const total = Object.values(species.baseStats).reduce((sum, value) => sum + value, 0);
  $('#base-stat-total').textContent = `TOTAL ${total}`;
  for (const [stat, label] of STAT_LABELS) {
    const row = document.createElement('div');
    row.className = 'base-stat-row';
    const name = document.createElement('span');
    name.className = 'base-stat-name';
    name.textContent = label;
    const barTrack = document.createElement('span');
    barTrack.className = 'base-stat-track';
    const bar = document.createElement('span');
    bar.className = 'base-stat-bar';
    bar.style.width = `${Math.max(3, (species.baseStats[stat] / 255) * 100)}%`;
    barTrack.append(bar);
    const value = document.createElement('span');
    value.className = 'base-stat-value';
    value.textContent = species.baseStats[stat];
    row.append(name, barTrack, value);
    container.append(row);
  }
}

function renderMoves(learnset, set) {
  const moveList = $('#move-list');
  moveList.replaceChildren();
  const selectedMoves = [];
  for (const moveName of set.moves) {
    const move = learnset.find(entry => entry.id === toId(moveName));
    if (move && !selectedMoves.includes(move.name)) selectedMoves.push(move.name);
  }
  while (selectedMoves.length < 4) {
    const fallback = learnset.find(move => !selectedMoves.includes(move.name));
    if (!fallback) break;
    selectedMoves.push(fallback.name);
  }
  set.moves = selectedMoves.slice(0, 4);

  for (let index = 0; index < 4; index += 1) {
    const moveName = set.moves[index] || '';
    const row = document.createElement('label');
    row.className = 'move-row';
    const slot = document.createElement('span');
    slot.className = 'move-slot';
    slot.textContent = `0${index + 1}`;
    const select = document.createElement('select');
    select.className = 'select-control';
    select.setAttribute('aria-label', `Move slot ${index + 1}`);
    const selectedElsewhere = new Set(set.moves.filter((name, slot) => slot !== index));
    const availableMoves = learnset.filter(move => !selectedElsewhere.has(move.name));
    select.disabled = !moveName && !availableMoves.length;
    select.append(option('', availableMoves.length ? 'Choose a move' : 'No additional moves', moveName ? '' : ''));
    select.append(...availableMoves.map(move => option(move.id, move.name, toId(moveName))));
    const info = document.createElement('span');
    info.className = 'move-type';
    const move = state.movesById.get(toId(moveName));
    if (move) {
      info.append(createCategoryIcon(move.category));
      const type = document.createElement('span');
      type.textContent = move.type.toUpperCase();
      info.append(type);
    }
    if (move) info.style.color = TYPE_COLORS[move.type] || '';
    select.addEventListener('change', () => {
      const selected = learnset.find(entry => entry.id === select.value);
      const updatedMoves = set.moves.slice();
      updatedMoves[index] = selected ? selected.name : '';
      set.moves = updatedMoves.filter(Boolean);
      renderMoves(learnset, set);
      renderRoster();
      persistTeam();
    });
    row.append(slot, select, info);
    moveList.append(row);
  }
}

function renderEvs(set) {
  const evList = $('#ev-list');
  evList.replaceChildren();
  for (const [stat, label] of STAT_LABELS) {
    const wrapper = document.createElement('div');
    wrapper.className = 'ev-control';
    const caption = document.createElement('label');
    caption.htmlFor = `ev-${stat}`;
    caption.textContent = label;
    const input = document.createElement('input');
    input.id = `ev-${stat}`;
    input.className = 'ev-input';
    input.type = 'number';
    input.min = '0';
    input.max = '255';
    input.step = '1';
    input.value = String(set.evs[stat] || 0);
    input.addEventListener('input', () => {
      const requested = Number(input.value);
      const otherTotal = Object.entries(set.evs)
        .filter(([otherStat]) => otherStat !== stat)
        .reduce((total, [, value]) => total + Number(value || 0), 0);
      const maxForStat = Math.min(255, Math.max(0, 508 - otherTotal));
      const value = Number.isFinite(requested) ? Math.min(maxForStat, Math.max(0, Math.trunc(requested))) : 0;
      set.evs[stat] = value;
      input.value = String(value);
      renderEvTotal(set);
      renderCalculatedStats(set, getSpecies(set));
      persistTeam();
    });
    wrapper.append(caption, input);
    evList.append(wrapper);
  }
  renderEvTotal(set);
}

function renderEvTotal(set) {
  const total = Object.values(set.evs).reduce((sum, value) => sum + Number(value || 0), 0);
  const element = $('#ev-total');
  element.textContent = `${total} / 508 EVS`;
  element.classList.toggle('over-limit', total > 508);
}

function calculateLevelStats(set, species, level = 50) {
  const nature = state.dex.natures.find(entry => toId(entry.name) === toId(set.nature));
  return Object.fromEntries(STAT_LABELS.map(([stat]) => {
    const base = species.baseStats[stat];
    const iv = Number(set.ivs[stat] ?? 31);
    const ev = Number(set.evs[stat] || 0);
    const baseValue = Math.floor(((2 * base + iv + Math.floor(ev / 4)) * level) / 100);
    if (species.id === 'shedinja' && stat === 'hp') return [stat, 1];
    if (stat === 'hp') return [stat, baseValue + level + 10];
    const natureMultiplier = nature?.plus === stat ? 1.1 : nature?.minus === stat ? 0.9 : 1;
    return [stat, Math.floor((baseValue + 5) * natureMultiplier)];
  }));
}

function renderCalculatedStats(set, species) {
  const container = $('#calculated-stats');
  if (!container || !species) return;
  const level = state.facility === 'little-cup' ? 5 : 50;
  const values = calculateLevelStats(set, species, level);
  container.replaceChildren(...STAT_LABELS.map(([stat, label]) => {
    const chip = document.createElement('span');
    chip.className = 'calculated-stat';
    const name = document.createElement('span');
    name.textContent = label;
    const value = document.createElement('b');
    value.textContent = String(values[stat]);
    chip.append(name, value);
    return chip;
  }));
}



function bindEditorEvents() {
  $('#species-search').addEventListener('input', renderSpeciesOptions);
  $('#species-type-filter').addEventListener('change', renderSpeciesOptions);
  $('#species-move-filter').addEventListener('change', () => {
    refreshSpeciesOptions().catch(error => showToast(error.message));
  });
  $('#species-sort-stat').addEventListener('change', renderSpeciesOptions);
  $('#species-sort-direction').addEventListener('change', renderSpeciesOptions);
  $('#nickname-input').addEventListener('input', event => {
    state.team[state.selected].name = event.target.value.slice(0, 18);
    renderRoster();
    persistTeam();
  });
  $('#item-select').addEventListener('change', event => {
    const item = state.dex.items.find(entry => entry.id === event.target.value);
    state.team[state.selected].item = item?.name || '';
    updateItemDetail(event.target.value);
    renderRoster();
    persistTeam();
  });
  $('#ability-select').addEventListener('change', event => {
    state.team[state.selected].ability = event.target.value;
    updateAbilityDetail(event.target.value);
    persistTeam();
  });
  $('#nature-select').addEventListener('change', event => {
    state.team[state.selected].nature = event.target.value;
    renderCalculatedStats(state.team[state.selected], getSpecies(state.team[state.selected]));
    persistTeam();
  });
  $('#shiny-toggle').addEventListener('change', event => {
    const set = state.team[state.selected];
    set.shiny = event.target.checked;
    setPokemonSprite($('#editor-sprite'), { ...getSpecies(set), shiny: set.shiny });
    renderRoster();
    persistTeam();
  });
  $('#sample-team').addEventListener('click', () => {
    state.team = ensureTeamDefaults(clone(SAMPLE_TEAM));
    state.selected = 0;
    $('#species-search').value = '';
    $('#species-type-filter').value = '';
    $('#species-move-filter').value = '';
    $('#species-sort-stat').value = 'name';
    $('#species-sort-direction').value = 'asc';
    persistTeam();
    renderRoster();
    renderEditor().catch(error => showToast(error.message));
  });
}

/**async function checkTeam() {
  if (state.team.length !== 6) return 'Your team needs exactly six Pokémon.';
  const level = state.facility === 'little-cup' ? 5 : 50;
  const speciesIds = state.team.map(set => toId(set.species));
  if (new Set(speciesIds).size !== 6) return 'A team cannot use the same species more than once.';
  await Promise.all(state.team.map(set => loadLearnset(getSpecies(set), level)));
  for (const set of state.team) {
    const species = getSpecies(set);
    if (!species) return `${set.species} is not available in Generation 3.`;
    if (state.facility === 'little-cup' && species.tier !== 'LC') return `${species.name} is not eligible for Little Cup.`;
    if (set.level !== level) return `${species.name} must be level ${level} in this facility.`;
    if (!set.ability || !species.abilities.includes(set.ability)) return `Choose a valid ability for ${species.name}.`;
    if (set.moves.length < 1 || set.moves.length > 4 || set.moves.some(move => !move)) return `Choose at least one move for ${species.name}.`;
    if (new Set(set.moves.map(toId)).size !== set.moves.length) return `${species.name} cannot use the same move twice.`;
    if (Object.values(set.evs).some(value => value < 0 || value > 255)) return `${species.name} has an invalid EV value.`;
    if (Object.values(set.evs).reduce((sum, value) => sum + value, 0) > 508) return `${species.name} has more than 508 EVs.`;
    const learnable = new Set((state.learnsets.get(`${species.id}:${level}`) || []).map(move => move.id));
    if (set.moves.some(move => !learnable.has(toId(move)))) return `${species.name} has a move it cannot learn in Generation 3.`;
  }
  return null;
}
  **/

function formatName(pokemon) {
  return pokemon.name && pokemon.name !== pokemon.species ? pokemon.name : pokemon.species;
}

function activePokemon(side) {
  return side.team.find(pokemon => pokemon.active) ||
    (side.actions?.kind === 'switch' ? side.team.find(pokemon => pokemon.fainted) : null) ||
    side.team.find(pokemon => !pokemon.fainted) ||
    side.team[0];
}

function setHealthBar(element, pokemon) {
  const percent = pokemon.maxhp ? Math.max(0, Math.min(100, (pokemon.hp / pokemon.maxhp) * 100)) : 0;
  element.style.width = `${percent}%`;
  element.classList.toggle('medium', percent <= 50 && percent > 20);
  element.classList.toggle('low', percent <= 20);
}

function positionBattleHud(prefix) {
  const side = $(`#${prefix}-sprite`).closest('.battle-side');
  const sprite = $(`#${prefix}-sprite`);
  const hud = side.querySelector('.battle-mon-info');
  if (sprite.hidden || !hud) return;

  const sideRect = side.getBoundingClientRect();
  const spriteRect = sprite.getBoundingClientRect();
  if (!sideRect.width || !spriteRect.width || !spriteRect.height) return;
  const sideStyle = getComputedStyle(side);
  const borderLeft = Number.parseFloat(sideStyle.borderLeftWidth) || 0;
  const borderRight = Number.parseFloat(sideStyle.borderRightWidth) || 0;
  const borderTop = Number.parseFloat(sideStyle.borderTopWidth) || 0;
  const paddingLeft = Number.parseFloat(sideStyle.paddingLeft) || 0;
  const paddingRight = Number.parseFloat(sideStyle.paddingRight) || 0;
  const paddingTop = Number.parseFloat(sideStyle.paddingTop) || 0;
  const contentLeft = sideRect.left + borderLeft + paddingLeft;
  const contentTop = sideRect.top + borderTop + paddingTop;
  const contentWidth = sideRect.width - borderLeft - borderRight - paddingLeft - paddingRight;
  const contentCenter = contentLeft + contentWidth / 2;
  const spriteCenter = spriteRect.left + spriteRect.width / 2;
  const hudTop = spriteRect.top - contentTop - hud.offsetHeight - 8;
  const horizontalShift = spriteCenter - contentCenter;
  const horizontalTransform = horizontalShift < 0
    ? `calc(-50% - ${Math.abs(horizontalShift)}px)`
    : `calc(-50% + ${horizontalShift}px)`;

  hud.style.left = '50%';
  hud.style.right = 'auto';
  hud.style.top = `${prefix === 'opponent' ? Math.max(8, hudTop) : hudTop}px`;
  hud.style.transform = `translateX(${horizontalTransform})`;
}

function positionBattleFieldVisuals(prefix) {
  const side = $(`#${prefix}-sprite`).closest('.battle-side');
  const sprite = $(`#${prefix}-sprite`);
  const hazards = $(`#${prefix}-hazards`);
  if (!side || !sprite || sprite.hidden || !hazards || hazards.hidden) return;

  const sideRect = side.getBoundingClientRect();
  const spriteRect = sprite.getBoundingClientRect();
  if (!sideRect.width || !sideRect.height || !spriteRect.width || !spriteRect.height) return;
  const width = Math.max(0, Math.min(170, sideRect.width - 8));
  const height = hazards.offsetHeight || 42;
  const centerX = spriteRect.left + spriteRect.width / 2 - sideRect.left;
  const left = Math.max(width / 2 + 4, Math.min(sideRect.width - width / 2 - 4, centerX));
  const enemyLayerOffset = prefix === 'opponent' ? 26 : 0;
  const arenaBottom = $('#arena').getBoundingClientRect().bottom;
  const maxTop = Math.max(0, arenaBottom - sideRect.top - height);
  const top = Math.max(0, Math.min(maxTop,
    spriteRect.bottom - sideRect.top - height / 2 + enemyLayerOffset));
  hazards.style.width = `${width}px`;
  hazards.style.left = `${left}px`;
  hazards.style.top = `${top}px`;
}

function positionFieldScreenBadge(prefix) {
  const header = $('.arena-top');
  const sprite = $(`#${prefix}-sprite`);
  const group = $(`#${prefix}-screen-status`);
  if (!header || !sprite || !group || group.hidden) return;

  const headerRect = header.getBoundingClientRect();
  const spriteRect = sprite.getBoundingClientRect();
  if (!headerRect.width || !spriteRect.width) return;
  const groupWidth = group.getBoundingClientRect().width;
  const desired = spriteRect.left + spriteRect.width / 2 - headerRect.left;
  const nameRight = header.firstElementChild.getBoundingClientRect().right - headerRect.left;
  const turnLeft = $('.turn-badge').getBoundingClientRect().left - headerRect.left;
  const safeMin = nameRight + groupWidth / 2 + 7;
  const safeMax = turnLeft - groupWidth / 2 - 7;
  const fallback = prefix === 'player' ? headerRect.width * 0.3 : headerRect.width * 0.7;
  const center = safeMin <= safeMax
    ? Math.max(safeMin, Math.min(safeMax, desired))
    : Math.max(groupWidth / 2 + 3, Math.min(headerRect.width - groupWidth / 2 - 3, fallback));
  group.style.left = `${center}px`;
}

function positionBattleFieldVisualsAll() {
  for (const prefix of ['player', 'opponent']) {
    positionBattleFieldVisuals(prefix);
    positionFieldScreenBadge(prefix);
  }
}

function renderSide(side, pokemon, prefix) {
  const nameElement = $(`#${prefix}-active-name`);
  const health = $(`#${prefix}-health`);
  const hp = $(`#${prefix}-hp`);
  const status = $(`#${prefix}-status`);
  const sprite = $(`#${prefix}-sprite`);
  if (!pokemon) return;
  resetBattleSpriteMotion(sprite);
  $(`#${prefix}-level`).textContent = `Lv.${pokemon.level}`;
  nameElement.textContent = formatName(pokemon);
  const hpPercent = pokemon.maxhp ? Math.max(0, Math.min(100, Math.round((pokemon.hp / pokemon.maxhp) * 100))) : 0;
  hp.textContent = `${hpPercent}%`;
  status.textContent = pokemon.status ? statusName(pokemon.status) : '—';
  status.className = `battle-status${pokemon.status ? ` status-${pokemon.status}` : ''}`;
  renderBattleEffects(pokemon, $(`#${prefix}-effects`));
  renderBattleVolatileVisuals(pokemon, prefix);
  renderBattleStatTooltip(pokemon, prefix);
  setHealthBar(health, pokemon);
  const isPlayer = prefix === 'player';
  sprite.classList.remove('fainting', 'recalling', 'pokemon-entering');
  $(`#${prefix}-shadow`).classList.remove('fainting-shadow');
  setPokemonSprite(sprite, pokemon, isPlayer);
  sprite.hidden = Boolean(pokemon.fainted);
  sprite.alt = pokemon.species;
  positionBattleHud(prefix);
  positionBattleFieldVisuals(prefix);
  positionFieldScreenBadge(prefix);
}

function resetBattleSpriteMotion(sprite) {
  sprite.dataset.animationEpoch = String((Number(sprite.dataset.animationEpoch) || 0) + 1);
  for (const animation of sprite.getAnimations()) animation.cancel();
  sprite.style.transform = '';
  sprite.style.opacity = '';
}

function clearBattleMoveEffects() {
  $('#move-effect-layer').replaceChildren();
}

let battleHudResizeFrame = 0;
window.addEventListener('resize', () => {
  if (!state.battle) return;
  cancelAnimationFrame(battleHudResizeFrame);
  battleHudResizeFrame = requestAnimationFrame(() => {
    positionBattleHud('player');
    positionBattleHud('opponent');
    positionBattleFieldVisualsAll();
  });
});

function renderBattleStatTooltip(pokemon, prefix) {
  const side = $(`#${prefix}-sprite`).closest('.battle-side');
  let tooltip = side.querySelector('.battle-stat-tooltip');
  if (!tooltip) {
    tooltip = document.createElement('div');
    tooltip.className = 'battle-stat-tooltip';
    tooltip.setAttribute('role', 'tooltip');
    side.append(tooltip);
  }
  tooltip.replaceChildren();
  const heading = document.createElement('b');
  if (prefix === 'opponent') {
    heading.textContent = `${pokemon.species} · REVEALED MOVES`;
    tooltip.append(heading);
    const moves = pokemon.moves || [];
    if (!moves.length) {
      const unknown = document.createElement('span');
      unknown.className = 'battle-stat-row battle-stat-move';
      unknown.textContent = 'No moves revealed yet';
      tooltip.append(unknown);
    } else {
      for (const move of moves) {
        const row = document.createElement('span');
        row.className = 'battle-stat-row battle-stat-move';
        row.textContent = move.name;
        tooltip.append(row);
      }
    }
    return;
  }
  heading.textContent = `${pokemon.species} · CURRENT STATS`;
  tooltip.append(heading);
  const names = { hp: 'HP', atk: 'Attack', def: 'Defense', spa: 'Sp. Atk', spd: 'Sp. Def', spe: 'Speed' };
  for (const stat of ['hp', 'atk', 'def', 'spa', 'spd', 'spe']) {
    const row = document.createElement('span');
    const stage = pokemon.boosts?.[stat] || 0;
    row.className = `battle-stat-row${stage > 0 ? ' stage-up' : stage < 0 ? ' stage-down' : ''}`;
    const label = document.createElement('span'); label.textContent = names[stat];
    const value = document.createElement('b'); value.textContent = String(pokemon.stats?.[stat] ?? '—');
    row.append(label, value);
    if (stage) {
      const stages = document.createElement('small');
      stages.textContent = `${stage > 0 ? '+' : ''}${stage} stage${Math.abs(stage) === 1 ? '' : 's'}`;
      row.append(stages);
    }
    tooltip.append(row);
  }
}

function renderFieldState(field = {}) {
  const arena = $('#arena');
  const weather = String(field.weather || '').toLowerCase();
  const durationLabel = turns => Number.isFinite(turns) && turns > 0
    ? ` · ${turns} ${turns === 1 ? 'turn' : 'turns'}`
    : '';
  const weatherNames = {
    raindance: 'Rain',
    sunnyday: 'Harsh sunlight',
    sandstorm: 'Sandstorm',
    hail: 'Hail',
  };
  renderShowdownFieldVisuals(weather, Boolean(field.trickRoom));

  const badges = [];
  if (weatherNames[weather]) {
    const turns = durationLabel(field.weatherTurns);
    badges.push({ label: `${weatherNames[weather]}${turns}`, className: `field-badge field-weather weather-${weather}`, title: `${weatherNames[weather]}${turns}` });
  }
  if (field.trickRoom) {
    const turns = durationLabel(field.trickRoomTurns);
    badges.push({ label: `Trick Room${turns}`, className: 'field-badge field-trick-room', title: `Turn order is reversed by Trick Room${turns}.` });
  }
  const playerHazards = field.hazards?.player || [];
  const opponentHazards = field.hazards?.opponent || [];
  const status = $('#field-status');
  status.replaceChildren(...badges.map(badge => {
    const element = document.createElement('span');
    element.className = badge.className;
    element.textContent = badge.label;
    element.title = badge.title;
    return element;
  }));
  for (const [side, label] of [['player', 'Your'], ['opponent', "The opponent's"]]) {
    const container = $(`#${side}-screen-status`);
    const screens = field.screens?.[side] || [];
    const signature = screens.map(screen => `${screen.id}:${screen.turns ?? ''}`).join(',');
    if (container.dataset.screens !== signature) {
      container.dataset.screens = signature;
      container.replaceChildren(...screens.map(screen => {
        const turns = durationLabel(screen.turns);
        const element = document.createElement('span');
        element.className = `field-badge field-screen field-screen-${screen.id} field-screen-${side}`;
        element.textContent = `${screen.name}${turns}`;
        element.title = `${label} ${screen.name} is active${turns}.`;
        return element;
      }));
    }
    container.hidden = !screens.length;
  }
  renderHazards(opponentHazards, $('#opponent-hazards'));
  renderHazards(playerHazards, $('#player-hazards'));
}

function renderShowdownFieldVisuals(weather, trickRoom) {
  const layer = $('#field-visual-layer');
  const weatherSources = {
    raindance: 'weather-gen6-raindance',
    sunnyday: 'weather-gen6-sunnyday',
    sandstorm: 'weather-gen6-sandstorm',
    hail: 'weather-gen6-hail',
  };
  const activeWeather = weatherSources[weather] || '';
  const next = `${activeWeather}|${trickRoom ? 'trickroom' : ''}`;
  if (layer.dataset.visual === next) return;
  layer.dataset.visual = next;
  layer.replaceChildren();
  const staticWeatherAssets = {
    raindance: 'weather-raindance.jpg',
    sunnyday: 'weather-sunnyday.jpg',
    sandstorm: 'weather-sandstorm.png',
    hail: 'weather-hail.png',
  };
  if (activeWeather && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const video = document.createElement('video');
    video.className = 'showdown-weather-video';
    video.autoplay = true;
    video.loop = true;
    video.muted = true;
    video.playsInline = true;
    video.setAttribute('aria-hidden', 'true');
    const webm = document.createElement('source');
    webm.src = `/vendor/showdown/fx/${activeWeather}.webm`;
    webm.type = 'video/webm';
    const mp4 = document.createElement('source');
    mp4.src = `/vendor/showdown/fx/${activeWeather}.mp4`;
    mp4.type = 'video/mp4';
    video.append(webm, mp4);
    layer.append(video);
    video.play().catch(() => { });
  } else if (activeWeather) {
    const image = document.createElement('img');
    image.className = 'showdown-field-image';
    image.src = `/vendor/showdown/fx/${staticWeatherAssets[weather]}`;
    image.alt = '';
    layer.append(image);
  }
  if (trickRoom) {
    const image = document.createElement('img');
    image.className = 'showdown-field-image showdown-trick-room';
    image.src = '/vendor/showdown/fx/weather-trickroom.png';
    image.alt = '';
    layer.append(image);
  }
}

function renderHazards(hazards, container) {
  const signature = hazards.map(hazard => `${hazard.id}:${hazard.layers}`).join(',');
  if (container.dataset.hazards === signature) return;
  container.dataset.hazards = signature;
  container.replaceChildren();
  container.hidden = !hazards.length;
  for (const hazard of hazards) {
    const images = hazard.id === 'stealthrock'
      ? ['rock1.png', 'rock2.png', 'rock3.png']
      : hazard.id === 'toxicspikes'
        ? Array(Math.max(1, Math.min(2, hazard.layers || 1))).fill('poisoncaltrop.png')
        : hazard.id === 'stickyweb'
          ? ['web.png']
          : Array(Math.max(1, Math.min(3, hazard.layers || 1))).fill('caltrop.png');
    images.forEach((asset, index) => {
      const image = document.createElement('img');
      image.className = `showdown-hazard hazard-${hazard.id}`;
      image.src = `/vendor/showdown/fx/${asset}`;
      image.alt = '';
      image.title = `${hazard.name}${hazard.layers > 1 ? ` · ${hazard.layers} layers` : ''}`;
      image.style.setProperty('--hazard-index', String(index));
      image.setAttribute('aria-hidden', 'true');
      container.append(image);
      if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        image.animate([
          { opacity: 0, transform: 'translateY(8px) scale(.65)' },
          { opacity: .88, transform: 'translateY(0) scale(1)' },
        ], { duration: 280, easing: 'ease-out' });
      }
    });
  }
}

function triggerMoveVisual(line, transitioning = false) {
  const parts = line.split('|');
  const userSide = parts[2]?.startsWith('p1') ? 'player' : 'opponent';
  const defaultTargetSide = userSide === 'player' ? 'opponent' : 'player';
  const targetSlot = parts[4]?.match(/^p([12])/i)?.[1];
  const targetSide = targetSlot ? (targetSlot === '1' ? 'player' : 'opponent') : defaultTargetSide;
  const animationMoveId = toId(parts.find(part => part.startsWith('[anim] '))?.slice(7) || parts[3]);
  const move = state.movesById.get(animationMoveId) || state.movesById.get(toId(parts[3]));
  if (!move) return;
  const target = ['self', 'allySide'].includes(move.target) ? userSide : targetSide;
  playShowdownMove(animationMoveId, userSide, target, {
    keepAttackerHome: animationMoveId === 'extremespeed' ||
      (transitioning && ['meteormash', 'doubleedge'].includes(animationMoveId)),
  });
}

function triggerMovePreparation(line, side, stack = 0) {
  const parts = line.split('|');
  const moveName = parts[3]?.replace(/^move:\s*/i, '');
  const move = state.movesById.get(toId(moveName));
  const focus = toId(moveName) === 'focuspunch';
  showFloatingBattleText(side, focus ? 'FOCUSING!' : 'CHARGING!', focus ? 'float-focus' : 'float-charge', stack);
  if (!move) return;
  playShowdownPrepare(toId(moveName), side, side === 'player' ? 'opponent' : 'player');
}

function showFloatingHpChange(side, percent, isHealing, stack = 0) {
  if (!percent) return;
  const sprite = $(`#${side}-sprite`);
  if (sprite.hidden) return;
  const spriteRect = sprite.getBoundingClientRect();
  const arenaRect = $('#arena').getBoundingClientRect();
  const layer = $('#battle-float-layer');
  const floating = document.createElement('span');
  floating.className = `battle-float-text ${isHealing ? 'float-healing' : 'float-damage'}`;
  floating.textContent = `${isHealing ? '+' : '-'}${percent}%`;
  floating.style.left = `${spriteRect.left - arenaRect.left + spriteRect.width / 2}px`;
  floating.style.top = `${spriteRect.top - arenaRect.top + spriteRect.height * 0.3 - (stack % 3) * 18}px`;
  layer.append(floating);
  setTimeout(() => floating.remove(), 1100);
}

function showFloatingBattleText(side, text, className, stack = 0) {
  const sprite = $(`#${side}-sprite`);
  if (sprite.hidden) return;
  const spriteRect = sprite.getBoundingClientRect();
  const arenaRect = $('#arena').getBoundingClientRect();
  const floating = document.createElement('span');
  floating.className = `battle-float-text ${className}`;
  floating.textContent = text;
  floating.style.left = `${spriteRect.left - arenaRect.left + spriteRect.width / 2}px`;
  floating.style.top = `${spriteRect.top - arenaRect.top + spriteRect.height * 0.3 - (stack % 3) * 18}px`;
  $('#battle-float-layer').append(floating);
  setTimeout(() => floating.remove(), 1100);
}

function renderBattleEffects(pokemon, container) {
  container.replaceChildren();
  for (const [stat, value] of Object.entries(pokemon.boosts || {})) {
    if (!value) continue;
    const stage = document.createElement('span');
    stage.className = `effect-chip effect-stage ${value > 0 ? 'stage-up' : 'stage-down'}`;
    stage.textContent = `${statName(stat)} ${value > 0 ? '+' : ''}${value}`;
    stage.title = `${statName(stat)} ${value > 0 ? 'raised' : 'lowered'} ${Math.abs(value)} ${Math.abs(value) === 1 ? 'stage' : 'stages'}`;
    container.append(stage);
  }
  if (pokemon.volatiles?.leechseed) {
    const seeded = document.createElement('span');
    seeded.className = 'effect-chip effect-volatile effect-negative';
    seeded.textContent = 'SEEDED';
    seeded.title = 'Leech Seed is active';
    container.append(seeded);
  }
  if (pokemon.volatiles?.endure) {
    const endure = document.createElement('span');
    endure.className = 'effect-chip effect-volatile effect-positive';
    endure.textContent = 'ENDURE';
    endure.title = 'Endure is active this turn';
    container.append(endure);
  }
}

function renderBattleVolatileVisuals(pokemon, prefix) {
  const sprite = $(`#${prefix}-sprite`);
  const side = sprite.closest('.battle-side');
  let layer = side.querySelector('.battle-volatile-layer');
  if (!layer) {
    layer = document.createElement('div');
    layer.className = 'battle-volatile-layer';
    layer.setAttribute('aria-hidden', 'true');
    side.append(layer);
  }
  layer.replaceChildren();
  if (!pokemon.volatiles?.leechseed || sprite.hidden) return;
  const sideRect = side.getBoundingClientRect();
  const spriteRect = sprite.getBoundingClientRect();
  const centerX = spriteRect.left + spriteRect.width / 2 - sideRect.left;
  const centerY = spriteRect.top + spriteRect.height / 2 - sideRect.top;
  const offsets = [[-25, -26], [28, -18], [7, 17]];
  offsets.forEach(([dx, dy], index) => {
    const orb = document.createElement('img');
    orb.className = 'leech-seed-orb';
    orb.src = '/vendor/showdown/fx/energyball.png';
    orb.alt = '';
    orb.style.left = `${centerX + dx - 9}px`;
    orb.style.top = `${centerY + dy - 9}px`;
    orb.style.setProperty('--orb-index', String(index));
    layer.append(orb);
  });
}

function statusName(status) {
  return ({
    brn: 'BURN', frz: 'FROZEN', par: 'PARALYSIS',
    psn: 'POISON', slp: 'SLEEP', tox: 'TOXIC',
  })[status] || titleCase(status).toUpperCase();
}

function renderParty(team, target, isOpponent = false) {
  target.replaceChildren();
  // Keep party controls anchored to original team slots across every battle
  // update; active order changes must never reorder the displayed party.
  [...team].sort((a, b) => a.slot - b.slot).forEach(pokemon => {
    if (!pokemon.revealed) {
      const dot = document.createElement('span');
      dot.className = 'party-dot unrevealed';
      dot.setAttribute('aria-label', `Opponent Pokémon ${pokemon.slot + 1}, not yet revealed`);
      dot.textContent = '?';
      target.append(dot);
      return;
    }
    const dot = document.createElement(isOpponent ? 'span' : 'button');
    dot.dataset.slot = String(pokemon.slot);
    const isActive = Boolean(pokemon.active);
    const forcedSwitch = state.battle?.player.actions.kind === 'switch';
    const canSwitch = !isOpponent && !isActive && !pokemon.fainted && !state.battle?.ended;
    dot.className = `party-dot${pokemon.fainted ? ' fainted' : ''}${pokemon.status ? ` party-status-${pokemon.status}` : ''}${isActive ? ' party-active' : ''}${canSwitch ? ' party-switchable' : ''}`;
    if (!isOpponent) {
      dot.type = 'button';
      dot.disabled = !canSwitch || state.busy;
      dot.setAttribute('aria-pressed', String(isActive));
      dot.addEventListener('click', () => submitChoice(`switch ${pokemon.slot + 1}`));
    }
    if (isOpponent) {
      dot.title = `${pokemon.species} · ${pokemon.fainted ? 'Fainted' : `${pokemon.hp}/${pokemon.maxhp} HP`}${pokemon.status ? ` · ${statusName(pokemon.status)}` : ''}`;
    } else {
      const stateLabel = pokemon.fainted ? 'Fainted' : pokemon.status ? statusName(pokemon.status) : 'Ready';
      const actionLabel = canSwitch ? ' · Click to switch' : '';
      dot.setAttribute('aria-label', `${canSwitch ? 'Switch to' : forcedSwitch ? 'Send out' : 'Your'} ${pokemon.species}${pokemon.status || pokemon.fainted ? `, ${stateLabel.toLowerCase()}` : ''}`);
      dot.title = `${pokemon.species} · ${stateLabel}${actionLabel}`;
    }
    const image = document.createElement('img');
    setPartySprite(image, pokemon);
    image.alt = '';
    dot.append(image);
    if (pokemon.status) {
      const condition = document.createElement('span');
      condition.className = 'party-condition';
      condition.textContent = statusName(pokemon.status).slice(0, 3);
      dot.append(condition);
    }
    const hpTrack = document.createElement('span');
    hpTrack.className = 'party-hp-track';
    const hpFill = document.createElement('span');
    hpFill.className = 'party-hp-fill';
    const hpRatio = pokemon.maxhp > 0 ? Math.max(0, Math.min(1, pokemon.hp / pokemon.maxhp)) : 0;
    hpFill.style.width = `${hpRatio * 100}%`;
    hpFill.classList.toggle('hp-low', hpRatio <= 0.2);
    hpFill.classList.toggle('hp-mid', hpRatio > 0.2 && hpRatio <= 0.5);
    hpTrack.append(hpFill);
    dot.append(hpTrack);
    const moveTooltip = document.createElement('span');
    moveTooltip.className = 'party-move-tooltip';
    const tooltipTitle = document.createElement('b');
    tooltipTitle.textContent = isOpponent ? `${pokemon.species} · REVEALED MOVES` : `${pokemon.species} · MOVES / PP`;
    moveTooltip.append(tooltipTitle);
    const moves = Array.isArray(pokemon.moves) ? pokemon.moves : [];
    if (moves.length) {
      for (const move of moves) {
        const row = document.createElement('span');
        row.textContent = isOpponent ? move.name : `${move.name}  ${move.pp}/${move.maxpp} PP`;
        moveTooltip.append(row);
      }
    } else {
      const unknown = document.createElement('span');
      unknown.textContent = isOpponent ? 'No moves revealed yet' : 'Move details unavailable';
      moveTooltip.append(unknown);
    }
    dot.append(moveTooltip);
    target.append(dot);
  });
  if (!isOpponent) {
    const alive = team.filter(pokemon => !pokemon.fainted).length;
    $('#party-alive').textContent = `${alive} / 6`;
  } else {
    const alive = team.filter(pokemon => !pokemon.fainted).length;
    $('#opponent-party-alive').textContent = `${alive} / 6`;
  }
}

function getBattleLine(raw, hpChangePercent = null) {
  const parts = raw.split('|');
  const command = parts[1];
  const actor = value => String(value || '').replace(/^p[12][a-z]?:\s*/, '');
  const sideActor = value => {
    const side = String(value || '').match(/^p([12])[a-z]?:/i)?.[1];
    const name = actor(value);
    return side === '1' ? `Your ${name}` : side === '2' ? `The opposing ${name}` : name;
  };
  const effectName = value => String(value || '')
    .replace(/^\[from\]\s*/, '')
    .replace(/^(move|ability|item):\s*/i, '');
  const source = parts.find(part => part.startsWith('[from]'));
  const sourceName = source ? effectName(source) : '';
  const visibleSourceName = ({
    brn: 'burn', psn: 'poison', tox: 'poison', sandstorm: 'the sandstorm',
    hail: 'the hail',
  })[sourceName] || sourceName;
  const statusText = ({
    brn: 'burned', frz: 'frozen', par: 'paralyzed', psn: 'poisoned',
    slp: 'put to sleep', tox: 'badly poisoned',
  })[parts[3]] || parts[3];
  const event = (text, className = 'log-system') => ({ text, className });
  switch (command) {
    case 'turn':
      return event(`Turn ${parts[2]}`, 'log-turn');
    case 'move':
      return event(`${sideActor(parts[2])} used ${parts[3]}!`, '');
    case 'switch':
    case 'drag':
    case 'replace':
      return event(`${actor(parts[2])} was sent out!`);
    case '-damage': {
      const target = sideActor(parts[2]);
      const amount = hpChangePercent === null ? '' : ` (${hpChangePercent}%)`;
      if (visibleSourceName) return event(`${target} was hurt by ${visibleSourceName}${amount}!`, 'log-damage');
      return event(`${target} took damage${amount}!`, 'log-damage');
    }
    case '-heal': {
      const target = sideActor(parts[2]);
      const amount = hpChangePercent === null ? '' : ` (${hpChangePercent}%)`;
      return event(sourceName
        ? `${target} restored HP using ${sourceName}${amount}!`
        : `${target} restored HP${amount}!`, 'log-heal');
    }
    case 'faint':
      return event(`${actor(parts[2])} fainted!`, 'log-damage');
    case 'miss':
    case '-miss':
      return event(`${sideActor(parts[2])}'s attack missed!`, 'log-miss');
    case '-status':
      if (parts[3] === 'slp') return event(`${actor(parts[2])} fell asleep!`);
      if (parts[3] === 'frz') return event(`${actor(parts[2])} was frozen solid!`);
      return event(`${actor(parts[2])} was ${statusText}!`);
    case '-curestatus':
      return event(`${actor(parts[2])} was cured of ${statusName(parts[3]).toLowerCase()}!`, 'log-heal');
    case '-cureteam':
      return event(`${actor(parts[2])}'s team was cured of its status conditions!`, 'log-heal');
    case '-boost':
      return event(`${actor(parts[2])}'s ${statName(parts[3])} rose!`, 'log-boost-up');
    case '-unboost':
      return event(`${actor(parts[2])}'s ${statName(parts[3])} fell!`, 'log-boost-down');
    case '-setboost':
      return event(`${actor(parts[2])}'s ${statName(parts[3])} changed!`);
    case '-clearboost':
    case '-clearpositiveboost':
    case '-clearnegativeboost':
      return event(`${actor(parts[2])}'s stat changes were cleared!`);
    case '-clearallboost':
      return event('All stat changes were cleared!');
    case '-invertboost':
      return event(`${actor(parts[2])}'s stat changes were inverted!`);
    case '-swapboost':
      return event(`${actor(parts[2])} swapped stat changes!`);
    case '-copyboost':
      return event(`${actor(parts[2])} copied ${actor(parts[3])}'s stat changes!`);
    case '-weather':
      if (parts.includes('[upkeep]')) return null;
      return event(({
        none: 'The weather cleared.',
        RainDance: 'It started to rain!',
        SunnyDay: 'The sunlight turned harsh!',
        Sandstorm: 'A sandstorm kicked up!',
        Hail: 'It started to hail!',
      })[parts[2]] || `${titleCase(parts[2])} began!`);
    case '-item':
      return event(`${actor(parts[2])} obtained ${parts[3]}!`);
    case '-enditem':
      return event(`${actor(parts[2])}'s ${parts[3]} was used up!`);
    case '-ability':
      return event(`${actor(parts[2])}'s ${parts[3]} activated!`);
    case '-activate': {
      const effect = effectName(parts[3]);
      const from = actor(parts.find(part => part.startsWith('[of]'))?.slice(5));
      return event(`${from || actor(parts[2])}${from ? "'s" : ''} ${effect} activated!`);
    }
    case '-start':
      if (toId(effectName(parts[3])) === 'confusion') return event(`${actor(parts[2])} became confused!`);
      if (toId(effectName(parts[3])) === 'leechseed') return event(`${actor(parts[2])} was seeded!`);
      if (toId(effectName(parts[3])) === 'attract') return event(`${actor(parts[2])} fell in love!`);
      if (toId(effectName(parts[3])) === 'substitute') return event(`${actor(parts[2])} put in a substitute!`);
      return event(`${actor(parts[2])}: ${effectName(parts[3])} started!`);
    case '-end':
      if (toId(effectName(parts[3])) === 'confusion') return event(`${actor(parts[2])} snapped out of confusion!`);
      if (toId(effectName(parts[3])) === 'leechseed') return event(`${actor(parts[2])} was freed from Leech Seed!`);
      if (toId(effectName(parts[3])) === 'attract') return event(`${actor(parts[2])} got over its infatuation!`);
      if (toId(effectName(parts[3])) === 'substitute') return event(`${actor(parts[2])}'s substitute faded!`);
      return event(`${actor(parts[2])}: ${effectName(parts[3])} ended!`);
    case '-sidestart':
    case '-fieldstart':
      return event(`${effectName(parts[3] || parts[2] || 'An effect')} took effect!`);
    case '-sideend':
    case '-fieldend':
      return event(`${effectName(parts[3] || parts[2] || 'An effect')} wore off!`);
    case '-prepare':
      return event(`${actor(parts[2])} is preparing ${parts[3]}!`);
    case '-singleturn':
      if (toId(parts[3]) === 'movefocuspunch') {
        return event(`${actor(parts[2])} is focusing for Focus Punch!`);
      }
      return null;
    case '-block':
      return event(`${actor(parts[2])} blocked the effect!`);
    case '-hitcount':
      return event(`Hit ${parts[3] || parts[2]} times!`);
    case '-ohko':
      return event("It's a one-hit KO!", 'log-damage');
    case '-transform':
      return event(`${actor(parts[2])} transformed!`);
    case '-immune':
      return event(`${actor(parts[2])} is immune!`);
    case '-fail':
      return event(`${actor(parts[2])}'s move failed!`);
    case 'cant': {
      const target = actor(parts[2]);
      const reason = parts[3];
      if (reason === 'recharge') return event(`${target} must recharge!`);
      if (reason === 'slp') return event(`${target} is fast asleep.`);
      if (reason === 'frz') return event(`${target} is frozen solid!`);
      if (reason === 'par') return event(`${target} is paralyzed! It can't move!`);
      if (reason === 'flinch') return event(`${target} flinched!`);
      if (reason === 'confusion') return event(`${target} is confused!`);
      return event(`${target} can't move!`);
    }
    case '-crit':
      return event('A critical hit!', 'log-damage');
    case '-supereffective':
      return event("It's super effective!", 'log-damage');
    case '-resisted':
      return event("It's not very effective...", 'log-system');
    case '-hint':
      return event(parts.slice(2).join('|'));
    case '-message':
      return event(parts.slice(2).join('|'));
    case 'win':
      return event(`${parts[2]} won the battle!`, 'log-turn');
    case 'tie':
      return event('The battle ended in a draw.', 'log-turn');
    case 'start':
      return event('The battle begins!', 'log-turn');
    case 'message':
      return event(parts.slice(2).join('|'));
    default:
      return null;
  }
}

function parseHpCondition(condition) {
  const match = String(condition || '').match(/^(\d+)(?:\/(\d+))?/);
  if (!match) return null;
  return {
    hp: Number(match[1]),
    maxhp: match[2] ? Number(match[2]) : null,
  };
}

function activeHpSnapshot(battle) {
  const snapshot = new Map();
  for (const [sideId, side] of [['p1a', battle?.player], ['p2a', battle?.opponent]]) {
    const pokemon = side?.team.find(entry => entry.active);
    if (pokemon) snapshot.set(sideId, { hp: pokemon.hp, maxhp: pokemon.maxhp });
  }
  return snapshot;
}

function updateActiveHp(prefix, hp, maxhp) {
  const health = $(`#${prefix}-health`);
  const percentLabel = $(`#${prefix}-hp`);
  if (!health || !percentLabel || !maxhp) return;
  const percentage = Math.max(0, Math.min(100, hp / maxhp * 100));
  setHealthBar(health, { hp, maxhp });
  percentLabel.textContent = `${Math.round(percentage)}%`;
}

async function playPokemonCry(pokemon, sidePrefix = null) {
  if (state.sfxVolume <= 0) return;
  const number = Number(pokemon?.num);
  if (!Number.isInteger(number) || number <= 0) return;
  const expectedSpecies = toId(pokemon.species);
  if (sidePrefix && toId($(`#${sidePrefix}-sprite`).dataset.spriteSpecies) !== expectedSpecies) return;
  const audio = new Audio(`/audio/cries/${number}.ogg`);
  audio.volume = state.sfxVolume / 100;
  try {
    await audio.play();
  } catch (error) {
    if (state.cryWarningShown) return;
    state.cryWarningShown = true;
    showToast(`Could not play this Pokémon's cry: ${error.message}`);
  }
}

function wait(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

function updateHudStatus(prefix, pokemon, status) {
  if (pokemon) pokemon.status = status || '';
  const statusElement = $(`#${prefix}-status`);
  statusElement.textContent = status ? statusName(status) : '—';
  statusElement.className = `battle-status${status ? ` status-${status}` : ''}`;
  const slot = pokemon?.slot;
  if (slot === undefined) return;
  const partyId = prefix === 'player' ? 'party-list' : 'opponent-party-list';
  const dot = document.querySelector(`#${partyId} .party-dot[data-slot="${slot}"]`);
  if (!dot) return;
  dot.classList.remove('party-status-brn', 'party-status-frz', 'party-status-par', 'party-status-psn', 'party-status-slp', 'party-status-tox');
  dot.querySelector('.party-condition')?.remove();
  if (status) {
    dot.classList.add(`party-status-${status}`);
    const condition = document.createElement('span');
    condition.className = 'party-condition';
    condition.textContent = statusName(status).slice(0, 3);
    dot.append(condition);
  }
}

function updateHudVolatile(prefix, pokemon, volatile, active) {
  if (!pokemon) return;
  pokemon.volatiles ||= {};
  pokemon.volatiles[volatile] = active;
  renderBattleEffects(pokemon, $(`#${prefix}-effects`));
  if (volatile === 'leechseed') renderBattleVolatileVisuals(pokemon, prefix);
}

async function appendBattleLog(lines, battle, transitions, previousBattle, initial = false) {
  const log = $('#battle-log');
  const hpByActive = new Map(state.hpByActive);
  if (!hpByActive.size) {
    for (const [key, value] of activeHpSnapshot(previousBattle || battle)) hpByActive.set(key, value);
  }
  const stackBySide = new Map();
  const transitionBySide = new Map(transitions);
  let actionSeenThisBatch = false;
  const visibleActive = new Map([
    ['player', activePokemon(previousBattle?.player || battle.player)],
    ['opponent', activePokemon(previousBattle?.opponent || battle.opponent)],
  ]);
  const appendEvent = event => {
    if (!event) return;
    if (!/^Turn \d+$/.test(event.text)) {
      const liveRow = document.createElement('div');
      liveRow.className = `turn-event-line ${event.className}`;
      liveRow.textContent = event.text;
      const liveFeed = $('#battle-turn-message');
      liveFeed.append(liveRow);
      while (liveFeed.children.length > 4) liveFeed.firstElementChild.remove();
    }
    const row = document.createElement('div');
    row.className = `log-entry ${event.className}`;
    const text = document.createElement('span');
    text.textContent = event.text;
    row.append(text);
    log.append(row);
    log.scrollTop = log.scrollHeight;
  };
  for (let index = 0; index < lines.length; index += 1) {
    let line = lines[index];
    if (line.startsWith('|split|')) {
      const side = line.slice('|split|'.length);
      line = lines[index + (side === 'p1' ? 1 : 2)] || '';
      index += 2;
    }
    if (!line || line === '|') continue;
    if (line.startsWith('|move|')) {
      if (!line.split('|').includes('[still]')) triggerMoveVisual(line, transitionBySide.size > 0);
    }
    const parts = line.split('|');
    const command = parts[1];
    const ident = parts[2] || '';
    const activeSlot = ident.match(/^(p[12]a):/i)?.[1]?.toLowerCase();
    const sidePrefix = activeSlot === 'p1a' ? 'player' : activeSlot === 'p2a' ? 'opponent' : null;
    if (command === 'turn') {
      state.currentLogSide = null;
      for (const prefix of ['player', 'opponent']) {
        const active = visibleActive.get(prefix);
        updateHudVolatile(prefix, active, 'endure', false);
      }
    }
    if (command === 'move' && sidePrefix) {
      if (state.currentLogSide !== sidePrefix) {
        $('#battle-turn-message').replaceChildren();
        state.currentLogSide = sidePrefix;
      }
      actionSeenThisBatch = true;
    } else if (['switch', 'drag', 'replace'].includes(command) && sidePrefix &&
      !actionSeenThisBatch && state.currentLogSide !== sidePrefix) {
      $('#battle-turn-message').replaceChildren();
      state.currentLogSide = sidePrefix;
    }
    if (sidePrefix && command === '-status') {
      updateHudStatus(sidePrefix, visibleActive.get(sidePrefix), parts[3]);
    } else if (command === '-cureteam') {
      for (const prefix of sidePrefix ? [sidePrefix] : ['player', 'opponent']) {
        const active = visibleActive.get(prefix);
        if (active) updateHudStatus(prefix, active, '');
      }
    } else if (sidePrefix && command === '-curestatus') {
      updateHudStatus(sidePrefix, visibleActive.get(sidePrefix), '');
    }
    const volatileId = toId(String(parts[3] || '').replace(/^(move|ability|item):\s*/i, ''));
    if (sidePrefix && command === '-start' && volatileId === 'leechseed') {
      updateHudVolatile(sidePrefix, visibleActive.get(sidePrefix), 'leechseed', true);
    } else if (sidePrefix && command === '-end' && volatileId === 'leechseed') {
      updateHudVolatile(sidePrefix, visibleActive.get(sidePrefix), 'leechseed', false);
    } else if (sidePrefix && command === '-singleturn' && volatileId === 'endure') {
      updateHudVolatile(sidePrefix, visibleActive.get(sidePrefix), 'endure', true);
    } else if (sidePrefix && command === '-end' && volatileId === 'endure') {
      updateHudVolatile(sidePrefix, visibleActive.get(sidePrefix), 'endure', false);
    }

    let hpChangePercent = null;
    if ((command === '-damage' || command === '-heal') && activeSlot) {
      const currentHp = parseHpCondition(parts[3]);
      const previous = hpByActive.get(activeSlot);
      if (currentHp && previous) {
        const maxhp = currentHp.maxhp || previous.maxhp;
        const delta = command === '-damage' ? previous.hp - currentHp.hp : currentHp.hp - previous.hp;
        if (maxhp > 0 && delta > 0) {
          hpChangePercent = Math.max(1, Math.round(delta * 100 / maxhp));
          const side = activeSlot.startsWith('p1') ? 'player' : 'opponent';
          const stack = stackBySide.get(side) || 0;
          stackBySide.set(side, stack + 1);
          showFloatingHpChange(side, hpChangePercent, command === '-heal', stack);
          updateActiveHp(side, currentHp.hp, maxhp);
        }
        hpByActive.set(activeSlot, { hp: currentHp.hp, maxhp });
      }
    }

    const event = getBattleLine(line, hpChangePercent);
    if ((command === '-prepare' || (command === '-singleturn' && toId(parts[3]) === 'movefocuspunch')) && sidePrefix) {
      const stack = stackBySide.get(sidePrefix) || 0;
      triggerMovePreparation(line, sidePrefix, stack);
      stackBySide.set(sidePrefix, stack + 1);
    }
    if ((command === 'miss' || command === '-miss' || command === '-fail' || command === 'cant' || command === '-block') && sidePrefix) {
      const stack = stackBySide.get(sidePrefix) || 0;
      const labels = {
        miss: 'MISS!',
        '-miss': 'MISS!',
        '-fail': 'FAILED!',
        '-block': 'BLOCKED!',
        cant: ({
          flinch: 'FLINCHED!',
          slp: 'ASLEEP!',
          frz: 'FROZEN!',
          par: 'PARALYZED!',
          confusion: 'CONFUSED!',
          recharge: 'RECHARGING!',
        })[parts[3]] || "CAN'T MOVE!",
      };
      const className = command === 'miss' || command === '-miss' ? 'float-miss' : command === 'cant' ? 'float-cant' : 'float-fail';
      showFloatingBattleText(sidePrefix, labels[command], className, stack);
      stackBySide.set(sidePrefix, stack + 1);
    }
    if (command === '-crit' && sidePrefix) {
      const stack = stackBySide.get(sidePrefix) || 0;
      showFloatingBattleText(sidePrefix, 'CRITICAL HIT!', 'float-critical', stack);
      stackBySide.set(sidePrefix, stack + 1);
    }
    if ((command === '-ability' || command === '-activate') && sidePrefix) {
      const abilityName = command === '-ability'
        ? parts[3]
        : parts.find(part => /^\[from\] ability:/i.test(part))?.replace(/^\[from\] ability:\s*/i, '');
      if (abilityName) {
        const stack = stackBySide.get(sidePrefix) || 0;
        showFloatingBattleText(sidePrefix, `${abilityName.toUpperCase()}!`, 'float-ability', stack);
        stackBySide.set(sidePrefix, stack + 1);
      }
    }
    if (command === '-immune' && sidePrefix) showFloatingBattleText(sidePrefix, 'IMMUNE', 'float-immune');
    if (command === 'faint' && sidePrefix) {
      appendEvent(event);
      const faintedPokemon = visibleActive.get(sidePrefix);
      if (faintedPokemon) void playPokemonCry(faintedPokemon, sidePrefix);
      await playBattleExit(sidePrefix, true);
      continue;
    }

    if ((command === 'switch' || command === 'drag' || command === 'replace') && sidePrefix) {
      const transition = transitionBySide.get(sidePrefix);
      if (!initial && transition?.changed && !transition.fainted) {
        await playBattleExit(sidePrefix, false);
      }

      const side = sidePrefix === 'player' ? battle.player : battle.opponent;
      const switchSpecies = toId((parts[3] || '').split(',')[0]);
      const switchIdent = toId(ident.replace(/^p[12][a-z]?:\s*/i, ''));
      const entrant = side.team.find(mon => toId(mon.name) === switchIdent) ||
        side.team.find(mon => toId(mon.species) === switchSpecies) || activePokemon(side);
      if (entrant) {
        renderSide(side, entrant, sidePrefix);
        visibleActive.set(sidePrefix, entrant);
        const currentHp = parseHpCondition(parts[4]);
        if (currentHp) {
          const maxhp = currentHp.maxhp || entrant.maxhp;
          hpByActive.set(activeSlot, { hp: currentHp.hp, maxhp });
          updateActiveHp(sidePrefix, currentHp.hp, maxhp);
        }
      }
      appendEvent(event);
      if (entrant) {
        const entrantId = toId(entrant.species);
        setTimeout(() => {
          if (toId($(`#${sidePrefix}-sprite`).dataset.spriteSpecies) === entrantId) void playPokemonCry(entrant, sidePrefix);
        }, 420);
        await playBattleEntry(sidePrefix);
      }
      continue;
    }

    appendEvent(event);
    if (command === 'move') await wait(720);
    else if (command === '-damage' || command === '-heal') await wait(480);
    else if (event && state.currentLogSide && !/^Turn \d+$/.test(event.text)) await wait(180);
  }
  for (const [key, value] of activeHpSnapshot(battle)) hpByActive.set(key, value);
  state.hpByActive = hpByActive;
  clearBattleMoveEffects();
}

function renderActions(battle) {
  const container = $('#action-buttons');
  const heading = $('#action-heading');
  container.replaceChildren();
  const actions = battle.player.actions;
  if (battle.ended) {
    heading.hidden = true;
    return;
  }
  heading.hidden = false;
  const forcedSwitch = actions.kind === 'switch';
  $('#action-heading span:last-child').textContent = forcedSwitch ? 'CHOOSE A POKÉMON' : 'CHOOSE AN ACTION';
  if (actions.kind === 'move') {
    actions.moves.forEach((move, index) => {
      const data = state.movesById.get(move.id);
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'action-button';
      button.disabled = move.disabled || state.busy;
      const copy = document.createElement('span');
      copy.className = 'action-copy';
      const name = document.createElement('span');
      name.className = 'action-name';
      name.textContent = move.name;
      const detail = document.createElement('span');
      detail.className = 'action-description';
      detail.textContent = `${move.pp ?? data?.pp ?? '—'} PP`;
      copy.append(name, detail);
      const type = document.createElement('span');
      type.className = 'action-type';
      type.textContent = data?.type.toUpperCase() || 'MOVE';
      type.style.color = TYPE_COLORS[data?.type] || '';
      button.append(copy);
      if (data) button.append(createCategoryIcon(data.category));
      button.append(type);
      if (data) button.append(createMoveTooltip(data, state.battle?.opponent.team.find(pokemon => pokemon.active)));
      button.classList.add('move-action');
      button.setAttribute('aria-label', `${move.name}; ${describeMove(data, state.battle?.opponent.team.find(pokemon => pokemon.active))}`);
      button.addEventListener('click', () => submitChoice(`move ${index + 1}`));
      container.append(button);
    });
  } else if (actions.kind === 'switch') {
    const prompt = document.createElement('div');
    prompt.className = 'switch-prompt';
    prompt.textContent = 'Choose a Pokémon from your party above to send it out.';
    container.append(prompt);
  } else {
    const waiting = document.createElement('div');
    waiting.className = 'log-entry log-system';
    waiting.textContent = 'Waiting for the next turn...';
    container.append(waiting);
  }
}

function createCategoryIcon(category) {
  const label = titleCase(String(category || 'status'));
  const icon = document.createElement('span');
  icon.className = `move-category-icon category-${label.toLowerCase()}`;
  const image = document.createElement('img');
  image.src = `https://play.pokemonshowdown.com/sprites/categories/${label}.png`;
  image.alt = '';
  image.setAttribute('aria-hidden', 'true');
  image.onerror = () => { image.hidden = true; };
  icon.setAttribute('role', 'img');
  icon.setAttribute('aria-label', `${label} move`);
  icon.title = `${label} move`;
  icon.append(image);
  return icon;
}

function moveEffectiveness(move, target) {
  if (!target?.revealed || !target.types?.length || move.category === 'Status') return null;
  const chart = state.dex.typeChart[move.type];
  if (!chart) return null;
  return target.types.reduce((multiplier, defendingType) => multiplier * (chart[defendingType] ?? 1), 1);
}

function effectivenessLabel(multiplier) {
  if (multiplier === null) return '—';
  if (multiplier === 0) return 'No effect';
  if (multiplier > 1) return `${multiplier}× · Super effective`;
  if (multiplier < 1) return `${multiplier}× · Not very effective`;
  return '1× · Normal effectiveness';
}

function describeMove(move, target) {
  if (!move) return 'Move details are unavailable.';
  const power = move.category === 'Status' ? '—' : (move.power || '—');
  const accuracy = move.accuracy === true ? '—' : `${move.accuracy}%`;
  const description = move.desc || move.shortDesc || 'No additional effect.';
  return `${move.type}-type ${move.category.toLowerCase()} move; Power ${power}; Accuracy ${accuracy}; Effectiveness ${effectivenessLabel(moveEffectiveness(move, target))}. ${description}`;
}

function createMoveTooltip(move, target) {
  const tooltip = document.createElement('span');
  tooltip.className = 'move-tooltip';
  tooltip.setAttribute('role', 'tooltip');
  const heading = document.createElement('span');
  heading.className = 'move-tooltip-heading';
  heading.textContent = move.name;
  const type = document.createElement('span');
  type.className = 'move-tooltip-type';
  type.textContent = `${move.type} · ${move.category}`;
  type.style.color = TYPE_COLORS[move.type] || '';
  const stats = document.createElement('span');
  stats.className = 'move-tooltip-stats';
  for (const [label, value] of [
    ['BP', move.category === 'Status' ? '—' : (move.power || '—')],
    ['ACCURACY', move.accuracy === true ? '—' : `${move.accuracy}%`],
    ['EFFECTIVENESS', effectivenessLabel(moveEffectiveness(move, target))],
  ]) {
    const stat = document.createElement('span');
    stat.textContent = `${label} ${value}`;
    stats.append(stat);
  }
  const description = document.createElement('span');
  description.className = 'move-tooltip-description';
  description.textContent = move.desc || move.shortDesc || 'No additional effect.';
  tooltip.append(heading, type, stats, description);
  return tooltip;
}

function activeTransition(previousSide, nextSide) {
  if (!previousSide || !nextSide) return null;
  const outgoing = activePokemon(previousSide);
  const incoming = activePokemon(nextSide);
  if (!outgoing || !incoming) return null;
  const outgoingId = outgoing.slot ?? `${toId(outgoing.species)}:${toId(outgoing.name)}`;
  const incomingId = incoming.slot ?? `${toId(incoming.species)}:${toId(incoming.name)}`;
  const updatedOutgoing = outgoing.slot !== undefined
    ? nextSide.team.find(pokemon => pokemon.slot === outgoing.slot)
    : nextSide.team.find(pokemon => toId(pokemon.species) === toId(outgoing.species) && toId(pokemon.name) === toId(outgoing.name));
  const fainted = Boolean(updatedOutgoing?.fainted || updatedOutgoing?.hp <= 0);
  const changed = outgoingId !== incomingId;
  const newlyFainted = fainted && !outgoing.fainted;
  if (!changed && !newlyFainted) return null;
  return {
    fainted,
    exit: changed || newlyFainted,
    changed,
  };
}

function playBattleExit(prefix, fainted) {
  const sprite = $(`#${prefix}-sprite`);
  const shadow = $(`#${prefix}-shadow`);
  resetBattleSpriteMotion(sprite);
  clearBattleMoveEffects();
  sprite.classList.remove('pokemon-entering');
  sprite.classList.add(fainted ? 'fainting' : 'recalling');
  if (fainted) shadow.classList.add('fainting-shadow');
  const duration = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 30 : (fainted ? 680 : 420);
  return new Promise(resolve => setTimeout(resolve, duration));
}

function playBattleEntry(prefix) {
  const sprite = $(`#${prefix}-sprite`);
  const side = sprite.closest('.battle-side');
  resetBattleSpriteMotion(sprite);
  const ball = document.createElement('span');
  ball.className = 'pokeball-throw';
  ball.setAttribute('aria-hidden', 'true');
  side.querySelector('.pokeball-throw')?.remove();
  sprite.classList.remove('fainting', 'recalling', 'pokemon-entering');
  sprite.hidden = false;
  const sideRect = side.getBoundingClientRect();
  const spriteRect = sprite.getBoundingClientRect();
  const spriteCenterX = spriteRect.left + spriteRect.width / 2;
  ball.style.left = `${spriteCenterX - sideRect.left - 12.5}px`;
  ball.style.right = 'auto';
  ball.style.top = `${spriteRect.top + spriteRect.height / 2 - sideRect.top}px`;
  sprite.classList.add('pokemon-entering');
  side.append(ball);
  ball.addEventListener('animationend', () => ball.remove(), { once: true });
  const finishEntry = event => {
    if (event.animationName !== 'pokemon-pop-in') return;
    sprite.classList.remove('pokemon-entering');
    sprite.removeEventListener('animationend', finishEntry);
  };
  sprite.addEventListener('animationend', finishEntry);
  return wait(window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 35 : 1320);
}

async function renderBattle(battle, initial = false) {
  const previous = state.battle;
  const transitions = initial ? [] : [
    ['player', activeTransition(previous?.player, battle.player)],
    ['opponent', activeTransition(previous?.opponent, battle.opponent)],
  ].filter(([, transition]) => transition);
  if (initial) {
    document.body.classList.add('battle-view-active');
    state.hpByActive = new Map();
    state.battle = battle;
    renderFieldState(battle.field);
    $('#opponent-name').textContent = battle.opponent.name.toUpperCase();
    $('#turn-number').textContent = String(Math.max(1, battle.turn)).padStart(2, '0');
    renderSide(battle.player, activePokemon(battle.player), 'player');
    renderSide(battle.opponent, activePokemon(battle.opponent), 'opponent');
    $('#player-sprite').hidden = true;
    $('#opponent-sprite').hidden = true;
    renderParty(battle.player.team, $('#party-list'));
    renderParty(battle.opponent.team, $('#opponent-party-list'), true);
    $('#battle-screen').hidden = false;
    $('#builder-screen').hidden = true;
    startBattleMusic();
  }
  await appendBattleLog(battle.log, battle, transitions, initial ? null : previous, initial);
  state.battle = battle;
  renderFieldState(battle.field);
  $('#opponent-name').textContent = battle.opponent.name.toUpperCase();
  $('#turn-number').textContent = String(Math.max(1, battle.turn)).padStart(2, '0');
  renderSide(battle.player, activePokemon(battle.player), 'player');
  renderSide(battle.opponent, activePokemon(battle.opponent), 'opponent');
  positionBattleFieldVisualsAll();
  renderParty(battle.player.team, $('#party-list'));
  renderParty(battle.opponent.team, $('#opponent-party-list'), true);
  renderActions(battle);
  if (battle.ended) finishBattle(battle);
}

function loadRunHistory() {
  try { return JSON.parse(localStorage.getItem(`tower-history-${state.facility}`) || '[]'); }
  catch { return []; }
}

function renderHistory() {
  const container = $('#history-list');
  container.replaceChildren();
  const runs = loadRunHistory();
  if (!runs.length) {
    const empty = document.createElement('p');
    empty.className = 'history-empty';
    empty.textContent = 'No completed runs yet. Local records appear here after a run ends.';
    container.append(empty);
    return;
  }
  for (const run of runs) {
    const card = document.createElement('article'); card.className = 'history-run';
    const heading = document.createElement('div'); heading.className = 'history-run-heading';
    const floor = document.createElement('b'); floor.textContent = `FLOOR ${run.floor}`;
    const date = document.createElement('span'); date.textContent = new Date(run.date).toLocaleDateString();
    heading.append(floor, date);
    const party = document.createElement('div'); party.className = 'history-team';
    for (const mon of run.team) {
      const item = document.createElement('div'); item.className = 'history-pokemon';
      const img = document.createElement('img'); img.src = `/sprites/gen5/gen5ani/${toId(mon.species)}.gif`; img.alt = '';
      const details = document.createElement('div');
      const name = document.createElement('b'); name.textContent = mon.species;
      const heldItem = document.createElement('span'); heldItem.textContent = mon.item || 'No item';
      const moves = document.createElement('small'); moves.textContent = mon.moves.join(' · ');
      details.append(name, heldItem, moves); item.append(img, details); party.append(item);
    }
    card.append(heading, party); container.append(card);
  }
}

async function changeFacility(facility) {
  const previousFacility = state.facility;
  try { localStorage.setItem(`tower-team-${previousFacility}`, JSON.stringify(state.team)); } catch { }
  if (facility !== previousFacility) {
    saveFacilityStreak(previousFacility, state.streak);
    state.streak = loadFacilityStreak(facility);
  }
  state.facility = facility;
  localStorage.setItem('tower-facility', facility);
  $('#floor-number').textContent = String(state.streak + 1).padStart(2, '0');
  $('#dex-label').textContent = facility === 'little-cup' ? 'LITTLE CUP' : facility === 'randoms' ? 'RANDOMS' : 'DEX';
  $('#start-battle .button-label').textContent = facility === 'little-cup' ? 'ENTER LITTLE CUP' : facility === 'randoms' ? 'ENTER RANDOMS TOWER' : 'ENTER THE TOWER';
  document.querySelector('.builder-grid').hidden = facility === 'randoms';
  $('#random-facility-note').hidden = facility !== 'randoms';
  $('.page-heading').hidden = facility === 'randoms';
  $('.mechanics-note').hidden = facility === 'randoms';
  $('#team-tab').textContent = facility === 'randoms' ? 'RANDOM BATTLE' : 'TEAM BUILDER';
  $('#team-tab').hidden = facility === 'randoms';
  const levelLabel = facility === 'little-cup' ? 'LEVEL 5' : 'LEVEL 50';
  $('#rule-level').textContent = levelLabel;
  $('#team-rule-level').textContent = levelLabel;
  $('#log-level').textContent = levelLabel;
  document.querySelectorAll('[data-facility]').forEach(button => {
    button.classList.toggle('selected', button.dataset.facility === facility);
    button.setAttribute('aria-pressed', String(button.dataset.facility === facility));
  });
  if (facility === 'little-cup') {
    let savedLittleCup = null;
    try { savedLittleCup = JSON.parse(localStorage.getItem('tower-team-little-cup') || 'null'); } catch { }
    if (Array.isArray(savedLittleCup) && savedLittleCup.length === 6 && savedLittleCup.every(mon => state.speciesById.get(toId(mon.species))?.tier === 'LC')) {
      state.team = ensureTeamDefaults(savedLittleCup);
    } else {
      const eligible = state.dex.species.filter(species => species.tier === 'LC').slice(0, 6);
      state.team = await Promise.all(eligible.map(async species => {
        const learnset = await loadLearnset(species, 5);
        return {
          species: species.name, name: '', item: '', ability: species.abilities[0], level: 5, nature: 'Serious', evs: {},
          ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 }, moves: learnset.slice(0, 4).map(move => move.name)
        };
      }));
    }
  } else if (facility === 'randoms') {
    state.team = [];
  } else {
    let savedTower = null;
    try { savedTower = JSON.parse(localStorage.getItem('tower-team-tower') || localStorage.getItem('tower-team') || 'null'); } catch { }
    state.team = ensureTeamDefaults(Array.isArray(savedTower) && savedTower.length === 6 ? savedTower : clone(SAMPLE_TEAM));
  }
  state.selected = 0;
  if (facility === 'randoms') {
    try { localStorage.setItem('tower-facility', facility); } catch { }
    renderRoster();
  } else {
    persistTeam(); renderRoster(); await renderEditor(); renderSpeciesOptions();
  }
}

function finishBattle(battle) {
  stopBattleMusic();
  const didWin = battle.winner === battle.player.name;
  if (didWin) {
    state.streak += 1;
    saveFacilityStreak(state.facility, state.streak);
  } else {
    const runs = loadRunHistory();
    runs.unshift({
      date: new Date().toISOString(), floor: state.streak + 1,
      team: state.team.map(mon => ({ species: getSpecies(mon)?.name || mon.species, item: mon.item || '', moves: (mon.moves || []).slice(0, 4) }))
    });
    localStorage.setItem(`tower-history-${state.facility}`, JSON.stringify(runs.slice(0, 50)));
    state.streak = 0;
    saveFacilityStreak(state.facility, 0);
  }
  $('#floor-number').textContent = String(didWin ? state.streak : 1).padStart(2, '0');
  $('#battle-result').hidden = false;
  $('#result-title').textContent = didWin ? 'Floor cleared!' : 'Run ended.';
  $('#result-title').style.color = didWin ? 'var(--acid)' : 'var(--coral)';
  $('#result-subtitle').textContent = didWin ? `Floor ${state.streak} cleared.` : 'Try again from Floor 1? Your run will restart at the beginning.';
  $('#next-battle .button-label').textContent = didWin ? 'NEXT FLOOR' : 'RESTART FROM FLOOR 1';
  $('#action-heading').hidden = true;
  $('#action-buttons').replaceChildren();
}

async function startBattle() {
  if (state.busy) return;
  state.busy = true;
  const button = $('#start-battle');
  button.disabled = true;
  button.querySelector('.button-label').textContent = 'PREPARING TEAM...';
  setBattleLoading(true);
  try {
    prepareBattleTheme();
    const error = state.facility === 'randoms';
    $('#builder-error').hidden = !error;
    $('#builder-error').textContent = error || '';
    if (error) {
      stopBattleMusic();
      return;
    }

    const battle = await api('/api/battles', {
      method: 'POST',
      body: JSON.stringify({ team: state.team, facility: state.facility }),
    });
    if (state.facility === 'randoms') {
      state.team = battle.player.team.map(mon => ({
        species: mon.species, name: '', level: 50, item: mon.item,
        ability: mon.ability, nature: mon.nature, moves: (mon.moves || []).map(move => move.name), evs: {},
        ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 }, shiny: mon.shiny
      }));
      renderRoster();
    }
    setBattleLoading(false);
    $('#battle-log').replaceChildren();
    state.currentLogSide = null;
    $('#battle-turn-message').replaceChildren();
    $('#battle-result').hidden = true;
    $('#floor-number').textContent = String(state.streak + 1).padStart(2, '0');
    await renderBattle(battle, true);
  } catch (requestError) {
    stopBattleMusic();
    $('#builder-error').textContent = requestError.message;
    $('#builder-error').hidden = false;
  } finally {
    setBattleLoading(false);
    state.busy = false;
    button.disabled = false;
    button.querySelector('.button-label').textContent = state.facility === 'little-cup' ? 'ENTER LITTLE CUP' : state.facility === 'randoms' ? 'ENTER RANDOMS TOWER' : 'ENTER THE TOWER';
    if (state.battle) {
      renderActions(state.battle);
      renderParty(state.battle.player.team, $('#party-list'));
      renderParty(state.battle.opponent.team, $('#opponent-party-list'), true);
    }
  }
}

async function submitChoice(choice) {
  if (!state.battle || state.busy) return;
  state.busy = true;
  let turnResolved = false;
  renderActions(state.battle);
  try {
    const result = await api(`/api/battles/${state.battle.id}`, {
      method: 'POST',
      body: JSON.stringify({ choice }),
    });
    await renderBattle(result);
    turnResolved = true;
  } catch (error) {
    showToast(error.message);
    renderActions(state.battle);
  } finally {
    state.busy = false;
    if (state.battle) {
      renderActions(state.battle);
      renderParty(state.battle.player.team, $('#party-list'));
      renderParty(state.battle.opponent.team, $('#opponent-party-list'), true);
      if (turnResolved && !state.battle.ended && state.battle.player.actions?.kind !== 'switch') {
        state.currentLogSide = null;
        $('#battle-turn-message').replaceChildren();
      }
    }
  }
}

function bindBattleEvents() {
  $('#start-battle').addEventListener('click', startBattle);
  const settingsDialog = $('#settings-dialog');
  $('#settings-button').addEventListener('click', () => settingsDialog.showModal());
  $('#settings-close').addEventListener('click', () => settingsDialog.close());
  settingsDialog.addEventListener('click', event => {
    if (event.target === settingsDialog) settingsDialog.close();
  });
  const sfxVolume = $('#sfx-volume');
  sfxVolume.value = String(state.sfxVolume);
  $('#sfx-volume-value').value = `${state.sfxVolume}%`;
  $('#sfx-volume-value').textContent = `${state.sfxVolume}%`;
  sfxVolume.addEventListener('input', () => setSfxVolume(sfxVolume.value));
  const musicVolume = $('#music-volume');
  musicVolume.value = String(state.musicVolume);
  $('#music-volume-value').value = `${state.musicVolume}%`;
  $('#music-volume-value').textContent = `${state.musicVolume}%`;
  musicVolume.addEventListener('input', () => setMusicVolume(musicVolume.value));
  const leaveDialog = $('#leave-confirmation');
  $('#back-to-team').addEventListener('click', () => {
    leaveDialog.returnValue = '';
    leaveDialog.showModal();
  });
  $('#stay-in-battle').addEventListener('click', () => leaveDialog.close());
  $('#confirm-leave-run').addEventListener('click', () => {
    leaveDialog.close();
    document.body.classList.remove('battle-view-active');
    stopBattleMusic();
    $('#battle-screen').hidden = true;
    $('#builder-screen').hidden = false;
  });
  leaveDialog.addEventListener('click', event => {
    if (event.target === leaveDialog) leaveDialog.close();
  });
  $('#next-battle').addEventListener('click', startBattle);
  document.querySelectorAll('[data-facility]').forEach(button => button.addEventListener('click', async () => {
    try { await changeFacility(button.dataset.facility); setBuilderView(false); }
    catch (error) { showToast(error.message); }
  }));
  document.querySelectorAll('[data-facility]').forEach(button => {
    const selected = button.dataset.facility === state.facility;
    button.classList.toggle('selected', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
  const setBuilderView = history => {
    const isRandoms = state.facility === 'randoms';
    $('#history-screen').hidden = !history;
    $('#team-tab').hidden = isRandoms;
    document.querySelector('.builder-grid').hidden = history || isRandoms;
    document.querySelector('.page-heading').hidden = isRandoms;
    $('#random-facility-note').hidden = !isRandoms || history;
    $('.mechanics-note').hidden = isRandoms;
    document.querySelector('.builder-bottom').hidden = history;
    $('#builder-error').hidden = true
    $('#team-tab').classList.toggle('active', !history);
    $('#history-tab').classList.toggle('active', history);
    if (history) renderHistory();
  };
  $('#team-tab').addEventListener('click', () => setBuilderView(false));
  $('#history-tab').addEventListener('click', () => setBuilderView(true));
  $('#clear-history').addEventListener('click', () => { localStorage.removeItem(`tower-history-${state.facility}`); renderHistory(); });
}

async function initialize() {
  try {
    state.dex = await api('/api/dex');
    state.speciesById = new Map(state.dex.species.map(species => [species.id, species]));
    state.movesById = new Map(state.dex.moves.map(move => [move.id, move]));
    populateSpeciesPicker();

    let savedTeam = null;
    try {
      savedTeam = JSON.parse(localStorage.getItem(`tower-team-${state.facility}`) || localStorage.getItem('tower-team') || 'null');
    } catch {
      showToast('The saved team could not be read. Loading the sample team instead.');
    }
    state.team = ensureTeamDefaults(Array.isArray(savedTeam) && savedTeam.length === 6 ? savedTeam : clone(SAMPLE_TEAM));
    renderRoster();
    bindEditorEvents();
    bindBattleEvents();
    await renderEditor();
    $('#dex-label').textContent = state.facility === 'little-cup' ? 'LITTLE CUP' : 'DEX';
    const initialLevelLabel = state.facility === 'little-cup' ? 'LEVEL 5' : 'LEVEL 50';
    $('#rule-level').textContent = initialLevelLabel;
    $('#team-rule-level').textContent = initialLevelLabel;
    $('#log-level').textContent = initialLevelLabel;
    if (state.facility !== 'tower') await changeFacility(state.facility);
    $('#floor-number').textContent = String(state.streak + 1).padStart(2, '0');
    $('#start-battle').disabled = false;
    $('#builder-error').hidden = true;
  } catch (error) {
    $('#builder-error').textContent = `The simulator could not load its Generation 3 data: ${error.message}`;
    $('#builder-error').hidden = false;
    $('#start-battle').disabled = true;
  }
}

initialize();
