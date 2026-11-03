# CurioSprite

**Question. Understand. Explore. Share. Test.**

CurioSprite is an open-source handheld game-creation platform: kids draw a sprite, press Play, and control it in their own game, all on the same device. This repository holds the browser-based creator and runtime. It targets an 800 × 480 touchscreen running Chromium on a Raspberry Pi, and it also runs in any desktop browser.

## Install and run

Requires Node.js 18 or newer.

```bash
npm install
npm run dev        # development server (also reachable from other devices on your network)
npm test           # unit tests (Vitest)
npm run build      # type-check and build to dist/
npm run preview    # serve the production build
```

### Raspberry Pi

Build with `npm run build`, then serve the `dist/` folder with any static HTTP server, for example `npx vite preview --host 0.0.0.0`. Open it in Chromium, ideally in kiosk mode:

```bash
chromium-browser --kiosk --noerrdialogs http://localhost:4173
```

The build uses relative paths, so `dist/` can be served from any folder. It does not need HTTPS.

## Current features (Phase 1)

**Home.** Two big choices, **Create** and **Play**. Both read the same saved games.

**Create**
- Create a new game, name it, rename it, or delete it (deletion asks for confirmation).
- **New game asks how people will see it: Top-down or Side view.** Each starts playable with its own starter map. Top-down is a walled map with rooms and doorways; side view has ground, platforms and a gap. Both come with a hero, treasure (a starter Coin sprite), blocks, a goal flag and some Slime enemies. You can switch the view later under How it plays.
- **How to win** (under How it plays): **Get all treasure**, **Reach the goal**, **Treasure, then goal** (the flag stays locked and faded until all the treasure is collected), or **Beat all enemies**. New games use Reach the goal. If the level is missing what the rule needs, a warning says so and links to the level editor.
- In the game workspace you can draw sprites, choose the **View** (Side view or Top-down), **Battles** (Action or Turn-based), **Hearts** (3, 5 or 9), and set speed, jump height and sky colour.
- **Battles.** Any sprite can be an enemy (see the level editor). The player has hearts; running out shows "Out of hearts!" and Try again. Falling off a side-view level costs a heart.
  - **Action:** fight in real time. In side view, B (X) attacks and A jumps; in top-down, A (Z / Space) attacks the way you are facing and B dashes. Touching an enemy costs a heart, then you blink and are safe for a moment.
  - **Turn-based:** bumping into an enemy opens a battle screen with **Attack**, **Defend** and **Run** (tap them, or use the arrows and A). Defend blocks the enemy's next attack and makes your next hit do double damage. Enemies hit back on their turn but sometimes miss. Run escapes without beating the enemy.
- **One Save for everything.** Every editor writes straight into the open game, and the **Save game** button (on every Create screen) stores sprites, level and settings together. Leaving the game, or closing the browser, with unsaved work asks first.
- **Test** plays the current version straight away, from the game screen or from inside either editor. Leaving Test returns you to the editor with your undo history intact.
- Export a game as a `.curio.json` file, and import one back. An import is always added as a new game and never replaces an existing one.

**Sprites and objects.** A *sprite* is a picture plus the traits every copy shares (solid, walk-through or enemy; how enemies move and how tough they are). Each thing placed in the level is its own *object*, with a stable name ("Slime 3", "Door 1", "Treasure 4", or one you give it), its own enemy settings if you want them, and its own rules. Blocks painted as ground are terrain, not objects.

