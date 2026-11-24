# Local Pokémon Showdown battle animation assets

These files are served locally by the simulator so move, field, and hazard visuals do not depend on a live Showdown connection.

- `battle-animations.js` is the Pokémon Showdown battle animation engine. Its source header identifies the battle animation engine as MIT licensed.
- `battle-animations-moves.js` contains the move animation definitions. Its source header identifies these definitions as CC0-1.0.
- `fx/` contains the effect images and weather clips referenced by the animation definitions. They were downloaded from the official Pokémon Showdown client asset directory: <https://play.pokemonshowdown.com/fx/>.
- The original bundle headers are preserved. The upstream client source is <https://github.com/smogon/pokemon-showdown-client>.

The simulator uses an adapter to map Showdown's animation calls to its own battle scene and local asset paths.
