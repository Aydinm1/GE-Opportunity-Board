'use client';

import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.withScope((scope) => {
      scope.setLevel('error');
      scope.setTag('surface', 'render');
      scope.setTag('operation', 'global_error_boundary');
      if (error.digest) scope.setTag('digest', error.digest);
      Sentry.captureException(error);
    });
  }, [error]);

  return (
    <html lang="en">
      <body className="bg-background-light text-black font-body antialiased">
        <main className="min-h-screen flex items-center justify-center px-6">
          <div className="max-w-md text-center space-y-4">
            <h1 className="text-2xl font-bold">Something went wrong.</h1>
            <p className="text-sm text-gray-600">
              The issue has been logged. Please try again.
            </p>
            <button
              type="button"
              onClick={() => reset()}
              className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white"
            >
              Try again
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}