- In the level editor, **tap a placed object** (dragging still moves it) for a small menu beside it: **Add a rule** (straight into "When…" for just this one), **Rules & settings** (its panel: its own rules listed on the left; on the right, rename / remove, *just this one*'s enemy moves or hits, and a link to the rules every copy shares), **Rename** and **Remove**. Tapping a Block offers Remove and explains that Blocks are ground and can't have rules.

**Rules: "When … then …"** (the purple **Rules** button, in the level editor's top bar and on the game screen's Level card)
- Build each rule from menus, with no typing code: tap the **When** half or the **Then** half of a rule to change it, or the bin to delete it.
- The Rules screen lists everything that can have rules down the left: the whole game, the treasure, and each sprite, which drops down to show its objects that have rules of their own, each with a count. Pick one to see and edit its rules on the right; its **Add** button only offers choices that fit:
  - **Whole game** (at the top): the game starts · the goal opens · the player loses a heart · any enemy is beaten · all the enemies are beaten.
  - **Treasure:** a treasure is collected (each one) · a number of treasures are collected · all the treasure is collected.
  - **Each of your sprites:** the player touches any Key · the player **attacks** any Key · and, for enemies, any Slime is beaten (each one) · every Slime is beaten. Adding a rule here asks *"Every Slime, or just one?"*.
  - **One object:** the player touches Key 1 · the player attacks Key 1 · Boss is beaten · Treasure 4 is collected. These appear inside their sprite's (or the Treasure) section, and in the object's own panel.
- In the level editor tray, each sprite has a small ⚡ button (showing how many rules it has) that opens the Rules at that sprite's section.
- **Then:** show a message · make something disappear or appear (**every** Door, or **just** Door 2) · open the goal · give back a heart · win the game. In an object's own rules, "Key 1 disappears" is offered directly.
- Several rules can share a "When". Example: tap Key 1 and add *When the player touches Key 1 → Door 1 disappears* and *→ Key 1 disappears*; the other doors stay shut.
- An "open the goal" rule makes the goal start locked; a "make … appear" rule makes its target start hidden. Treasure or enemies a rule makes disappear no longer count towards "all the treasure" or "all the enemies". The editor notes these under the rule.
- **Touch or attack:** *touches* fires when the player bumps into or walks onto it; *attacks* fires each time the player's attack hits it (enemies, and in Action games any placed sprite, like a crate or a switch; in turn-based games, the Attack choice in a battle).
- Messages pop up at the top of the game for 3 seconds. New games come with two example rules.

**Players and heroes**
- **Who's playing?** (top right of Home): each kid has a profile with their name and their own hero. No passwords or accounts; profiles are stored on the device with the games. New games start with the player's hero; on the game screen, *Use it here* puts it into an older game and *Save this one to …* keeps a hero exactly as drawn in a game (details and frames included).
- **Make your hero**: pick a head shape (round, square, wide, long, pointy), hair style, glasses, a helmet and a vest, or *Surprise me*. Colours come from one set on the right: tap the colour dot of a row (skin, hair, eyes, helmet, top, vest, legs), then a colour. The hero is drawn from the front, the back and the side, each with a 4-frame walk made automatically, and can be drawn on afterwards. The preview walks the ways the hero moves in this game: left and right in a side-view game, every way in a top-down one.
- **The hero can always be replaced**: *Make your hero* again, *Draw* it, or *Pick another* sprite as the hero (the ⋯ menu's *Use as Player* still works too). *Keep the old hero too* adds the new hero without losing the old one.

**Attack**
- The game screen has an **Attack** card under *Your hero*. The attack is a sprite like any other: pick a starter (**Sword**, **Punch**, **Magic**, **Fireball**), then tap **Draw** to change it, animate it or draw your own. Draw it pointing right; the game turns it to face the way the hero attacks.
- **Swing** hits right in front of the hero. **Throw** sends the picture flying until it hits an enemy, a wall or a solid sprite (it passes through walk-through ones, firing their *attacks* rules); up to three fly at once. Sword and punch start as swings, magic and fireballs as throws.
- Attacks are used in Action battles. Older games get the starter sword when opened.

**Adventures** (New game → *Adventure*, or *+ Add level* → *Adventure*)
- A top-down world explored **square by square**: the hero turns, then steps one whole square; hold B to run. Any top-down level can use it (*Moves: Smooth / Square by square* on the game screen).
- **The floor:** any sprite can be painted as floor, under everything else (tap the chip under it in the level editor → *Floor*): **Ground** to walk on (grass, paths, flowers), **Water** nobody can walk on, or **Tall grass**, where wild creatures jump out. Things placed on the floor stay on top; erasing an empty square takes its floor up. Making a placed sprite into floor moves its copies onto the floor, and back again.
- **Wild creatures:** each step into tall grass may start a battle with one of the level's enemy sprites (they don't need to be placed anywhere). Wild battles always use the turn-based battle screen; running away sends the creature back into the grass.
- **The battle screen:** the creature on the right with its name and health bar, the hero seen from behind (its back view, if it has one) on the left with their hearts, and a text box with Attack / Defend / Run.
- **Characters who talk:** a rule *When the player talks to …* fires when the hero faces something and presses A (top-down levels). Its messages show one after another in a text box along the bottom while the game waits; A shows the next line.
- **Doors:** a rule can *Go to another level…* (for example, "When the player touches the Cave, go to Level 3"). The player arrives at that level's start, and it opens in their progress.
- **The Adventure starter:** two screens of grass, a sandy path, a pond, flowers and three patches of tall grass, edged with trees (the Block); a Ranger who says hello and gives a heart back; berries to find (the treasure); a Leaf Beetle and a Pebble Crab in the grass; the flag past the pond. All of it is CurioSprite's own starter art, ready to redraw.

**Levels**
- A game can have up to 20 levels. The game screen's **Levels** card has a tab per level and **+ Add level** (a run, a climb or a top-down map, started from a small starter level that uses the game's Block, Treasure and Goal sprites and enemies). The ⋯ button renames, copies (with new object ids, and its own rules pointing at the copies), moves or deletes a level. Coming back from editing a level keeps it selected.
- Each level picks its own **view**, which way it goes, **how to win** and sky. Hero, sprites, attack, hearts, speed, jump and battles are shared by the whole game.
- **Rules** belong to a level, or work in **every level**: new rules belong to the level they were made in, and a *This level / Every level* switch under each rule changes that (rules about one placed object always stay in its level).
- **Playing:** a game with several levels opens on a level picker. Winning a level opens the next (*Next level*, or A / Start); any opened level can be played again. Progress is kept per player (or for guests) and per game, in this browser. **Test** from the level editor starts that level; the game screen's Play shows every level open.

