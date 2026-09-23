/**
 * fetch() with retries for the data importers. Government portals drop
 * connections now and then; a transient failure should cost a retry, not a
 * missing institute in a committed snapshot. HTTP error statuses are returned
 * as-is (a 404 is an answer, not a transient failure).
 */
export async function fetchWithRetry(url: string, init: RequestInit = {}, attempts = 4): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fetch(url, init);
    } catch (err) {
      lastError = err;
      if (attempt < attempts) await new Promise((r) => setTimeout(r, 2000 * 2 ** (attempt - 1)));
    }
  }
  throw new Error(`${url}: network error after ${attempts} attempts (${lastError instanceof Error ? lastError.message : lastError})`);
}
