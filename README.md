# Gen 3 Battle Tower

A browser-based singles Battle Tower simulator powered by Pokémon Showdown's battle engine.

## Run locally

Requires Node.js 16 or newer.

```powershell
npm install
npm run dev
```
## Rules and features

- Generation 3 battle format and mechanics, run by Pokémon Showdown's simulator.
- Generation 3 species, abilities, items, moves, and per-species learnsets legal at level 50.
- Team editing uses Generation 3 Showdown Pokédex data for base stats and level-50 stat calculations, with an explicitly labeled Gen III base-stat display, sprite/type species picker, move/type filters and base-stat sorting; level-50 stats update as EVs, IVs, and nature change, with a 508-EV team cap.
- Tower challengers use generated Generation 3 teams with only fully evolved species: Pokémon in Showdown's NFE tier and any species with a Generation 3 evolution are excluded.
- Opponent Pokémon use a random usable local Smogon set from `DBs/gen3.json`, regardless of Smogon tier; move options, items, natures, IVs, and EV spreads are resolved and checked against the simulator's Generation 3 level-50 legality rules. Species without a usable curated set fall back to Pokémon Showdown's bundled Generation 3 random-battle sets. Candidates without a legal set source are skipped.
- Trainer AI evaluates only legal actions from its current Showdown request and estimates damage with the Generation 3 battle engine. It weighs KO pressure, move accuracy, priority, setup and status value, weather/team synergy, revealed incoming moves, conservative type/STAB risk, entry-hazard damage, switch-in abilities, and the tempo cost of switching; it avoids consecutive speculative switches and will still switch to escape an imminent knockout.
- Tactical threat estimates use attacks the player has revealed plus generic species-type estimates; the AI does not inspect unrevealed player moves or use Battle Tower-forbidden trainer items. Its weighted move scoring and switch heuristics are informed by Pokémon Emerald's [trainer battle scripts](https://github.com/pret/pokeemerald/blob/master/data/battle_ai_scripts.s#L51-L180) and [switch decisions](https://github.com/pret/pokeemerald/blob/master/src/battle_ai_switch_items.c#L429-L528).

- Teams are saved in the browser. Active battles are kept in server memory and end when the server restarts.

The simulator uses Showdown's `[Gen 3] Custom Game` format so all Generation 3 species are available rather than applying a competitive tier banlist. The app enforces six unique species, level 50, and a 508-EV cap while leaving battle resolution, move effects, status, stat stages, switching, and end-of-battle handling to Showdown. The field indicator reflects Trick Room if present in the engine state, but Trick Room is not a Generation 3 move.
