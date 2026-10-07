// A cleanup failure should fail successful work, but never replace its original error.
export async function withCleanup<T>(
  work: () => Promise<T>, cleanup: () => Promise<void>, warn: (message: string) => void,
): Promise<T> {
  let failed = false;
  try {
    return await work();
  } catch (error) {
    failed = true;
    throw error;
  } finally {
    try { await cleanup(); }
    catch (error) {
      if (!failed) throw error;
      // Even a broken diagnostic sink must not hide the original failure.
      try { warn(`Cleanup failed: ${error instanceof Error ? error.message : String(error)}`); }
      catch { /* Preserve the original error. */ }
    }
  }
}
