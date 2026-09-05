const { readFileSync, writeFileSync } = require("node:fs");
const { join } = require("node:path");
const { Resvg } = require("@resvg/resvg-js");

const resources = join(__dirname, "..", "resources");
const svg = readFileSync(join(resources, "nemeton-mark.svg"));
const render = (size) =>
  new Resvg(svg, { fitTo: { mode: "width", value: size } }).render().asPng();

writeFileSync(join(resources, "icon.png"), render(1024));

// PNG-backed ICO frames keep the official vector sharp at Windows taskbar sizes.
const sizes = [16, 24, 32, 48, 64, 128, 256];
const frames = sizes.map(render);
const header = Buffer.alloc(6 + sizes.length * 16);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(sizes.length, 4);
let offset = header.length;

frames.forEach((frame, index) => {
  const entry = 6 + index * 16;
  header[entry] = sizes[index] % 256;
  header[entry + 1] = sizes[index] % 256;
  header.writeUInt16LE(1, entry + 4);
  header.writeUInt16LE(32, entry + 6);
  header.writeUInt32LE(frame.length, entry + 8);
  header.writeUInt32LE(offset, entry + 12);
  offset += frame.length;
});

writeFileSync(join(resources, "icon.ico"), Buffer.concat([header, ...frames]));
