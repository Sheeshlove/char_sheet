import type { ContentEntity } from '@ps/content-schema';
import { createContentIndex } from '../../src';
import { CLASSES } from './mini-classes';
import { OTHER } from './mini-other';

/**
 * Рукописный мини-набор контента для эталонных тестов (SPEC §8.13): только то, что нужно
 * эталонам, чтобы движок не зависел от импорта. Данные — по SRD 5.1 / PHB 2014.
 */
export const MINI_ENTITIES: ContentEntity[] = [...CLASSES, ...OTHER];
export const mini = createContentIndex(MINI_ENTITIES);