**Animation**
- Any sprite can have up to 8 frames. The strip above the drawing area plays the animation and shows each frame: tap one to draw on it, *Copy* starts the next frame from the current one, the bin removes one, and **Make it move** makes a bounce automatically from frame 1.
- **Views.** A sprite can be drawn from the **Front**, the **Back** and the **Side** (the tabs at the start of the strip; a new view starts as a copy of the front, and removing its last frame takes it away). Each view has its own frames. Side-view games show sprites from the side (mirrored when going left), so the Back tab isn't offered there; top-down games show the back going up, the front going down and the side going left or right, like classic adventure games. A sprite without a view uses its front instead.
- In the game the hero walks while moving (and shows a step while jumping), enemies animate and turn while they move, and treasure, goals and scenery with frames play all the time. Blocks always show frame 1. The level editor shows side-view games from the side too.

**Sprite editor** (HTML5 Canvas, pointer events, so mouse, touch and pen behave the same)
- 16 × 16 or 32 × 32 sprites: you pick the size when you make a new sprite, and can switch it later with the **Sprite size** switch in the editor. Switching rescales the drawing and can be undone. Both sizes fill one block in the game; 32 × 32 just allows more detail.
- Pencil, eraser and fill bucket, with gap-free lines when you draw fast.
- A 16-colour palette plus a **See-through** choice, so you can draw or fill transparent pixels.
- Undo and redo (each stroke is one step), clear with confirmation, and a grid you can turn on or off.
- Add as many sprites as you like, up to 64 per game. Add them from the game screen (**New sprite**) or with the **+** tab in the editor.
- Each sprite's **⋯** menu lets you **Use as Player / Treasure / Block / Goal**, rename, duplicate or delete it. A sprite the game is using can't be deleted until another sprite takes over its role.

