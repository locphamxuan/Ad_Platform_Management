import type { ErrorRequestHandler, NextFunction, Request, RequestHandler, Response } from 'express';
import { ZodError } from 'zod';
import { AppError, TooManyRequestsError } from '../domain/errors.js';

/**
 * Forwards async errors to the error handler (Express 4 does not do this itself).
 * With `next: true` the handler acts as middleware and passes control on success.
 */
export const asyncHandler =
  (handler: (req: Request, res: Response) => Promise<unknown>, options = { next: false }): RequestHandler =>
  (req: Request, res: Response, next: NextFunction) => {
    handler(req, res).then(() => options.next && next(), next);
  };

export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof ZodError) {
    res.status(400).json({
      code: 'VALIDATION_ERROR',
      message: error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
    });
    return;
  }
  if (error instanceof AppError) {
    if (error instanceof TooManyRequestsError) res.setHeader('Retry-After', String(error.retryAfterSeconds));
    res.status(error.httpStatus).json({ code: error.code, message: error.message });
    return;
  }
  console.error(error);
  res.status(500).json({ code: 'INTERNAL_ERROR', message: 'Unexpected server error' });
};
