# Kapadiya & Sons — Live Try-On

A live, in-motion fitting room: the customer turns on their camera, lines up with an
outline, taps a garment, and [Decart Lucy VTON](https://docs.platform.decart.ai) dresses them
in it in realtime. Switch garments or colourways without reconnecting.

Split out of the Kapadiya mirror (which does still-photo try-on). The session logic
(framing guide, laser-scan reveal, connect-then-`set()`) is adapted from
[OpenWear](https://github.com/KenjiPcx/openwear-extension-kit), MIT.

```bash
npm install
cp .env.example .env.local   # add DECART_API_KEY
npm run dev                  # http://localhost:3000
```

## Flow

```
/            landing: hero, catalogue strip, how it works
/live        gate (camera + access code) → framing guide → tap garment → live
/live?g=<id> same, with that garment applied as soon as the customer is framed
```

All of `/live` is `components/LiveStudio.js`, top to bottom.

## Environment

| Var | What |
|---|---|
| `DECART_API_KEY` | Permanent `dct_` key. Server-only; the browser gets 60-second client tokens from `/api/token`. |
| `ACCESS_CODE` | Optional. When set, the gate asks for it before starting. Use it on a public URL — live video is billed per second. |
| `SESSION_SECONDS` | Hard cap per session (default 300). Decart enforces it server-side too. |
| `FAST_MODE` | `1` = lower latency, billed 2×. |

Sessions also stop when the tab is hidden and when the customer taps End.

## Files

| File | What |
|---|---|
| `components/LiveStudio.js` | Camera, framing guide, Decart session, garment rail, scan effect |
| `app/api/token/route.js` | Mints scoped Decart client tokens; checks the access code |
| `lib/garment.js` | Prompts and reference-image prep (white 768px square) |
| `lib/vision.js` | MediaPipe pose tracker + framing geometry (wasm/model in `public/vision`) |
| `lib/catalogue.js` | The 25 garments and their colourways, shared with the mirror |
