import cron from 'node-cron';
import { getDb } from './db/client';
import { purgeTrash } from './services/notes';

let started = false;

/** Ежедневные задачи: окончательное удаление заметок из корзины старше 30 дней (§11.5). */
export function startJobs() {
  if (started || process.env.DISABLE_JOBS === '1') return;
  started = true;
  const purge = () =>
    purgeTrash(getDb())
      .then((n) => {
        if (n > 0) console.info(`[jobs] корзина заметок: удалено ${n}`);
      })
      .catch((e: unknown) => console.error('[jobs] очистка корзины не удалась', e instanceof Error ? e.message : e));
  cron.schedule('17 4 * * *', purge, { name: 'purge-note-trash' });
  // Первый прогон — вскоре после старта (если сервер перезапускается чаще, чем раз в сутки).
  setTimeout(purge, 60_000).unref();
}
