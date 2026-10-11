// Art-Net 4 and sACN (E1.31) packet builders. Universe numbers here are the
// protocol's own numbering (Art-Net 15-bit port address, sACN 1..63999).

const ARTNET_PORT = 6454;
const SACN_PORT = 5568;

function artDmx(portAddress, data, sequence = 0) {
  const len = 512;
  const buf = Buffer.alloc(18 + len);
  buf.write('Art-Net\0', 0, 'ascii');
  buf.writeUInt16LE(0x5000, 8); // OpDmx
  buf.writeUInt16BE(14, 10); // protocol version
  buf[12] = sequence & 0xff;
  buf[13] = 0; // physical
  buf[14] = portAddress & 0xff; // SubUni
  buf[15] = (portAddress >> 8) & 0x7f; // Net
  buf.writeUInt16BE(len, 16);
  Buffer.from(data.buffer, data.byteOffset, Math.min(data.length, len)).copy(buf, 18);
  return buf;
}

function artPoll() {
  const buf = Buffer.alloc(14);
  buf.write('Art-Net\0', 0, 'ascii');
  buf.writeUInt16LE(0x2000, 8);
  buf.writeUInt16BE(14, 10);
  buf[12] = 0x02; // send ArtPollReply on change
  buf[13] = 0;
  return buf;
}

// Parse the bits of an ArtPollReply we show in the UI.
function parseArtPollReply(msg) {
  if (msg.length < 108 || msg.toString('ascii', 0, 8) !== 'Art-Net\0' || msg.readUInt16LE(8) !== 0x2100) return null;
  const ip = `${msg[10]}.${msg[11]}.${msg[12]}.${msg[13]}`;
  const clean = (s) => s.replace(/\0.*$/s, '').trim();
  return { ip, shortName: clean(msg.toString('ascii', 26, 44)), longName: clean(msg.toString('ascii', 44, 108)) };
}

function sacnData(universe, data, { sequence = 0, priority = 100, cid, sourceName = 'Stobite Lights' } = {}) {
  const buf = Buffer.alloc(638);
  // Root layer
  buf.writeUInt16BE(0x0010, 0);
  buf.writeUInt16BE(0x0000, 2);
  Buffer.from([0x41, 0x53, 0x43, 0x2d, 0x45, 0x31, 0x2e, 0x31, 0x37, 0x00, 0x00, 0x00]).copy(buf, 4);
  buf.writeUInt16BE(0x7000 | (638 - 16), 16);
  buf.writeUInt32BE(0x00000004, 18);
  cid.copy(buf, 22, 0, 16);
  // Framing layer
  buf.writeUInt16BE(0x7000 | (638 - 38), 38);
  buf.writeUInt32BE(0x00000002, 40);
  buf.write(sourceName.slice(0, 63), 44, 'utf8');
  buf[108] = priority;
  buf.writeUInt16BE(0, 109); // sync address
  buf[111] = sequence & 0xff;
  buf[112] = 0; // options
  buf.writeUInt16BE(universe, 113);
  // DMP layer
  buf.writeUInt16BE(0x7000 | (638 - 115), 115);
  buf[117] = 0x02;
  buf[118] = 0xa1;
  buf.writeUInt16BE(0x0000, 119);
  buf.writeUInt16BE(0x0001, 121);
  buf.writeUInt16BE(513, 123);
  buf[125] = 0; // start code
  Buffer.from(data.buffer, data.byteOffset, Math.min(data.length, 512)).copy(buf, 126);
  return buf;
}

function sacnMulticast(universe) {
  return `239.255.${(universe >> 8) & 0xff}.${universe & 0xff}`;
}

module.exports = { ARTNET_PORT, SACN_PORT, artDmx, artPoll, parseArtPollReply, sacnData, sacnMulticast };
