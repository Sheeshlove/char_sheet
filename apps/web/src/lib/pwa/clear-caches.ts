/**
 * При выходе удаляем кэши service worker с данными пользователя (листы, страницы, ответы API),
 * чтобы на общем устройстве следующий человек не увидел их без сети. Прекэш статики остаётся.
 */
export async function clearPrivateCaches(): Promise<void> {
  if (typeof caches === 'undefined') return;
  try {
    const names = await caches.keys();
    await Promise.all(names.filter((n) => !n.includes('precache')).map((n) => caches.delete(n)));
  } catch {
    // Кэш недоступен (приватный режим и т. п.) — выходить это не мешает.
  }
}
