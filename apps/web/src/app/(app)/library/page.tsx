import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ru } from '@/i18n/ru';
import { LibraryList } from '@/features/library/library-list';

export const metadata: Metadata = { title: ru.library.title };

export default function LibraryPage() {
  return (
    <Suspense>
      <LibraryList />
    </Suspense>
  );
}
