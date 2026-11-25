/**
 * Scheduled work. The API has no timers of its own (its container sleeps when
 * idle), so the schedule lives here: a Cron Trigger wakes this Worker, which
 * calls the API.
 */

/** Sends students an e-mail about chat messages left unanswered. Once a day. */
export const CHAT_REMINDERS_PATH = '/api/internal/chat-reminders';
export const CRON_SECRET_HEADER = 'x-cron-secret';

export interface CronResult {
  ok: boolean;
  status: number;
  /** What the API answered, for the log. */
  detail: string;
}

/**
 * Runs the daily jobs by calling the API through `callApi`, which is the
 * container in production and the local Node process in development.
 */
export async function runDailyJobs(
  secret: string | undefined,
  callApi: (request: Request) => Promise<Response>,
): Promise<CronResult> {
  if (!secret) {
    return { ok: false, status: 0, detail: 'CRON_SECRET is not set; nothing was run.' };
  }

  const response = await callApi(
    // The host is irrelevant: the request never leaves the gateway's bindings.
    new Request(`http://api.internal${CHAT_REMINDERS_PATH}`, {
      method: 'POST',
      headers: { [CRON_SECRET_HEADER]: secret },
    }),
  );
  const detail = (await response.text()).slice(0, 500);
  return { ok: response.ok, status: response.status, detail };
}
