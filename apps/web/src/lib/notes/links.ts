/** Адрес цели ссылки в приложении. */
export function linkHref(target: { targetType: string; targetId: string }, campaignId: string | null): string | null {
  switch (target.targetType) {
    case 'note':
      return campaignId ? `/campaigns/${campaignId}/notes/${target.targetId}` : `/notes/${target.targetId}`;
    case 'character':
      return `/characters/${target.targetId}`;
    case 'content': {
      const [pack, kind, ...slug] = target.targetId.split('/');
      return pack && kind && slug.length ? `/library/${kind}/${pack}/${slug.join('/')}` : null;
    }
    default:
      return null;
  }
}
