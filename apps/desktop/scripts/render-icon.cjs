const { writeFileSync } = require("node:fs");
const { join } = require("node:path");
const { deflateSync } = require("node:zlib");

const size = 1024;
const scale = size / 512;
const pixels = Buffer.alloc(size * size * 4);
const samples = [
  [0.25, 0.25],
  [0.75, 0.25],
  [0.25, 0.75],
  [0.75, 0.75],
];

const insideRoundedSquare = (x, y) => {
  const r = 112;
  const cx = Math.min(Math.max(x, r), 512 - r);
  const cy = Math.min(Math.max(y, r), 512 - r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= r ** 2;
};

const accentAt = (x, y) => {
  const t = Math.max(0, Math.min(1, (x - 96 + (y - 80)) / 688));
  return [183 + (101 - 183) * t, 255 + (240 - 255) * t, 100 + (181 - 100) * t];
};

const isAccent = (x, y) => {
  const distance = Math.hypot(x - 256, y - 256);
  const gap = y > 326 && Math.abs(x - 256) < (y - 285) * 0.78;
  const ring = distance >= 116 && distance <= 193 && !gap;
  const play = x >= 214 && x <= 330 && Math.abs(y - 256) <= ((x - 214) * 62) / 116;
  return ring || play;
};

for (let py = 0; py < size; py += 1) {
  for (let px = 0; px < size; px += 1) {
    let red = 0;
    let green = 0;
    let blue = 0;
    let alpha = 0;
    for (const [ox, oy] of samples) {
      const x = (px + ox) / scale;
      const y = (py + oy) / scale;
      if (!insideRoundedSquare(x, y)) continue;
      alpha += 255;
      const color = isAccent(x, y) ? accentAt(x, y) : [9, 10, 15];
      red += color[0];
      green += color[1];
      blue += color[2];
    }
    const index = (py * size + px) * 4;
    const coverage = alpha / (255 * samples.length);
    pixels[index] = coverage ? Math.round(red / samples.length / coverage) : 0;
    pixels[index + 1] = coverage ? Math.round(green / samples.length / coverage) : 0;
    pixels[index + 2] = coverage ? Math.round(blue / samples.length / coverage) : 0;
    pixels[index + 3] = Math.round(255 * coverage);
  }
}

const crcTable = Array.from({ length: 256 }, (_, value) => {
  let crc = value;
  for (let bit = 0; bit < 8; bit += 1)
    crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  return crc >>> 0;
});
const crc32 = (data) => {
  let crc = 0xffffffff;
  for (const byte of data) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
};
const chunk = (name, data) => {
  const type = Buffer.from(name);
  const output = Buffer.alloc(data.length + 12);
  output.writeUInt32BE(data.length, 0);
  type.copy(output, 4);
  data.copy(output, 8);
  output.writeUInt32BE(crc32(Buffer.concat([type, data])), data.length + 8);
  return output;
};

const header = Buffer.alloc(13);
header.writeUInt32BE(size, 0);
header.writeUInt32BE(size, 4);
header[8] = 8;
header[9] = 6;
const scanlines = Buffer.alloc((size * 4 + 1) * size);
for (let row = 0; row < size; row += 1)
  pixels.copy(
    scanlines,
    row * (size * 4 + 1) + 1,
    row * size * 4,
    (row + 1) * size * 4,
  );
const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk("IHDR", header),
  chunk("IDAT", deflateSync(scanlines, { level: 9 })),
  chunk("IEND", Buffer.alloc(0)),
]);
writeFileSync(join(__dirname, "..", "resources", "icon.png"), png);
