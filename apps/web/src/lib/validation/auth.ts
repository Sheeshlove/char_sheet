import { z } from 'zod';
import { ru } from '@/i18n/ru';

export const MIN_PASSWORD = 10;

export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9_]{3,32}$/, ru.errors.usernameInvalid);

export const emailSchema = z.string().trim().toLowerCase().pipe(z.email(ru.validation.email)).pipe(z.string().max(254));

export const passwordSchema = z.string().min(MIN_PASSWORD, ru.errors.passwordTooShort).max(256);

export const displayNameSchema = z
  .string()
  .trim()
  .min(1, ru.validation.required)
  .max(64, ru.validation.tooLong(64));

export const registerInput = z.object({
  email: emailSchema,
  username: usernameSchema,
  displayName: displayNameSchema,
  password: passwordSchema,
  inviteCode: z.string().trim().toUpperCase().max(64).optional().default(''),
});
export type RegisterInput = z.input<typeof registerInput>;

export const loginInput = z.object({
  login: z.string().trim().min(1, ru.validation.required).max(254),
  password: z.string().min(1, ru.validation.required).max(256),
});

export const changePasswordInput = z.object({
  currentPassword: z.string().min(1, ru.validation.required).max(256),
  newPassword: passwordSchema,
});

export const resetWithTokenInput = z.object({
  token: z.string().regex(/^[0-9a-f]{64}$/),
  password: passwordSchema,
});

export const updateProfileInput = z.object({
  displayName: displayNameSchema,
});