**Level editor**
- The main area is the **game window**: exactly one 800 × 480 screen (25 × 15 squares), showing what the player will see.
- The **timeline** below it shows the whole level start to finish, split into numbered screens. Drag along it, or use ◀ ▶, to move the window through the level.
- **Level length, block by block.** Drag the orange **END** handle at the end of the level. While you drag, the new length shows (for example "62 blocks · 2.5 screens"), new space appears as faded sky, and blocks that would be cut off turn red. Drag past the window's edge and the level scrolls with you. Shortening asks first if anything would be removed, and it can be undone. The − / + buttons jump a whole screen at a time. Levels are 25 to 256 blocks long.
- **Runs, climbs and maps.** New game asks for **Top-down**, **Side view** (a run) or **Climb** (a side-view tower one screen wide and three tall, with ledges zig-zagging up to the flag). Side-view levels grow one way: *Level goes* **Across →** (screens join on to the side) or **Up ↑** (screens stack on top), set under How it plays; switching keeps the first screen and asks first if anything else would be cleared. Top-down levels can grow both ways. The level editor shows only the size controls that fit (↔ long, ↕ tall, a screen at a time; taller levels grow at the top so the ground stays put), up to 8 screens tall. Tall levels get a map beside the window, numbered from the bottom, with ▲ ▼ buttons; the arrow keys and mouse wheel scroll too, and carried items scroll the window at the top and bottom edges.
- **Drag and drop everything.** Drag Block, Treasure, Goal, the player Start, or any of **your sprites** from the tray into the window. Drag anything already placed to move it, or drag it out of the window to remove it.
- **Tap a tray item to paint lots of it at once.** A Painting bar appears with two shapes: **Draw** paints wherever you drag, and **Box** fills the whole rectangle between where you press and where you let go (good for floors and walls). Painting covers whatever is already there. The Eraser works the same way. Each drag is one undo step. Tap **Done painting** (or press Escape) to go back to dragging single items.
- Holding an item at the left or right edge of the window scrolls the level.
- **Your sprites are solid by default.** Draw a new block in any pattern and place it, and the player can stand on it and bump into it. Tap the chip under each sprite in the tray to make it **Solid**, **Walk-through** (clouds, trees…) or an **Enemy**. For an enemy you also choose how it moves (stays put, wanders, walks back and forth, or chases the player) and how many hits beat it. In the editor, walk-through items get a dashed outline and enemies a red corner (not in the game). Side-view enemies don't walk off ledges. The Hero, Block, Treasure and Goal sprites are placed from the top of the tray, so they always act as the player start, blocks, treasure and goals (any placed as plain sprites in older games are converted automatically).
- One thing per square. Nothing can cover the player's start, so the player never spawns inside a wall.
- **How to win** sits at the top of the tray: tap it to change the rule while you build, with a line underneath saying how this level is won (and a warning if it is missing treasure, a goal or enemies that the rule needs). It is the same setting as on the game screen.
- Undo and redo, and clear with confirmation.

**Play**
- The game fills an 800 × 480 screen, with the Home button, hearts, a treasure counter (showing your own treasure sprite), goal status (locked / open), enemies left and pause drawn on top.
- A library of saved games. Launch one, then return to the library.
- Canvas runtime with a fixed 60 Hz simulation, a camera that follows the player, collision, treasure, goals, enemies, both battle styles, the chosen win rule, win and lose screens, pause, and respawn after a fall.
- On-screen D-pad and A/B buttons appear on touch devices.

**Treasure, not just coins.** Whatever sprite has the Treasure job is what players collect: redraw the starter Coin as a gem, a key or an apple and the game calls it treasure and shows your drawing in the counter.

**Testing on new hardware.** Open the app with `?debug` (for example `http://localhost:5173/?debug`) and the game screen shows its frame rate, whether the Gamepad API is available, how many controllers are connected and the last control pressed. The Raspberry Pi test kit lives in a separate project, `curiosprite-os`.

**Sprite transparency.** Pixel value `0` is transparent. The editor shows it as a checkerboard, and the game draws it with full alpha transparency, so the level shows through around your character.

## Controls

