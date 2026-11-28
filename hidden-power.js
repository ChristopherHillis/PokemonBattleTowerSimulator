// Gen 3 Hidden Power helpers (no dependencies, so they can be unit-tested).
//
// In Gen 3 a Pokémon's Hidden Power type and power are NOT stored on the move.
// They are derived from the six IVs:
//   type  = HP_TYPE_ORDER[ floor(typeBits * 15 / 63) ]  where bit i = (iv % 2)
//   power = floor(powerBits * 40 / 63) + 30             where bit i = ((iv >> 1) % 2)
// with the stats taken in the order HP, Atk, Def, Spe, SpA, SpD.
// So "all Hidden Powers selectable" really means "selecting a type must also
// set IVs that produce that type", and "validating" means checking that the
// IVs and the chosen type agree.

export const HP_TYPE_ORDER = [
    'Fighting', 'Flying', 'Poison', 'Ground', 'Rock', 'Bug', 'Ghost', 'Steel',
    'Fire', 'Water', 'Grass', 'Electric', 'Psychic', 'Ice', 'Dragon', 'Dark',
];
export const HP_STAT_ORDER = ['hp', 'atk', 'def', 'spe', 'spa', 'spd'];
export const ALL_MAX_IVS = Object.freeze({ hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 });

// Gen 3 splits physical/special by TYPE, not by move.
export const PHYSICAL_TYPES_GEN3 = new Set([
    'Normal', 'Fighting', 'Flying', 'Poison', 'Ground', 'Rock', 'Bug', 'Ghost', 'Steel',
]);

// Canonical max-power (70) IV spreads. Every other stat stays at 31.
export const HP_PRESET_IVS = Object.freeze({
    Bug: { atk: 30, def: 30, spd: 30 },
    Dark: {},
    Dragon: { atk: 30 },
    Electric: { spa: 30 },
    Fighting: { def: 30, spa: 30, spd: 30, spe: 30 },
    Fire: { atk: 30, spa: 30, spe: 30 },
    Flying: { hp: 30, atk: 30, def: 30, spa: 30, spd: 30 },
    Ghost: { def: 30, spd: 30 },
    Grass: { atk: 30, spa: 30 },
    Ground: { spa: 30, spd: 30 },
    Ice: { atk: 30, def: 30 },
    Poison: { def: 30, spa: 30, spd: 30 },
    Psychic: { atk: 30, spe: 30 },
    Rock: { def: 30, spd: 30, spe: 30 },
    Steel: { spd: 30 },
    Water: { atk: 30, def: 30, spa: 30 },
});

const toId = text => String(text ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

export function getHiddenPower(ivs = {}) {
    let typeBits = 0;
    let powerBits = 0;
    HP_STAT_ORDER.forEach((stat, i) => {
        const iv = Number.isInteger(ivs?.[stat]) ? ivs[stat] : 31;
        typeBits += (iv % 2) << i;
        powerBits += ((iv >> 1) % 2) << i;
    });
    return {
        type: HP_TYPE_ORDER[Math.floor((typeBits * 15) / 63)],
        power: Math.floor((powerBits * 40) / 63) + 30,
    };
}

export function hiddenPowerIvsFor(type) {
    return { ...ALL_MAX_IVS, ...(HP_PRESET_IVS[type] || {}) };
}

// 'Hidden Power Fire' -> 'Fire'   'Hidden Power' -> null (type comes from IVs)
// 'Hidden Power Normal' -> false  (not a real Hidden Power type)
// 'Earthquake' -> undefined       (not Hidden Power at all)
export function hiddenPowerTypeOfMove(moveName) {
    const id = toId(moveName);
    if (!id.startsWith('hiddenpower')) return undefined;
    const suffix = id.slice('hiddenpower'.length).replace(/\d+$/, '');
    if (!suffix) return null;
    return HP_TYPE_ORDER.find(type => toId(type) === suffix) || false;
}

export function describeHiddenPowerIvs(type) {
    const parts = Object.entries(hiddenPowerIvsFor(type))
        .filter(([, value]) => value !== 31)
        .map(([stat, value]) => `${stat.toUpperCase()} ${value}`);
    return parts.length ? parts.join(', ') : 'all 31';
}

// Makes a set's Hidden Power move and IVs agree (used for AI-generated sets).
//  - 'Hidden Power Ice'      -> keep the type, fix the IVs if they don't produce Ice
//  - generic 'Hidden Power'  -> use the type the set's own IVs already give, or,
//                               with randomizeGeneric, pick a type the species
//                               doesn't already have as STAB.
// Returns false if the set has an unusable Hidden Power move.
export function applyHiddenPowerToSet(set, {
    speciesTypes = [], randomizeGeneric = false, random = Math.random,
} = {}) {
    const index = set.moves.findIndex(move => hiddenPowerTypeOfMove(move) !== undefined);
    if (index === -1) return true;
    let type = hiddenPowerTypeOfMove(set.moves[index]);
    if (type === false) return false;
    if (type === null) {
        if (randomizeGeneric) {
            const choices = HP_TYPE_ORDER.filter(candidate => !speciesTypes.includes(candidate));
            type = choices[Math.floor(random() * choices.length)];
        } else {
            type = getHiddenPower(set.ivs).type;
        }
    }
    set.moves[index] = `Hidden Power ${type}`;
    if (getHiddenPower(set.ivs).type !== type) set.ivs = hiddenPowerIvsFor(type);
    return true;
}