import { z } from 'zod';
import { ABILITIES, CONDITIONS, CONTENT_KEY_RE, DAMAGE_TYPES, SIZES, SKILLS } from './constants';

/** Схемы zod для констант из `./constants`. */
export const abilitySchema = z.enum(ABILITIES);
export const skillSchema = z.enum(SKILLS);
export const sizeSchema = z.enum(SIZES);
export const damageTypeSchema = z.enum(DAMAGE_TYPES);
export const conditionSchema = z.enum(CONDITIONS);
export const exprSchema = z.string().min(1).max(500);
export const contentKeySchema = z.string().regex(CONTENT_KEY_RE);
