# Stobite Lights

A modern lighting console for Windows 11 and macOS (Apple Silicon and Intel), built to replace Martin M-PC.

## Install

All builds are in `dist/` (run `npm run dist:all` to rebuild them).

### Windows 11
- **Stobite-Lights-Setup-1.0.0.exe**: installer with Start-menu and desktop shortcuts.
- **Stobite-Lights-Portable-1.0.0.exe**: runs without installing (e.g. from a USB stick).

The app isn't code-signed, so the first time Windows SmartScreen may say *"Windows protected your PC"*: click **More info → Run anyway**.
When Windows Firewall asks, allow **Private networks** so Art-Net/sACN can reach your nodes.

### macOS
- **Apple Silicon (M1–M4…)**: `Stobite-Lights-1.0.0-mac-arm64.dmg`
- **Intel Macs**: `Stobite-Lights-1.0.0-mac-x64.dmg`

Not sure which Mac you have? Apple menu → About This Mac. "Chip: Apple M…" means arm64, and "Processor: Intel" means x64.
Open the DMG and drag Stobite Lights to Applications. The app isn't notarised by Apple, so on first launch macOS will block it:
open **System Settings → Privacy & Security**, scroll down and click **Open Anyway**. When asked, allow
**Local Network** access so Art-Net/sACN can reach your lights. ENTTEC-style USB interfaces use the FTDI driver built into macOS.

## What it does

| M-PC feature | Stobite Lights |
|---|---|
| DMX over Art-Net / sACN | ✅ Art-Net 4 (broadcast, 2.x, unicast, node discovery) and sACN E1.31 (multicast/unicast, priority). Unlimited universes, no dongle. |
| USB DMX (ENTTEC compatible) | ✅ ENTTEC DMX USB Pro & compatibles, and Open DMX/FTDI cables (one universe each) |
| Patch & fixture library | ✅ Built-in generic library, **import any fixture from open-fixture-library.org**, custom fixture builder, type swapping, conflict detection |
| Programmer | ✅ Intensity, colour picker (RGB/RGBW/CMY/colour wheels), position XY pad, beam/gobo with named slots, highlight, fan |
| Groups & presets | ✅ Colour/position/beam/gobo/intensity presets, applied per fixture or by type |
| Cuelists | ✅ Tracking or cue-only, fade in/out, delay, follow/wait (chases), loop, release time, live cue update |
| Playbacks | ✅ 10 faders × 20 pages, GO/Back/Flash/Release, HTP intensity / LTP everything else, grand master, blackout |
| Effects engine | ✅ Intensity chases, pulse, sparkle, rainbow, circles, pan/tilt sweeps with speed, size and spread (fan) |
| Command line | ✅ `1 thru 8 @ 50`, `group 2 @ full`, `+ 5 - 3 @ 0`, `record cue 5` |
| 2D visualiser | ✅ Live stage view with beams; drag to arrange |
| Hardware wings | ✅ Any MIDI controller via MIDI Learn (faders, GO, flash, master, pages) |
| Show files | ✅ `.slshow` files, automatic backup every few seconds, undo/redo |

## Quick start

1. **Patch**: click *Add fixtures*, pick the type, count and start address. (Or try *Load demo rig*.)
2. **Settings**: turn on Art-Net and/or sACN and pick your network card, or connect a USB-DMX interface.
3. **Fixtures**: tap fixtures or a group. Set levels and colours in the Programmer on the right.
4. Press **Record** to store a cue; it lands on a fader at the bottom. Press **GO** to play it.

Shortcuts: `Space` GO · `Esc` clear · `H` highlight · type digits to use the command line · `Ctrl+Z` undo · `Ctrl+S` save.

## Development

```bash
npm install
npm start          # run the desktop app
npm test           # engine + packet tests
npm run preview    # UI in a browser at http://localhost:5178 (no DMX output)
npm run dist:win   # Windows installer + portable exe
npm run dist:mac   # Mac DMG/zip for Apple Silicon and Intel
npm run dist:all   # everything
```

`SL_SELFTEST=/path/out.png npm start` loads the demo rig, runs cues, sends to 127.0.0.1,
screenshots the window and quits. Pair it with `node tools/listen.js` to count the Art-Net/sACN packets.
