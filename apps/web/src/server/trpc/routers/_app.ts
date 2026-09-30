import { publicProcedure, router } from '../init';
import { authRouter } from './auth';
import { adminRouter } from './admin';
import { campaignsRouter } from './campaigns';
import { charactersRouter } from './characters';
import { contentRouter } from './content';

export const appRouter = router({
  /** Гард: публичный доступ (проверка живости). */
  health: publicProcedure.query(() => ({ ok: true as const })),
  auth: authRouter,
  admin: adminRouter,
  campaigns: campaignsRouter,
  characters: charactersRouter,
  content: contentRouter,
});

export type AppRouter = typeof appRouter;
