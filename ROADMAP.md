# VR Golf roadmap

Goal: a WebXR golf game for the Meta Quest 3 browser with the depth of a top
app-store golf game. You swing a real-feeling club with one controller while
standing in a small room. Everything (art, terrain, sound, physics) is
generated in code: no asset files.

Each milestone ends with a build on GitHub Pages that can be playtested on
Quest 3.

## M1 · Driving range (this PR)

- [x] Tracked club in either hand, 12-club bag (driver to lob wedge) with
      procedural heads, lie, loft and shaft lengths
- [x] Swept club-ball collision between tracking frames (no tunnelling at
      100+ mph), instantaneous head velocity from tracked hand velocities
      with a three-frame parabolic fallback
- [x] Impact model: D-plane start direction and spin axis, smash factor from
      spin loft, spin from club speed and spin loft, toe/heel speed loss and
      gear effect, thin and fat contact
- [x] Ball flight: drag and Magnus lift from spin factor, spin decay, wind with
      a height profile; calibrated to tour launch-monitor averages
- [x] Ground: bounce with turf softness and spin-coupled friction (backspin
      checks), rolling with slope and per-surface resistance (tee, fairway,
      rough, deep rough, fringe, green, sand)
- [x] Range with six target greens, bunkers, yardage boards and posts,
      trees, mountains, sky with clouds; flags blow with the wind
- [x] Launch-monitor screen: carry, total, offline, club and ball speed,
      smash, launch, spin, spin axis, face, path, face-to-path, attack, apex,
      strike and shot shape; ball tracer, landing markers, last-shot ghosts
- [x] Swing assist: live predicted flight from where the face aims, plus
      50 % face/path forgiveness
- [x] Haptics and synthesized strike sounds
- [x] GitHub Pages deploy on every push, physics unit tests in CI

## M2 · Feel and calibration (next)

- Playtest-driven tuning of club angle, face squaring and swing detection
- Left-handed mode (mirrored stance and toe direction)
- Practice swing vs. live ball toggle, ball spotter cam for long shots
- Wrist menu for club, assist, wind, units (yards/metres)
- Performance pass on Quest 3 (fixed foveation, draw calls, 90 Hz)

## M3 · Short game and putting green

- Putter and putting stroke model (low speed, skid then roll)
- Putting green with real break from the height field, green reading grid
- Chipping area with fringe, rough and bunkers; sand shots

## M4 · Course engine and first course

- Hole description format (tee, fairway, green, hazards, trees, pin)
- Procedural course generator with seeds and themes
- Play flow: teleport to ball, stance alignment, aim, scorecard,
  out-of-bounds and penalty drops, water hazards
- First 9-hole parkland course

## M5 · Course themes (18 holes each)

- Links (dunes, fescue, pot bunkers, firm turf, strong wind)
- Desert (target golf, waste areas, cacti, rock)
- Mountain (elevation changes, pines, lakes)
- Parkland (tree-lined, lush, water)
- Weather and time-of-day variations

## M6 · Progression

- Profile saved on device; XP from good shots and rounds
- Unlockable clubs (forgiveness, distance, spin trade-offs), balls (spin vs.
  distance), and courses
- Challenges: closest to the pin, long drive, target practice

## M7 · Opponents and multiplayer

- AI golfers with skill levels (dispersion models built on the same physics)
- Pass-and-play for 2-4 players on one headset
- Online play (WebRTC peer to peer with a small signalling service),
  turn-based stroke play, ghost replays

## Non-goals for now

- Native app store build (stays a web app in the Quest browser)
- Licensed courses, brands or equipment
