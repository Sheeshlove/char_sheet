import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { getDb } from '@/server/db/client';
import { characters, files, notes } from '@/server/db/schema';
import { getRouteUser } from '@/server/auth/route';
import { characterAccessInput, noteAccessInput } from '@/server/auth/guards';
import { canEditCharacterBuild, canEditNote } from '@/server/auth/access';
import { isSameOrigin } from '@/server/http/origin';
import { MAX_UPLOAD_BYTES, processNoteImage, processPortrait, removeFile, saveFile, UploadError } from '@/server/files/storage';
import { logEvent } from '@/server/services/characters';

export const dynamic = 'force-dynamic';

const json = (body: unknown, status = 200) => Response.json(body, { status });

/**
 * `POST /api/files` — загрузка картинки (SPEC §15): портрет персонажа (§9 шаг 7) или
 * картинка в заметке (§11.1). Форма: `file`, `attachedType=portrait|note`, `attachedId`.
 */
export async function POST(req: Request) {
  if (!isSameOrigin(req)) return json({ error: 'FORBIDDEN' }, 403);
  const user = await getRouteUser(req);
  if (!user) return json({ error: 'UNAUTHORIZED' }, 401);
  const len = Number(req.headers.get('content-length') ?? 0);
  if (len > MAX_UPLOAD_BYTES + 64 * 1024) return json({ error: 'fileTooLarge' }, 413);

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return json({ error: 'BAD_REQUEST' }, 400);
  }
  const file = form.get('file');
  const attachedType = form.get('attachedType');
  const attachedId = String(form.get('attachedId') ?? '');
  if (!(file instanceof File) || (attachedType !== 'portrait' && attachedType !== 'note') || !/^[0-9a-f-]{36}$/i.test(attachedId)) {
    return json({ error: 'BAD_REQUEST' }, 400);
  }
  if (file.size > MAX_UPLOAD_BYTES) return json({ error: 'fileTooLarge' }, 413);

  const db = getDb();
  if (attachedType === 'note') return uploadNoteImage(db, user, file, attachedId);
  const [character] = await db.select().from(characters).where(eq(characters.id, attachedId));
  if (!character) return json({ error: 'NOT_FOUND' }, 404);
  const access = await characterAccessInput({ db, user }, character);
  if (!canEditCharacterBuild(access)) return json({ error: 'FORBIDDEN' }, 403);

  let webp: Buffer;
  try {
    webp = await processPortrait(Buffer.from(await file.arrayBuffer()));
  } catch (e) {
    if (e instanceof UploadError) return json({ error: e.key }, e.key === 'fileTooLarge' ? 413 : 415);
    throw e;
  }
  const id = randomUUID();
  await saveFile(id, webp);
  await db.insert(files).values({
    id,
    ownerId: user.id,
    path: `${id}.webp`,
    mime: 'image/webp',
    sizeBytes: webp.byteLength,
    attachedType: 'portrait',
    attachedId,
  });
  const previous = character.portraitPath;
  await db.update(characters).set({ portraitPath: id, updatedAt: new Date() }).where(eq(characters.id, attachedId));
  if (previous) {
    await db.delete(files).where(and(eq(files.id, previous), eq(files.attachedId, attachedId)));
    await removeFile(previous);
  }
  await logEvent(db, attachedId, user.id, 'character.portrait', { fileId: id });
  return json({ id, url: `/api/files/${id}` });
}

/** Картинка в заметке. Гард: `canEditNote`. */
async function uploadNoteImage(db: ReturnType<typeof getDb>, user: NonNullable<Awaited<ReturnType<typeof getRouteUser>>>, file: File, noteId: string) {
  const [note] = await db.select().from(notes).where(eq(notes.id, noteId));
  if (!note || note.deletedAt) return json({ error: 'NOT_FOUND' }, 404);
  if (!canEditNote(await noteAccessInput({ db, user }, note))) return json({ error: 'FORBIDDEN' }, 403);
  let webp: Buffer;
  try {
    webp = await processNoteImage(Buffer.from(await file.arrayBuffer()));
  } catch (e) {
    if (e instanceof UploadError) return json({ error: e.key }, e.key === 'fileTooLarge' ? 413 : 415);
    throw e;
  }
  const id = randomUUID();
  await saveFile(id, webp);
  await db.insert(files).values({
    id,
    ownerId: user.id,
    path: `${id}.webp`,
    mime: 'image/webp',
    sizeBytes: webp.byteLength,
    attachedType: 'note',
    attachedId: noteId,
  });
  return json({ id, url: `/api/files/${id}` });
}
