# NitroSpoof (Revenge)

Use custom emotes from any server without Nitro. Emotes you can't use natively
are sent as CDN image links, which Discord shows as the emote.

Port of the Aliucord NitroSpoof plugin (credit: Xinto, Foxy, RGBCube, Delphox, Lenk).

## Install
1. Host this folder (`manifest.json` + `index.js`) on any static host, e.g. GitHub Pages.
2. In Revenge: Settings > Plugins > + and paste the folder URL, ending in `/`.

## Settings
- **Emote size**: pixel size added to the link (default 48). Empty = Discord default.
- **Hook status**: shows which parts attached. If something says MISSING, tell me which.

## Notes
- If you really have Nitro (Classic or full), emotes you can already use are left alone.
- Dropped from the Aliucord version: the `/freenitroll` troll command.
- If you edit `index.js`, update `hash` in `manifest.json`:
  `sha256sum index.js`
