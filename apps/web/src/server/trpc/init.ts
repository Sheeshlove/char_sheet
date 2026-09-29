import { initTRPC } from '@trpc/server';
import superjson from 'superjson';
import { ZodError } from 'zod';
import type { Context } from './context';
import { requireAdmin, requireUser } from '../auth/guards';

const t = initTRPC.context<Context>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        zodIssues: error.cause instanceof ZodError ? error.cause.issues.map((i) => i.path.join('.')) : null,
      },
    };
  },
});

export const router = t.router;
export const createCallerFactory = t.createCallerFactory;

/**
 * Публичная процедура. Разрешена только для входа/регистрации/сброса и справочных пингов;
 * гард прав в ней — явный `publicAccess` (SPEC §5.3: каждая процедура вызывает гард).
 */
export const publicProcedure = t.procedure;

/** Процедура для вошедшего пользователя: гард `requireUser`. */
export const authedProcedure = t.procedure.use(({ ctx, next }) => {
  const user = requireUser(ctx);
  return next({ ctx: { ...ctx, user } });
});

/** Процедура администратора сайта: гард `requireAdmin`. */
export const adminProcedure = t.procedure.use(({ ctx, next }) => {
  const user = requireAdmin(ctx);
  return next({ ctx: { ...ctx, user } });
});
