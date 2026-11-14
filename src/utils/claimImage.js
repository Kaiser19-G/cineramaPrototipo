// Preparacion de fotos para un reclamo de DNI, en el navegador:
// 1. reconoce el tipo por los bytes (no por la extension), 2. recodifica a JPEG con un lienzo (canvas), lo que
// corrige la orientacion, reduce el tamano y ELIMINA los metadatos EXIF (ubicacion). El servidor no los quita:
// solo valida y guarda lo que recibe (ver la politica de datos).
export const MAX_BYTES = 5 * 1024 * 1024;
const MAX_SIDE = 2000;

const ascii = (u8, a, b) => String.fromCharCode(...u8.subarray(a, b));

// -> 'jpeg' | 'png' | 'webp' | 'heic' | null
export async function sniffImage(file) {
  const u8 = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  if (u8[0] === 0xFF && u8[1] === 0xD8 && u8[2] === 0xFF) return 'jpeg';
  if (u8[0] === 0x89 && ascii(u8, 1, 4) === 'PNG') return 'png';
  if (ascii(u8, 0, 4) === 'RIFF' && ascii(u8, 8, 12) === 'WEBP') return 'webp';
  if (ascii(u8, 4, 8) === 'ftyp' && /^(heic|heix|hevc|hevx|heim|heis|mif1|msf1)/.test(ascii(u8, 8, 12))) return 'heic';
  return null;
}

export const formatSize = (n) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1).replace('.', ',')} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

const toBlob = (canvas, quality) => new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));

// -> { blob } | { error: 'heic' | 'type' | 'too_large' }
export async function prepareImage(file) {
  const kind = await sniffImage(file);
  if (kind === 'heic') return { error: 'heic' };
  if (!kind) return { error: 'type' };
  let bitmap;
  try { bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch { bitmap = null; }
  if (!bitmap) {
    // No se pudo decodificar (o el navegador no sabe): se envia tal cual si cabe; el servidor la valida.
    return file.size > MAX_BYTES ? { error: 'too_large' } : { blob: file };
  }
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff'; // fondo para PNG con transparencia
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  for (const q of [0.85, 0.7, 0.55]) {
    const blob = await toBlob(canvas, q);
    if (blob && blob.size <= MAX_BYTES) return { blob };
  }
  return { error: 'too_large' };
}
