import { NextResponse } from 'next/server';
import { AppError } from './errors';
import { captureServerException } from './monitoring';

export function jsonOk<T>(body: T, status = 200, headers?: HeadersInit) {
  return NextResponse.json(body, { status, headers });
}

export function jsonError(
  err: unknown,
  {
    context,
    fallbackMessage,
    status = 500,
    headers,
  }: {
    context: string;
    fallbackMessage: string;
    status?: number;
    headers?: HeadersInit;
  }
) {
  const isAppError = err instanceof AppError;
  const resolvedStatus = isAppError ? err.status : status;
  const errorDetails =
    err instanceof Error
      ? {
          name: err.name,
          message: err.message,
          stack: err.stack,
          cause: err.cause,
        }
      : { value: err };

  const logPayload = {
    context,
    status: resolvedStatus,
    details: errorDetails,
  };

  if (resolvedStatus >= 500) {
    captureServerException(err, {
      context,
      status: resolvedStatus,
      errorCode: isAppError ? err.code : undefined,
    });
    console.error('API request failed', logPayload);
  } else {
    console.warn('API request rejected', logPayload);
  }

  return NextResponse.json({ error: fallbackMessage }, { status: resolvedStatus, headers });
}
