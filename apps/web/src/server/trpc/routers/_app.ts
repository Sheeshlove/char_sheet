import { publicProcedure, router } from '../init';
import { authRouter } from './auth';
import { adminRouter } from './admin';
import { campaignsRouter } from './campaigns';
import { charactersRouter } from './characters';
import { contentRouter } from './content';
import { notesRouter } from './notes';
import { tagsRouter } from './tags';
import { boardsRouter } from './boards';
import { filtersRouter } from './filters';
import { rollsRouter } from './rolls';
import { homebrewRouter } from './homebrew';

export const appRouter = router({
  /** Гард: публичный доступ (проверка живости). */
  health: publicProcedure.query(() => ({ ok: true as const })),
  auth: authRouter,
  admin: adminRouter,
  campaigns: campaignsRouter,
  characters: charactersRouter,
  content: contentRouter,
  notes: notesRouter,
  tags: tagsRouter,
  boards: boardsRouter,
  filters: filtersRouter,
  rolls: rollsRouter,
  homebrew: homebrewRouter,
});

export type AppRouter = typeof appRouter;
