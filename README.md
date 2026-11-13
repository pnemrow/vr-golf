# VR Golf

A WebXR golf game for the **Meta Quest 3 browser**. Swing a real-feeling club
with one controller while standing in place. Physics, terrain, art and sound
are all generated in code.

**Play:** https://pnemrow.github.io/vr-golf/ (open in the Quest browser, press
**Enter VR**).

See [ROADMAP.md](ROADMAP.md) for what's built and what's next.

## Controls (Quest)

| Action | Control |
| --- | --- |
| Tee up at the club head and square the face | **A** / **X** |
| Change club | Thumbstick left / right |
| Club angle in your hand | Thumbstick up / down (club hand) |
| Swing assist (flight preview + forgiveness) | **B** / **Y** |
| Wind on / off | Thumbstick click |
| Hold the club in this hand | Grip (squeeze) |

Stand side-on with the target to your left (right-handed). Rest the club
behind the ball, press **A** to tee up there, then swing.

## Desktop testing

Open the page on a computer to look around and hit scripted swings with
chosen speed, face, path and attack angle (Space). The scripted swing drives
the same collision and impact code as the headset.

## Development

No build step: plain ES modules and a vendored copy of three.js.

```sh
npm test          # physics unit tests (Node 20+)
npm run serve     # http://localhost:8080
```

WebXR needs HTTPS (or localhost). Every push to `main` and `claude/**`
branches runs the tests and publishes the site to the `gh-pages` branch.

### Layout

- `src/physics/` - ball flight, bounce and roll (`flight.js`), club-ball
  impact (`impact.js`), club specs (`clubs.js`). Pure JS, tested in Node.
- `src/world/` - range layout as an analytic height and surface field
  shared by physics and rendering, procedural meshes, sky and textures.
- `src/game/` - tracked club and swing detection, ball visuals, audio,
  scripted desktop swing.
- `src/ui/` - in-world launch monitor screen.

three.js is MIT licensed, see `vendor/three.LICENSE`.