| Action | Keyboard | CurioSprite / gamepad | In game |
|---|---|---|---|
| Move | Arrow keys / WASD | D-pad / left stick | Walk (in any direction in top-down); pick a battle choice |
| Primary | Z / Space | A | Side view: jump. Top-down: attack (Action) or dash (Turn-based). Confirm a battle choice; play again |
| Secondary | X | B | Side view: attack (Action). Top-down: dash (Action) |
| Start | Enter | Start | Pause / resume |
| Return | Escape | Home (or Select) | Leave the game |

Menus work with a controller alone. The D-pad moves focus, A selects, and B or Home goes back. On a keyboard, Tab and Enter work, and Escape goes back.

Sprite editor shortcuts: `P` pencil, `E` eraser, `F` fill, `G` grid. Both editors: `Ctrl/⌘+Z` undo, `Ctrl/⌘+Shift+Z` or `Ctrl+Y` redo, `Ctrl/⌘+S` save the game. In the level editor, `←` / `→` move the window.

Physical controller mappings live in one place, `DEFAULT_BINDINGS` in [src/input/bindings.ts](src/input/bindings.ts). They follow the W3C "standard" gamepad layout.

## Project format

Games are stored as versioned JSON (schema **v4**), defined in [src/models/project.ts](src/models/project.ts). The format does not depend on React or the browser:

```jsonc
{
  "format": "curiosprite-project",
  "version": 4,
  "exportedAt": "…",
  "project": {
    "schemaVersion": 4,
    "id": "uuid",
    "revision": 3,                       // bumped on every save
    "meta": { "name", "description", "createdAt", "updatedAt", "appVersion" },
    "palette": ["#1a1c2c", "…"],         // pixel value n = palette[n - 1]; 0 = transparent
    "sprites": [{ "id", "name", "width": 16, "height": 16, "pixels": [0, 3, …],   // frame 1
                  "frames"?: [[…], …],                                          // more animation frames
                  "back"?: [[…], …], "side"?: [[…], …] }],                       // other views, each 1–8 frames
    "player": { "spriteId", "speed", "jumpStrength", "hearts": 1–9, "look"?,    // look: the hero maker's choices
                "attack"?: { "spriteId", "kind": "swing" | "throw" } },
    "levels": [{ "id", "name", "width", "height", "tileSize", "background",   // played in order; 1–20
               "mode": "platformer" | "topdown", "direction": "across" | "up",
               "winRule": "coins" | "goal" | "coinsThenGoal" | "enemies",   // "coins" = all treasure
               "tiles": ["....#####...", "…"],   // terrain: '.' empty, '#' Block
               "playerStart": { "x", "y" }, "solidSpriteId", "collectibleSpriteId", "goalSpriteId",
               "enemies": [{ "spriteId", "hp": 1–9, "moves": "still" | "wander" | "patrol" | "chase" }],
               "objects": [{ "id", "kind": "sprite" | "treasure" | "goal", "spriteId"?, "x", "y",
                             "n", "name"?, "moves"?, "hp"? }],   // everything placed; n = its stable number
               "passThroughSpriteIds": ["…"],   // placed sprites are solid, except these
               "floor": ["0001112...", "…"],   // one letter per square: floorTypes[n] by FLOOR_KEYS, '.' bare
               "floorTypes": [{ "spriteId", "kind": "ground" | "water" | "grass" }],
               "movement": "free" | "grid" }],   // top-down: glide, or square by square
    "settings": { "gravity", "battle": "action" | "turns" },   // shared by every level
    "rules": [{ "id", "when": { "on": "start" | "collect" | "goalOpen" | "beat" | "touch" | "hit" | "talk" | "hurt", … },   // may name a spriteId or one objectId
                      "then": { "do": "message" | "openGoal" | "hide" | "show" | "heal" | "win" | "goLevel", … },
                "levelId"? }]   // the level it belongs to; without one it works in every level
  }
}
```

Every loaded project is fully validated. Levels saved before floors have a bare floor and glide (smooth movement). Games saved before levels (schema v3) become a one-level game: their view, direction and win rule move into the level, rules about placed objects belong to it and the rest work in every level. Schema v2 games are upgraded when opened: their treasure and goal tile letters and placed sprites become objects, with ids taken from their squares so reopening an unsaved upgrade gives the same ids. Games saved before win rules existed keep "collect all the treasure" and are given a starter Flag sprite. Games saved before battles have no enemies, 3 hearts and Action battles. Games saved before rules have none. Files from CurioSprite 0.1 (localStorage data and `.curio.json` exports) are migrated automatically. The `{ format, version, project }` envelope is designed to become the manifest of a future `.curio` package.

