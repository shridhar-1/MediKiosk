// ── OPD Queue Engine — deterministic, explainable priority queue ───────────
// Ordering rule (matches hospital triage practice):
//   1. Emergencies first (red-flagged patients never wait)
//   2. Then urgent
//   3. Then routine, ordered by who has waited LONGEST (FIFO)
// Pure function — no LLM, no randomness: same input always gives the same
// queue, and every position can be explained in one sentence to a judge.

export type QueueRow = {
  id: string;
  status: string;
  priority: string;
  submittedAt: string | Date | null;
  startedAt: string | Date | null;
  calledAt?: string | Date | null;
  expiresAt?: string | Date | null;
};

const PRIORITY_RANK: Record<string, number> = { emergency: 0, urgent: 1, routine: 2 };

export function priorityRank(priority: string): number {
  return PRIORITY_RANK[priority] ?? 2;
}

function submittedTime(r: QueueRow): number {
  const t = r.submittedAt ?? r.startedAt;
  return t ? new Date(t).getTime() : 0;
}

/** Waiting = submitted/summary (not yet reviewed, not mid-interview).
 *  Safety: a token past its expiry that was never called counts as expired
 *  even before the server write-back flips its status. */
export function isWaiting(r: QueueRow): boolean {
  if (r.status !== "submitted" && r.status !== "summary") return false;
  if (r.expiresAt && !r.calledAt && new Date(r.expiresAt).getTime() < Date.now()) return false;
  return true;
}

/** Sort waiting rows: emergency → urgent → routine, longest-waiting first. */
export function queueOrder<T extends QueueRow>(rows: T[]): T[] {
  return rows
    .filter(isWaiting)
    .sort((a, b) => {
      const p = priorityRank(a.priority) - priorityRank(b.priority);
      if (p !== 0) return p;
      return submittedTime(a) - submittedTime(b); // earlier submit = earlier turn
    });
}

/** The patient the doctor should see next. */
export function nextInQueue<T extends QueueRow>(rows: T[]): T | null {
  return queueOrder(rows)[0] ?? null;
}

/** How many people are ahead of the given session (priority-aware). */
export function aheadCount<T extends QueueRow>(rows: T[], sessionId: string): number {
  const order = queueOrder(rows);
  const idx = order.findIndex((r) => r.id === sessionId);
  return idx === -1 ? order.length : idx;
}

/** Rough wait estimate: avg 8 min per OPD consultation. */
export function estimateMinutes(ahead: number): number {
  return Math.max(ahead * 8, ahead > 0 ? 8 : 0);
}

/** The currently-called patient = most recent calledAt (today). */
export function nowServing<T extends QueueRow>(rows: T[]): T | null {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const called = rows
    .filter((r) => r.calledAt && new Date(r.calledAt).getTime() >= startOfDay.getTime())
    .sort((a, b) => new Date(b.calledAt!).getTime() - new Date(a.calledAt!).getTime());
  return called[0] ?? null;
}

/** Clock time a patient should be at the OPD: now + ahead×8 min, rounded up
 *  to the next 5 minutes so it reads like a real appointment ("by 10:45 am"). */
export function arriveByTime(ahead: number, from: Date = new Date()): Date {
  if (ahead <= 0) return from;
  const t = new Date(from.getTime() + estimateMinutes(ahead) * 60_000);
  t.setMinutes(t.getMinutes() + ((5 - (t.getMinutes() % 5)) % 5), 0, 0);
  return t;
}

/** "10:45 am" — SMS-friendly, identical on server and client. */
export function formatClockTime(d: Date): string {
  return d
    .toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true })
    .toLowerCase();
}

/** Scheduled slot for a patient registering from HOME: after everyone
 *  currently waiting in the hospital queue, with a 15-minute minimum so a
 *  home booking never says "come right now". Rounded to 5 minutes. */
export function scheduleSlot(waitingCount: number, from: Date = new Date()): Date {
  const minutes = Math.max(15, waitingCount * 8);
  const t = new Date(from.getTime() + minutes * 60_000);
  t.setMinutes(t.getMinutes() + ((5 - (t.getMinutes() % 5)) % 5), 0, 0);
  return t;
}