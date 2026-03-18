import type { Job } from '../types';
import { parseErrorResponseMessage } from './utils';

export type RequestError = Error & {
  endpoint?: string;
  status?: number;
  userMessage?: string;
};

type JobsResponse = {
  jobs?: Job[];
};

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
type WaitLike = (ms: number) => Promise<void>;

export const JOBS_ENDPOINT = '/api/jobs';
export const JOBS_LOAD_ERROR_MESSAGE = 'We couldn\'t load opportunities right now. Please try again.';
export const JOBS_RETRY_DELAY_MS = 350;

function delay(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

function assignJobsFetchMeta(err: RequestError, userMessage: string) {
  err.endpoint = JOBS_ENDPOINT;
  err.userMessage = userMessage;
  return err;
}

function httpRequestError(message: string, status: number) {
  const err = new Error(message) as RequestError;
  err.status = status;
  return assignJobsFetchMeta(err, message);
}

function normalizeNetworkError(err: unknown) {
  if (err instanceof Error) {
    return assignJobsFetchMeta(err as RequestError, JOBS_LOAD_ERROR_MESSAGE);
  }

  return assignJobsFetchMeta(new Error(JOBS_LOAD_ERROR_MESSAGE) as RequestError, JOBS_LOAD_ERROR_MESSAGE);
}

function shouldRetryJobsLoad(err: RequestError, attempt: number) {
  return attempt === 0 && err instanceof TypeError && typeof err.status !== 'number';
}

export async function loadJobs(fetchImpl: FetchLike = fetch, wait: WaitLike = delay): Promise<Job[]> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetchImpl(JOBS_ENDPOINT);
      if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw httpRequestError(parseErrorResponseMessage(text, JOBS_LOAD_ERROR_MESSAGE), response.status);
      }

      const data = await response.json() as JobsResponse;
      return Array.isArray(data.jobs) ? data.jobs : [];
    } catch (err) {
      const requestError = err instanceof TypeError ? normalizeNetworkError(err) : err as RequestError;
      if (shouldRetryJobsLoad(requestError, attempt)) {
        await wait(JOBS_RETRY_DELAY_MS);
        continue;
      }
      throw requestError;
    }
  }

  throw assignJobsFetchMeta(new Error(JOBS_LOAD_ERROR_MESSAGE) as RequestError, JOBS_LOAD_ERROR_MESSAGE);
}
