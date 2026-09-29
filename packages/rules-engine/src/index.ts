/**
 * Движок правил D&D 5e (2014): чистые детерминированные функции без I/O (SPEC §8).
 */
export { ENGINE_VERSION } from './version';
export { compute, computeWithPipeline } from './compute';
export { pendingChoices } from './builder/pending';
export { validateBuild, meetsMulticlass, describeRequirement } from './builder/validate';
export { levelUpOptions, applyLevelUp, undoLastLevel } from './builder/level-up';
export { applyCommand, initialState } from './state/commands';
export { summarize } from './summary';
export { ContentIndex, createContentIndex } from './content-index';
export { evalExpr, evalNumber, evalBool, parseExpr, ExprError, type ExprContext, type ExprValue } from './expr/evaluate';
export { resolveValPath } from './pipeline/overrides';
export * from './dice';
export * from './types';
export * from './tables/xp';
export * from './tables/spell-slots';
export * from './tables/abilities';
export * from './tables/labels';
export * from './tables/sizes';
export { CONDITION_EFFECTS, exhaustionEffects } from './tables/conditions';
