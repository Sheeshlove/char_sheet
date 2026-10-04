/** `pnpm admin:bootstrap` — создать первого администратора из ADMIN_EMAIL / ADMIN_PASSWORD. */
import { getDb, getSql } from './client';
import { bootstrapAdmin } from './bootstrap';

bootstrapAdmin(getDb(), { email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD })
  .then(async (r) => {
    console.log(
      r === 'created'
        ? 'Администратор создан'
        : r === 'skipped'
          ? 'Пользователи уже есть — пропущено'
          : 'ADMIN_EMAIL и ADMIN_PASSWORD не заданы — пропущено',
    );
    await getSql().end();
  })
  .catch(async (e) => {
    console.error(e instanceof Error ? e.message : e);
    await getSql().end();
    process.exit(1);
  });
