import { NextResponse } from 'next/server';
import { AppError } from './errors';

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
  console.error(`Error in ${context}:`, err);
  const isAppError = err instanceof AppError;
  const resolvedStatus = isAppError ? err.status : status;
  const message = isAppError
    ? (err.expose ? err.message : fallbackMessage)
    : (process.env.NODE_ENV !== 'production' && err instanceof Error ? err.message : fallbackMessage);
  return NextResponse.json({ error: message }, { status: resolvedStatus, headers });
}
