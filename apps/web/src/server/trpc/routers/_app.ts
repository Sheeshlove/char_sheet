import { publicProcedure, router } from '../init';
import { authRouter } from './auth';
import { adminRouter } from './admin';
import { campaignsRouter } from './campaigns';

export const appRouter = router({
  /** Гард: публичный доступ (проверка живости). */
  health: publicProcedure.query(() => ({ ok: true as const })),
  auth: authRouter,
  admin: adminRouter,
  campaigns: campaignsRouter,
});

export type AppRouter = typeof appRouter;
