/**
 * An .ico container holding PNG frames (supported by every current browser). Each entry is
 * a 16-byte directory record pointing at the PNG bytes; a size of 256 is stored as 0.
 */
export function buildIco(frames: { size: number; png: Uint8Array }[]): Uint8Array {
  const header = 6 + frames.length * 16;
  const total = header + frames.reduce((n, f) => n + f.png.length, 0);
  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  view.setUint16(0, 0, true); // reserved
  view.setUint16(2, 1, true); // type: icon
  view.setUint16(4, frames.length, true);

  let offset = header;
  frames.forEach((f, i) => {
    const at = 6 + i * 16;
    const dim = f.size >= 256 ? 0 : f.size;
    out[at] = dim; // width
    out[at + 1] = dim; // height
    out[at + 2] = 0; // palette
    out[at + 3] = 0; // reserved
    view.setUint16(at + 4, 1, true); // colour planes
    view.setUint16(at + 6, 32, true); // bits per pixel
    view.setUint32(at + 8, f.png.length, true);
    view.setUint32(at + 12, offset, true);
    out.set(f.png, offset);
    offset += f.png.length;
  });
  return out;
}
