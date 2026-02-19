import { NextResponse } from 'next/server';

export function jsonOk<T>(body: T, status = 200) {
  return NextResponse.json(body, { status });
}

export function jsonError(
  err: unknown,
  {
    context,
    fallbackMessage,
    status = 500,
  }: {
    context: string;
    fallbackMessage: string;
    status?: number;
  }
) {
  console.error(`Error in ${context}:`, err);
  const message = err instanceof Error ? err.message : fallbackMessage;
  return NextResponse.json({ error: message }, { status });
}
