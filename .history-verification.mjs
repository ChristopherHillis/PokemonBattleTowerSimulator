import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

class Node {
  constructor(tag = 'div') { this.tagName = tag; this.children = []; this.style = {}; this.hidden = false; this.textContent = ''; }
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.children = [...nodes]; }
}

const source = await readFile(new URL('./public/app.js', import.meta.url), 'utf8');
const extract = (start, end) => source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)));
const helpers = extract('function parseFloorStreak(value) {', '\nconst savedFacility =');
const loadRunHistory = extract('function loadRunHistory() {', '\nfunction renderHistory');
const renderHistory = extract('function renderHistory() {', '\nasync function changeFacility');
const finishBattle = extract('function finishBattle(battle) {', '\nasync function startBattle()');
const storage = new Map();
const selectors = [
  '#battle-result', '#result-title', '#result-subtitle', '#next-battle .button-label',
  '#floor-number', '#action-heading', '#action-buttons', '#history-list',
];
const nodes = new Map(selectors.map(selector => [selector, new Node()]));
const baseTeam = Array.from({ length: 6 }, (_, index) => ({
  species: `Species${index + 1}`, item: `Item${index + 1}`,
  moves: [`Move${index + 1}A`, `Move${index + 1}B`],
}));
const context = vm.createContext({
  state: { facility: 'tower', streak: 2, team: baseTeam },
  localStorage: {
    getItem(key) { return storage.get(key) ?? null; },
    setItem(key, value) { storage.set(key, String(value)); },
  },
  $: selector => nodes.get(selector),
  stopBattleMusic() {},
  getSpecies(mon) { return { name: mon.species }; },
  toId(value) { return String(value).toLowerCase().replace(/[^a-z0-9]+/g, ''); },
  document: { createElement(tag) { return new Node(tag); } },
  Date,
});
vm.runInContext(`${helpers}\n${loadRunHistory}\n${renderHistory}\n${finishBattle}`, context);

context.saveFacilityStreak('tower', 3);
context.saveFacilityStreak('little-cup', 5);
assert.equal(context.loadFacilityStreak('tower'), 3);
assert.equal(context.loadFacilityStreak('little-cup'), 5);
assert.equal(context.loadFacilityStreak('randoms'), 0, 'facility streaks do not leak across facilities');
assert.equal(storage.get('tower-streak'), '3', 'the legacy Tower streak remains synchronized');

context.state.facility = 'tower';
context.state.streak = 2;
context.finishBattle({ winner: 'Player', player: { name: 'Player' } });
assert.equal(context.state.streak, 3, 'a win advances the cleared-floor count');
assert.equal(storage.has('tower-history-tower'), false, 'an ongoing run is not recorded as completed');
context.finishBattle({ winner: 'Trainer', player: { name: 'Player' } });
const towerHistory = JSON.parse(storage.get('tower-history-tower'));
assert.equal(towerHistory[0].floor, 4, 'Tower records the floor reached');
assert.equal(towerHistory[0].team.length, 6);
assert.deepEqual(towerHistory[0].team[0], { species: 'Species1', item: 'Item1', moves: ['Move1A', 'Move1B'] });
assert.equal(context.state.streak, 0, 'a loss resets only the current facility streak');
assert.equal(storage.get('tower-streak-tower'), '0');

for (const [facility, floor] of [['little-cup', 5], ['randoms', 2]]) {
  context.state.facility = facility;
  context.state.streak = floor - 1;
  context.state.team = baseTeam.map((mon, index) => ({
    ...mon, species: `${facility}-${mon.species}`, moves: [`${facility}-Move${index + 1}`],
  }));
  context.finishBattle({ winner: 'Trainer', player: { name: 'Player' } });
  const history = JSON.parse(storage.get(`tower-history-${facility}`));
  assert.equal(history[0].floor, floor, `${facility} records its floor`);
  assert.equal(history[0].team[0].moves[0], `${facility}-Move1`, `${facility} records team moves`);
}

context.state.facility = 'tower';
context.renderHistory();
const textContent = node => [node.textContent, ...node.children.map(textContent)].join(' ');
const rendered = textContent(nodes.get('#history-list'));
for (const value of ['FLOOR 4', 'Species1', 'Item1', 'Move1A', 'Move1B']) {
  assert.ok(rendered.includes(value), `history UI shows ${value}`);
}

console.log('PASS: Tower, Little Cup, and Randoms record floor/team/items/moves; streaks stay facility-specific; Tower history renders the recorded details.');
