export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly fields?: Record<string, string>,
  ) {
    super(message);
  }
}

export const badRequest = (message: string, fields?: Record<string, string>) =>
  new AppError(400, 'validation_error', message, fields);
export const unauthorized = (message = 'Sign in to continue.') =>
  new AppError(401, 'unauthorized', message);
export const forbidden = (message = 'You are not allowed to do that.') =>
  new AppError(403, 'forbidden', message);
// Also used when the caller is not a member, so a group's existence is not revealed.
export const notFound = (what = 'Page') => new AppError(404, 'not_found', `${what} not found.`);
export const conflict = (message: string) => new AppError(409, 'conflict', message);
