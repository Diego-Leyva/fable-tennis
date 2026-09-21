// Fable Tennis server: serves /public and relays phone moves to the host of a room.
const express = require('express');
const { Server } = require('socket.io');
const fs = require('fs'), os = require('os'), { execSync } = require('child_process');
const app = express();
const http = require('http').createServer(app);
const io = new Server(http);
app.use(express.static(__dirname + '/public'));
app.get('/', (req, res) => res.redirect('/host.html'));
const INSTANCE = (process.env.RAILWAY_REPLICA_ID || os.hostname()).slice(0, 8); // which process answered: host and phones must share one
app.get('/healthz', (req, res) => res.send(`ok ${INSTANCE} rooms=${Object.keys(rooms).join(',')}`)); // Railway health check

// Phones need HTTPS for motion sensors: also serve https:// on the LAN with a self-signed cert (generated once into certs/).
// On a host that terminates TLS for us (Railway, or LOCAL_HTTPS=0) only the single $PORT is served.
const PORT = process.env.PORT || 3000, HTTPS_PORT = process.env.HTTPS_PORT || 3443, CERT = __dirname + '/certs';
const LOCAL_HTTPS = process.env.LOCAL_HTTPS ? process.env.LOCAL_HTTPS !== '0' : !process.env.RAILWAY_ENVIRONMENT;
let https = null;
if (LOCAL_HTTPS) try {
  if (!fs.existsSync(CERT + '/cert.pem')) { fs.mkdirSync(CERT, { recursive: true });
    execSync(`openssl req -x509 -newkey rsa:2048 -nodes -days 365 -subj "/CN=fable-tennis" -keyout "${CERT}/key.pem" -out "${CERT}/cert.pem"`, { stdio: 'ignore' }); }
  https = require('https').createServer({ key: fs.readFileSync(CERT + '/key.pem'), cert: fs.readFileSync(CERT + '/cert.pem') }, app);
  io.attach(https);
} catch (e) { console.log('HTTPS disabled: ' + e.message); }
const lanIp = () => (Object.values(os.networkInterfaces()).flat().find(i => i.family === 'IPv4' && !i.internal) || {}).address || 'localhost';
const lanUrl = () => https ? `https://${lanIp()}:${HTTPS_PORT}/phone.html` : `http://${lanIp()}:${PORT}/phone.html`;

const rooms = {}; // in memory, so the service must run as ONE instance. code -> { host: socketId, players: { socketId: { name, slot } } }
const newCode = () => Array.from({ length: 4 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ'[Math.floor(Math.random() * 23)]).join('');
const playerList = (r) => Object.values(r.players);

io.on('connection', (socket) => {
  socket.on('host', (wanted) => {                             // big screen opens a room (keeps its code across server restarts)
    let code = wanted && !rooms[wanted] ? wanted : null; while (!code || rooms[code]) code = newCode();
    rooms[code] = { host: socket.id, players: {} };
    socket.join(code); socket.room = code; socket.emit('room', { code, lanUrl: lanUrl(), instance: INSTANCE });
    console.log(`[${INSTANCE}] room ${code} opened`);
  });
  socket.on('join', ({ room, name }, cb = () => {}) => {       // phone joins as P1 or P2
    room = (room || '').toUpperCase().trim(); const r = rooms[room];
    if (!r) { console.log(`[${INSTANCE}] join ${room}: no such room (open: ${Object.keys(rooms).join(',') || 'none'})`);
      return cb({ error: `No such room on server ${INSTANCE}. Check the code on the host screen and that the host page is open.` }); }
    const slot = [1, 2].find(s => !playerList(r).some(p => p.slot === s));
    if (!slot) return cb({ error: 'Room is full' });
    r.players[socket.id] = { name: (name || '').trim().slice(0, 10) || 'P' + slot, slot };
    socket.join(room); socket.room = room;
    io.to(r.host).emit('players', playerList(r)); cb({ slot });
  });
  socket.on('move', (m) => {                                  // { label, confidence } -> host
    const r = rooms[socket.room], p = r && r.players[socket.id];
    if (!p) return; io.to(r.host).emit('move', { slot: p.slot, label: m.label, confidence: m.confidence });
    console.log(`${socket.room} P${p.slot} ${p.name}: ${m.label} (${Number(m.confidence).toFixed(2)})`);
  });
  socket.on('probs', (m) => {                                 // model probabilities (4/s) -> host picks the allowed move
    const r = rooms[socket.room], p = r && r.players[socket.id];
    if (p) io.to(r.host).emit('probs', { slot: p.slot, p: m.p, g: m.g });
  });
  const toPlayer = (r, slot) => Object.keys(r.players).find(k => r.players[k].slot === slot);
  socket.on('hit', (slot) => { const r = rooms[socket.room], id = r && toPlayer(r, slot); if (id) io.to(id).emit('hit'); });          // host -> phone: ball struck
  socket.on('fb', ({ slot, label }) => { const r = rooms[socket.room], id = r && toPlayer(r, slot); if (id) io.to(id).emit('fb', label); }); // host -> phone: move accepted
  socket.on('disconnect', () => {
    const r = rooms[socket.room]; if (!r) return;
    if (r.host === socket.id) { io.to(socket.room).emit('closed'); delete rooms[socket.room]; }
    else { delete r.players[socket.id]; io.to(r.host).emit('players', playerList(r)); }
  });
});

http.listen(PORT, () => console.log(`Fable Tennis host: http://localhost:${PORT}/host.html`));
process.on('SIGTERM', () => { io.close(); http.close(() => process.exit(0)); if (https) https.close(); });
if (https) https.listen(HTTPS_PORT, () => console.log(`Phones (accept the certificate warning once): ${lanUrl()}`));
