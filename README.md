# Gen 3 Battle Tower

A browser-based singles Battle Tower simulator powered by Pokémon Showdown's battle engine.

## Run locally

Requires Node.js 16 or newer.

```powershell
npm install
npm run dev
```

Open the local URL printed by the server (by default, `http://127.0.0.1:3000`).

## GitHub and deployment

Commit the application source (`server.js`, `public/`), `DBs/` data files, `package.json`, `package-lock.json`, this README, `.gitignore`, and deployment/workflow configuration. `node_modules/` is intentionally excluded; GitHub Actions and Render install dependencies from the lockfile with `npm ci`.

Do not commit `.env` files, credentials, API keys, personal data, editor/OS files, logs, or generated build and coverage output. The `.gitignore` covers common local files. Review every file before the first push, especially audio and data assets: only upload material you have permission to redistribute. This project includes Pokémon-related names/art and bundled music; check the relevant rights and asset licenses before making a public repository or deployment.

The repository includes a Render Blueprint at `render.yaml` and a GitHub Actions syntax-check workflow. To deploy, push the repository to GitHub, then create a Render service from that repository (or use Render's Blueprint flow). The free Render service may sleep while idle; active battles are stored in server memory and are lost on restart or redeploy.

## Rules and features

- Generation 3 battle format and mechanics, run by Pokémon Showdown's simulator.
- Singles, six Pokémon per side, with every Pokémon fixed at level 50.
- Generation 3 species, abilities, items, moves, and per-species learnsets legal at level 50.
- Team editing uses Generation 3 Showdown Pokédex data for base stats and level-50 stat calculations, with an explicitly labeled Gen III base-stat display, sprite/type species picker, move/type filters and base-stat sorting; level-50 stats update as EVs, IVs, and nature change, with a 508-EV team cap.
- Tower challengers use generated Generation 3 teams with only fully evolved species: Pokémon in Showdown's NFE tier and any species with a Generation 3 evolution are excluded.
- Opponent Pokémon use a random usable local Smogon set from `DBs/gen3.json`, regardless of Smogon tier; move options, items, natures, IVs, and EV spreads are resolved and checked against the simulator's Generation 3 level-50 legality rules. Species without a usable curated set fall back to Pokémon Showdown's bundled Generation 3 random-battle sets. Candidates without a legal set source are skipped.
- Trainer AI evaluates only legal actions from its current Showdown request and estimates damage with the Generation 3 battle engine. It weighs KO pressure, move accuracy, priority, setup and status value, weather/team synergy, revealed incoming moves, conservative type/STAB risk, entry-hazard damage, switch-in abilities, and the tempo cost of switching; it avoids consecutive speculative switches and will still switch to escape an imminent knockout.
- Tactical threat estimates use attacks the player has revealed plus generic species-type estimates; the AI does not inspect unrevealed player moves or use Battle Tower-forbidden trainer items. Its weighted move scoring and switch heuristics are informed by Pokémon Emerald's [trainer battle scripts](https://github.com/pret/pokeemerald/blob/master/data/battle_ai_scripts.s#L51-L180) and [switch decisions](https://github.com/pret/pokeemerald/blob/master/src/battle_ai_switch_items.c#L429-L528).
- Battle screens display major status conditions and live stat stages; opposing party members remain undisclosed until revealed in battle.
- The opposing active Pokémon and HUD are arranged at the upper right facing the player's Pokémon and HUD at the lower left.
- Battle settings let you choose the battle-sprite generation and adjust cry volume; preferences are saved in the browser. The team editor includes a per-Pokémon shiny toggle, and each opponent Pokémon independently has a 1-in-4,096 shiny chance.
- The battle log shows player-facing battle events without raw simulator protocol or debug lines; party sprites are the switch controls and display live HP bars once revealed, without exact HP totals in friendly hover labels.
- Initial Pokémon sprites stay hidden until their send-out animation starts; leaving an active battle for the team builder requires confirmation.
- Battle preparation shows a loading overlay while teams are validated and generated; the random local battle theme is buffered silently and begins when the arena is revealed.
- Battle sprites use local animated Gen 5 Showdown GIFs; player battle sprites stay back-facing and opponents stay front-facing. Team-box thumbnails, species-picker sprites, and battle-party icons use the local Gen 5 front GIFs.
- Damage and healing log entries include the percentage of maximum HP changed, with matching red damage or green healing popups over the affected active Pokémon; misses, failed/blocked moves, focus/charge preparation, skipped turns, immunity, and critical hits also show floating notifications.
- Battle playback pauses for one second after every move, damage, and healing event so attacks and turn events are easier to follow.
- Move visuals are inferred from Showdown's Generation 3 move flags, targets, categories, types, and effects across the full move list, then rendered as type-colored bite, beam/charge, projectile, slash, melee/impact, sound, powder, wind, wave, ground, healing, setup, and field effects.
- Move tooltips show Showdown move descriptions, type, category, base power, accuracy, and effectiveness against the active opponent.
- The team editor shows held-item icons and descriptions, ability descriptions, and physical/special/status move-category icons.
- Battle visuals track Showdown field state for weather, Trick Room, entry hazards, Reflect, and Light Screen; active conditions show their remaining duration and update the arena indicators.
- The compact battle HUD shows name, status, level, HP bar and percentage, then stat-stage changes. Fainted Pokémon fall away and new arrivals enter via a Poké Ball throw/release animation; reduced-motion preferences are respected. Rain, sunlight, and sand have animated arena overlays.
- Battle cries are looked up on entry and faint through the Pokémon detail URLs in `DBs/pokeapi.co.json`; the app reads the `cries.latest` field (falling back to `cries.legacy`) and plays the returned audio URL directly.
- The root OGG battle themes and notification WAV from Pokémon Showdown are stored locally under `public/audio/`; duplicate MP3 tracks and the separate `cries/` directory are not included. A random theme loops during each battle, with its own persistent volume slider in Settings. Local audio assets are served from `/audio/<filename>`.
- Teams are saved in the browser. Active battles are kept in server memory and end when the server restarts.

The simulator uses Showdown's `[Gen 3] Custom Game` format so all Generation 3 species are available rather than applying a competitive tier banlist. The app enforces six unique species, level 50, and a 508-EV cap while leaving battle resolution, move effects, status, stat stages, switching, and end-of-battle handling to Showdown. The field indicator reflects Trick Room if present in the engine state, but Trick Room is not a Generation 3 move.
