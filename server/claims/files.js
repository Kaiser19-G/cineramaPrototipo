// Archivos de reclamo: deteccion del tipo real por bytes y almacenamiento privado.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const startsWith = (buf, bytes, at = 0) => buf.length >= at + bytes.length && bytes.every((b, i) => buf[at + i] === b);
const ascii = (buf, from, to) => buf.subarray(from, to).toString('latin1');

// -> { mime, ext } | { error: 'heic' | 'unsupported' | 'corrupt' }
export function detectImage(buf) {
  if (startsWith(buf, [0xFF, 0xD8, 0xFF])) {
    // JPEG: debe terminar en EOI (se toleran bytes de relleno al final).
    const tail = buf.subarray(Math.max(0, buf.length - 64));
    return tail.includes(Buffer.from([0xFF, 0xD9])) ? { mime: 'image/jpeg', ext: 'jpg' } : { error: 'corrupt' };
  }
  if (startsWith(buf, [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])) {
    const ok = ascii(buf, 12, 16) === 'IHDR' && ascii(buf, buf.length - 8, buf.length - 4) === 'IEND';
    return ok ? { mime: 'image/png', ext: 'png' } : { error: 'corrupt' };
  }
  if (ascii(buf, 0, 4) === 'RIFF' && ascii(buf, 8, 12) === 'WEBP') {
    // Longitud declarada por el contenedor RIFF: no puede superar lo recibido (archivo truncado).
    return buf.length >= 20 && buf.readUInt32LE(4) + 8 <= buf.length
      ? { mime: 'image/webp', ext: 'webp' } : { error: 'corrupt' };
  }
  if (ascii(buf, 4, 8) === 'ftyp' && /^(heic|heix|hevc|hevx|heim|heis|mif1|msf1)/.test(ascii(buf, 8, 12))) return { error: 'heic' };
  return { error: 'unsupported' };
}

export const STORED_NAME_RE = /^[0-9a-f]{32}$/;

export function createFileStore(dir, log = console) {
  const full = (name) => {
    if (!STORED_NAME_RE.test(name)) throw new Error('nombre invalido');
    return path.join(dir, name);
  };
  return {
    dir,
    full,
    // Escritura atomica (.part + rename), modo 0600. Devuelve el nombre generado por el servidor.
    write(buf) {
      const name = crypto.randomBytes(16).toString('hex');
      const tmp = path.join(dir, name + '.part');
      fs.writeFileSync(tmp, buf, { flag: 'wx', mode: 0o600 });
      fs.renameSync(tmp, path.join(dir, name));
      return name;
    },
    // true si el archivo ya no existe (borrado o ausente); false si no se pudo borrar.
    remove(name) {
      try { fs.unlinkSync(full(name)); return true; } catch (e) {
        if (e.code === 'ENOENT') return true;
        log.error(`[claims] no se pudo borrar un archivo (${e.code || 'error'})`);
        return false;
      }
    },
    read: (name) => fs.readFileSync(full(name)),
    list: () => fs.readdirSync(dir),
    statMtime: (name) => fs.statSync(path.join(dir, name)).mtimeMs,
    removeRaw(name) { try { fs.unlinkSync(path.join(dir, name)); return true; } catch (e) { return e.code === 'ENOENT'; } },
  };
}
