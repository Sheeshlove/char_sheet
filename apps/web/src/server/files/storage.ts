import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import sharp from 'sharp';

/** Файлы (SPEC §4.6, §15): картинки ≤ 5 МБ, png/jpeg/webp → WebP через sharp. */
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const ACCEPTED_FORMATS = new Set(['png', 'jpeg', 'webp']);

export function uploadDir(): string {
  // Каталог данных, а не исходники: трассировщику сборки его обходить не нужно.
  return resolve(/* turbopackIgnore: true */ process.env.UPLOAD_DIR ?? './uploads');
}

/** Путь файла внутри каталога загрузок (имя — только id, без пользовательского ввода). */
export function filePath(id: string): string {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error('bad file id');
  return join(uploadDir(), `${id}.webp`);
}

export class UploadError extends Error {
  constructor(readonly key: 'fileTooLarge' | 'fileType') {
    super(key);
  }
}

/** Портрет: формат проверяется по содержимому, обрезка до квадрата 512×512, WebP. */
export async function processPortrait(input: Buffer): Promise<Buffer> {
  if (input.byteLength > MAX_UPLOAD_BYTES) throw new UploadError('fileTooLarge');
  let format: string | undefined;
  try {
    format = (await sharp(input).metadata()).format;
  } catch {
    throw new UploadError('fileType');
  }
  if (!format || !ACCEPTED_FORMATS.has(format)) throw new UploadError('fileType');
  return sharp(input, { limitInputPixels: 40_000_000 })
    .rotate()
    .resize(512, 512, { fit: 'cover', position: 'attention' })
    .webp({ quality: 85 })
    .toBuffer();
}

export async function saveFile(id: string, data: Buffer) {
  await mkdir(uploadDir(), { recursive: true });
  await writeFile(filePath(id), data);
}

export async function readStoredFile(id: string): Promise<Buffer | null> {
  try {
    return await readFile(filePath(id));
  } catch {
    return null;
  }
}

export async function removeFile(id: string) {
  await rm(filePath(id), { force: true });
}
