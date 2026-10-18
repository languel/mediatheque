/**
 * Minimal browser-side ZIP builder (STORE mode, no external dependencies)
 * Used by Mediathèque's "Download selection (.zip)" to bundle media files,
 * per-item JSON metadata, and a combined CREDITS.md in the browser.
 */
(function (global) {
  "use strict";

  const CRC_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let k = 0; k < 8; k++) {
        c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      }
      table[i] = c >>> 0;
    }
    return table;
  })();

  function crc32(bytes) {
    let crc = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) {
      crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  function createZipBlob(files) {
    // files: Array<{ name: string, data: Uint8Array }>
    const encoder = new TextEncoder();
    const localParts = [];
    const centralParts = [];
    let offset = 0;

    for (const file of files) {
      const nameBytes = encoder.encode(file.name);
      const data = file.data instanceof Uint8Array ? file.data : encoder.encode(String(file.data));
      const crc = crc32(data);
      const size = data.length;

      // Local file header (30 bytes + name)
      const localHeader = new ArrayBuffer(30 + nameBytes.length);
      const lv = new DataView(localHeader);
      lv.setUint32(0, 0x04034b50, true); // signature
      lv.setUint16(4, 20, true);         // version needed
      lv.setUint16(6, 0x0800, true);     // UTF-8 flag
      lv.setUint16(8, 0, true);          // compression: STORE (0)
      lv.setUint16(10, 0, true);         // mod time
      lv.setUint16(12, 0x5521, true);    // mod date
      lv.setUint32(14, crc, true);
      lv.setUint32(18, size, true);      // compressed size
      lv.setUint32(22, size, true);      // uncompressed size
      lv.setUint16(26, nameBytes.length, true);
      lv.setUint16(28, 0, true);         // extra length
      new Uint8Array(localHeader, 30).set(nameBytes);

      localParts.push(new Uint8Array(localHeader), data);

      // Central directory header (46 bytes + name)
      const centralHeader = new ArrayBuffer(46 + nameBytes.length);
      const cv = new DataView(centralHeader);
      cv.setUint32(0, 0x02014b50, true);
      cv.setUint16(4, 20, true);
      cv.setUint16(6, 20, true);
      cv.setUint16(8, 0x0800, true);
      cv.setUint16(10, 0, true);
      cv.setUint16(12, 0, true);
      cv.setUint16(14, 0x5521, true);
      cv.setUint32(16, crc, true);
      cv.setUint32(20, size, true);
      cv.setUint32(24, size, true);
      cv.setUint16(28, nameBytes.length, true);
      cv.setUint16(30, 0, true);
      cv.setUint16(32, 0, true);
      cv.setUint16(34, 0, true);
      cv.setUint16(36, 0, true);
      cv.setUint32(38, 0, true);
      cv.setUint32(42, offset, true);
      new Uint8Array(centralHeader, 46).set(nameBytes);

      centralParts.push(new Uint8Array(centralHeader));
      offset += 30 + nameBytes.length + size;
    }

    let centralSize = 0;
    for (const c of centralParts) centralSize += c.length;

    const eocd = new ArrayBuffer(22);
    const ev = new DataView(eocd);
    ev.setUint32(0, 0x06054b50, true);
    ev.setUint16(4, 0, true);
    ev.setUint16(6, 0, true);
    ev.setUint16(8, files.length, true);
    ev.setUint16(10, files.length, true);
    ev.setUint32(12, centralSize, true);
    ev.setUint32(16, offset, true);
    ev.setUint16(20, 0, true);

    return new Blob([...localParts, ...centralParts, new Uint8Array(eocd)], {
      type: "application/zip",
    });
  }

  global.MediathequeZip = { createZipBlob };
})(window);
