const { readFileSync, writeFileSync, mkdirSync } = require("node:fs");
const { join } = require("node:path");
const { Resvg } = require("@resvg/resvg-js");
const output = join(__dirname, "../build/installer-assets");
mkdirSync(output, { recursive: true });
const source = readFileSync(join(__dirname, "../resources/nemeton-mark.svg"), "utf8");
const paths = source.match(/<path[^>]+\/>/g);
const defs = source.match(/<defs>[\s\S]*?<\/defs>/)[0];
function bmp(svg, width, height, filename) {
  const pixels = new Resvg(svg, { fitTo: { mode: "width", value: width } }).render()
    .pixels;
  const stride = Math.ceil((width * 3) / 4) * 4;
  const data = Buffer.alloc(54 + stride * height);
  data.write("BM");
  data.writeUInt32LE(data.length, 2);
  data.writeUInt32LE(54, 10);
  data.writeUInt32LE(40, 14);
  data.writeInt32LE(width, 18);
  data.writeInt32LE(height, 22);
  data.writeUInt16LE(1, 26);
  data.writeUInt16LE(24, 28);
  data.writeUInt32LE(stride * height, 34);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const from = (y * width + x) * 4,
        to = 54 + (height - 1 - y) * stride + x * 3;
      data[to] = pixels[from + 2];
      data[to + 1] = pixels[from + 1];
      data[to + 2] = pixels[from];
    }
  writeFileSync(join(output, filename), data);
}
// One seamless, restrained orbit. Keep the play symbol stationary.
for (let frame = 0; frame < 60; frame++) {
  const angle = frame * 6;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 512 512">${defs}<rect width="512" height="512" fill="#10131B"/><circle cx="256" cy="256" r="245" fill="none" stroke="#23352B" stroke-width="2"/><g transform="translate(256 256) scale(.82) translate(-256 -256)"><g transform="rotate(${angle} 256 256)">${paths[0]}</g>${paths[1]}</g><circle cx="256" cy="11" r="5" fill="#B7FF64"/></svg>`;
  bmp(svg, 160, 160, `frame-${frame}.bmp`);
}
const sidebar = `<svg xmlns="http://www.w3.org/2000/svg" width="164" height="314" viewBox="0 0 164 314">${defs}<defs><radialGradient id="halo"><stop stop-color="#244A32"/><stop offset="1" stop-color="#10131B"/></radialGradient></defs><rect width="164" height="314" fill="#10131B"/><circle cx="82" cy="125" r="120" fill="url(#halo)"/><circle cx="82" cy="125" r="69" fill="none" stroke="#344F36"/><g transform="translate(27 70) scale(.215)">${paths.join("")}</g><text x="82" y="232" text-anchor="middle" font-family="sans-serif" font-size="19" font-weight="bold" letter-spacing="3" fill="#EFF5EA">NEMETON</text><text x="82" y="253" text-anchor="middle" font-family="sans-serif" font-size="10" fill="#B7FF64">TU UNIVERSO DE JUEGOS</text><path d="M48 276H116" stroke="#B7FF64" stroke-width="2"/></svg>`;
bmp(sidebar, 164, 314, "sidebar.bmp");
console.log("Installer artwork: 60 animation frames + sidebar.");
