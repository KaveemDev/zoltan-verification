export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public code = 'ERROR',
    /** Extra JSON fields for the client, e.g. attemptsLeft. */
    public extra?: Record<string, unknown>,
  ) {
    super(message);
  }
}
