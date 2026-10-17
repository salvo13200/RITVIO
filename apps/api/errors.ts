export class AppError extends Error {
  constructor(public status: number, public code: string, message: string, public retryAt?: string) { super(message); }
}
