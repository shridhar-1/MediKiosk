// ── OPD Queue Engine — deterministic, explainable priority queue ───────────
// Emergency → urgent → routine (longest waiting first). Pure function.

export type QueueRow = {
  id: string;
  status: string;
  priority: string;
  submittedAt: string | Date | null;
  startedAt: string | Date | null;
  calledAt?: string | Date | null;
};

const PRIORITY_RANK: Record<string, number> = { emergency: 0, urgent: 1, routine: 2 };

export function priorityRank(priority: string): number {
  return PRIORITY_RANK[priority] ?? 2;
}

function submittedTime(r: QueueRow): number {
  const t = r.submittedAt ?? r.startedAt;
  return t ? new Date(t).getTime() : 0;
}

export function isWaiting(r: QueueRow): boolean {
  return r.status === "submitted" || r.status === "summary";
}

export function queueOrder<T extends QueueRow>(rows: T[]): T[] {
  return rows
    .filter(isWaiting)
    .sort((a, b) => {
      const p = priorityRank(a.priority) - priorityRank(b.priority);
      if (p !== 0) return p;
      return submittedTime(a) - submittedTime(b);
    });
}

export function nextInQueue<T extends QueueRow>(rows: T[]): T | null {
  return queueOrder(rows)[0] ?? null;
}

export function aheadCount<T extends QueueRow>(rows: T[], sessionId: string): number {
  const order = queueOrder(rows);
  const idx = order.findIndex((r) => r.id === sessionId);
  return idx === -1 ? order.length : idx;
}

export function estimateMinutes(ahead: number): number {
  return Math.max(ahead * 8, ahead > 0 ? 8 : 0);
}

export function nowServing<T extends QueueRow>(rows: T[]): T | null {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const called = rows
    .filter((r) => r.calledAt && new Date(r.calledAt).getTime() >= startOfDay.getTime())
    .sort((a, b) => new Date(b.calledAt!).getTime() - new Date(a.calledAt!).getTime());
  return called[0] ?? null;
}