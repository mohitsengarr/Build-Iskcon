// Stands in for https://deno.land/x/imagescript under node. Image.decode reads a
// fake image: bytes "IMG:<w>x<h>" (as the tests encode them) or the marks' real
// PNG headers (width and height from IHDR). composite records where the mark went;
// encodeJPEG returns "MARKED:" plus what was composited, so a test sees the result.
// globalThis.__imagescriptFail makes decode throw.
export class Image {
  constructor(width, height, label) {
    this.width = width;
    this.height = height;
    this.label = label;
    this.composites = [];
  }
  static async decode(bytes) {
    if (globalThis.__imagescriptFail) throw new Error(globalThis.__imagescriptFail);
    const text = new TextDecoder().decode(bytes.slice(0, 32));
    const m = /^IMG:(\d+)x(\d+)/.exec(text);
    if (m) return new Image(Number(m[1]), Number(m[2]), "image");
    if (bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
      const view = new DataView(bytes.buffer, bytes.byteOffset);
      return new Image(view.getUint32(16), view.getUint32(20), "mark");
    }
    throw new Error("not an image");
  }
  composite(source, x = 0, y = 0) {
    this.composites.push({ w: source.width, h: source.height, x, y });
    return this;
  }
  async encodeJPEG(quality = 90) {
    return new TextEncoder().encode(`MARKED:${this.width}x${this.height}:q${quality}:` + JSON.stringify(this.composites));
  }
}