## Saving and data safety

- Games are saved in **IndexedDB** in the browser (database `curiosprite`).
- Every save checks the stored `revision` inside one transaction. If another tab changed the game in the meantime, CurioSprite won't overwrite it and offers to save your version as a new game instead.
- Creating and importing never replace an existing ID.
- Damaged records are shown as "damaged" in Create and are never silently deleted or overwritten.
- 0.1 projects in `localStorage` are copied into IndexedDB once. The originals are left in place.
- If IndexedDB is unavailable (some private-browsing modes), a warning banner says that games won't persist.

## Architecture

```text
src/
├── models/      Project schema, defaults, validation, serialization, migration (no React, no DOM)
├── editor/      Pure sprite operations, undo history, editor reducer, editor canvas
├── runtime/     Game simulation (pure), canvas renderer, loop runner
├── input/       Action bindings, keyboard/gamepad/touch InputManager, gamepad menu navigation
├── storage/     Repository interface, IndexedDB and in-memory implementations, legacy migration
├── graphics/    Shared sprite-to-canvas helper, logo mark data
├── components/  Dialogs, top bar, sprite thumbnails, logo
├── screens/     Home, Create, Project, Editor, Library, Play
├── styles/      app.css
└── App.tsx      Routing, the open game, saving
```

Game rendering (`runtime/renderer.ts`) and editor rendering (`editor/EditorCanvas.tsx`) are separate. Only the small helper that turns a sprite into an image is shared. The logo mark is defined once in `src/graphics/logoMark.ts`. Run `npm run favicon` to regenerate `public/favicon.svg` from it.

## Tests

`npm test` runs the unit tests for:
- project serialization round-trips, corruption detection, newer-version rejection, and legacy migration
- sprite operations: pixel, line, flood fill, clear, resize
- sprite list edits: add, duplicate, rename, delete protection, and role assignment
- level editing: place, move and remove items, painting (draw and box), objects keeping their id and number when moved or painted over, per-object names and enemy settings, start-square protection, resizing, and the editor reducer
- rules: whole-game, treasure, every-copy and one-object rules (one door opens while the others stay shut; one enemy chases while the rest wander), and upgrading v2 levels to objects
- adventures: the starter, square-by-square steps (whole squares, turning at walls, water), talking (lines one at a time while the game waits), wild creatures in tall grass (and not elsewhere), painting and lifting floor, floor through resizes and saving, and doors to other levels
- levels: views of one level, rules per level and for every level, adding / copying / moving / removing levels, the v3 upgrade, and progress
- hero views and animation: every head, hair style and piece of gear from the front, back and side; old per-part colour looks; which view shows in each kind of game; drawing, adding and removing views in the sprite editor
- undo/redo history and the editor reducer (strokes as single steps, per-sprite history, the dirty flag, transparent fill)
- the storage revision check, duplicate-ID protection, damaged-record listing, and one-time legacy migration
- runtime physics (gravity, movement, jumping, walls, collecting, the four win rules), enemies (attacks, hearts, chasing, patrolling at ledges), turn-based battles (attack, defend, run, keyboard choices), gamepad mapping, and short key taps

## Known limitations

- The level editor needs touch or a mouse. A controller can pick tray items and use the buttons, but can't place items in the window yet.
- There is no sound yet. It's on the roadmap.
- The palette is fixed at 16 colours plus transparent.
- Text entry (naming games) needs a keyboard. A Pi touchscreen needs an on-screen keyboard (for example `squeekboard`) until CurioSprite has its own.
- Browser storage can be cleared by the user or the browser. Export games you care about.
- Performance and touch behaviour still need to be checked on real Raspberry Pi 3B+ hardware.

## License

See [LICENSE](LICENSE).
