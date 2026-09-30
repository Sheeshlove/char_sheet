/** Фоновые задачи процесса `web` (SPEC §11.5): только в Node.js-рантайме. */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startJobs } = await import('./server/jobs');
    startJobs();
  }
}
