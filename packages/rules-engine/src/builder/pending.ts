import { emptyState, type CampaignSettings, type CharacterBuild } from '@ps/content-schema';
import type { ContentIndex } from '../content-index';
import { computeWithPipeline } from '../compute';
import type { PendingChoice } from '../types';

/** Незавершённые выборы сборки (SPEC §8.1). */
export function pendingChoices(build: CharacterBuild, content: ContentIndex, rules: CampaignSettings): PendingChoice[] {
  return computeWithPipeline(build, emptyState(), content, rules).sheet.pendingChoices;
}
