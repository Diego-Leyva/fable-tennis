# Fable Tennis
Cartoon tennis on a big screen, phones as motion rackets (Node + Socket.IO + Three.js, no build step).
1. `npm install`
2. `npm start` → open http://localhost:3000/host.html on the big screen (press Enter for keyboard mode: P1 keys 1-9, P2 keys Q-O).
3. Phones need HTTPS for motion sensors. `npm start` also serves `https://<lan-ip>:3443` with a self-signed certificate (the lobby shows the link; accept the warning once per phone). For a trusted certificate use `ngrok http 3000` and open the host through that URL too.
4. On the phone open `<url>/phone.html`, enter name + room code, tap Join, then "Enable motion" (mock buttons always work).
5. No model yet? A built-in swing detector is used: hold the phone like a racket handle, tap Calibrate and swing one forehand. If nothing is detected, read the sensor line on the phone: it needs the HTTPS link opened directly in Safari/Chrome.
- Character: put `public/assets/player.glb` (or `player.png` for a billboard sprite). Without one, a cute fallback blob is used.
- Model: export your Edge Impulse project as WebAssembly and unzip `edge-impulse-standalone.js` + `.wasm` into `public/model/`.
- Labels expected: idle, bounce, toss, serve, fh, fh_slice, fh_topspin, bh, bh_slice, bh_topspin.
