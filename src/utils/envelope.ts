/**
 * Wraps array results in a standard API response envelope.
 * This makes the API look professional on RapidAPI and provides
 * useful pagination metadata to consumers.
 */
export function envelope<T>(
  data: T[],
  opts: { limit: number; offset: number; total?: number }
) {
  const total = opts.total ?? data.length;
  return {
    success: true,
    data,
    meta: {
      total,
      limit: opts.limit,
      offset: opts.offset,
      has_more: opts.offset + opts.limit < total,
    },
  };
}

/**
 * Wraps a single object result in a standard API response envelope.
 */
export function envelopeSingle<T>(data: T) {
  return {
    success: true,
    data,
  };
}

/**
 * Wraps an error in the same envelope shape as successful responses, so
 * consumers can branch on `success` without special-casing failures.
 */
export function errorEnvelope(
  statusCode: number,
  error: string,
  details?: unknown[]
) {
  return {
    success: false,
    error,
    statusCode,
    ...(details ? { details } : {}),
  };
}
