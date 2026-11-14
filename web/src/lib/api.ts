import type { FieldErrors } from './machines.ts';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly fields: FieldErrors = {},
  ) {
    super(message);
  }
}

const OFFLINE = new ApiError(0, 'offline', 'Could not reach Hati. Check your connection.');

// Every call goes through here: same-origin, cookie sent by the browser, one error shape.
export async function api<T>(
  method: string,
  path: string,
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      method,
      signal,
      headers: body === undefined ? undefined : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw OFFLINE;
  }
  if (response.status === 204) return undefined as T;
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const error = payload?.error;
    throw new ApiError(
      response.status,
      error?.code ?? 'unknown',
      error?.message ?? 'Something went wrong. Try again.',
      error?.fields,
    );
  }
  return payload as T;
}

export const toFailure = (error: unknown) =>
  error instanceof ApiError
    ? { message: error.message, code: error.code, fields: error.fields }
    : { message: 'Something went wrong. Try again.', code: 'unknown', fields: {} };
