// Listens for Art-Net (6454) and sACN (5568) on localhost and summarises what arrives.
const dgram = require('dgram');
const seen = { artnet: 0, sacn: 0, artUniverses: new Set(), sacnUniverses: new Set(), sample: null };
const a = dgram.createSocket({ type: 'udp4', reuseAddr: true });
a.on('message', (m) => {
  if (m.toString('ascii', 0, 7) !== 'Art-Net') return;
  seen.artnet++;
  seen.artUniverses.add(m[14] | (m[15] << 8));
  seen.sample = [...m.subarray(18, 18 + 12)];
});
a.bind(6454, '127.0.0.1');
const s = dgram.createSocket({ type: 'udp4', reuseAddr: true });
s.on('message', (m) => { seen.sacn++; seen.sacnUniverses.add(m.readUInt16BE(113)); });
s.bind(5568, '127.0.0.1');
setTimeout(() => {
  console.log(JSON.stringify({ ...seen, artUniverses: [...seen.artUniverses], sacnUniverses: [...seen.sacnUniverses] }));
  process.exit(0);
}, Number(process.argv[2] || 8000));
