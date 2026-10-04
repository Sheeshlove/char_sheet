import cron from 'node-cron';
import { getDb } from './db/client';
import { purgeTrash } from './services/notes';
import { errorFields, log } from './log';

let started = false;

/** Ежедневные задачи: окончательное удаление заметок из корзины старше 30 дней (§11.5). */
export function startJobs() {
  if (started || process.env.DISABLE_JOBS === '1') return;
  started = true;
  const purge = () =>
    purgeTrash(getDb())
      .then((n) => {
        if (n > 0) log.info({ job: 'purge-note-trash', removed: n }, 'корзина заметок очищена');
      })
      .catch((e: unknown) => log.error({ job: 'purge-note-trash', ...errorFields(e) }, 'очистка корзины не удалась'));
  cron.schedule('17 4 * * *', purge, { name: 'purge-note-trash' });
  // Первый прогон — вскоре после старта (если сервер перезапускается чаще, чем раз в сутки).
  setTimeout(purge, 60_000).unref();
}
