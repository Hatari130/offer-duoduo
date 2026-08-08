import type { ApplicationEvent, JobApplication } from "./applications.ts";

export type RevisionDecision =
  | { kind: "accept"; nextRevision: number }
  | { kind: "duplicate"; revision: number }
  | { kind: "conflict"; serverRevision: number };

/**
 * Decide whether an offline change may be applied to the cloud version.
 * `baseRevision` is the revision the client last observed before editing.
 */
export function decideApplicationRevision(
  serverRevision: number | undefined,
  baseRevision: number,
  alreadyApplied = false
): RevisionDecision {
  if (alreadyApplied) {
    return { kind: "duplicate", revision: serverRevision ?? Math.max(1, baseRevision) };
  }

  if (serverRevision === undefined) {
    return baseRevision === 0
      ? { kind: "accept", nextRevision: 1 }
      : { kind: "conflict", serverRevision: 0 };
  }

  return baseRevision === serverRevision
    ? { kind: "accept", nextRevision: serverRevision + 1 }
    : { kind: "conflict", serverRevision };
}

export function mergeApplicationEvents(
  current: ApplicationEvent[],
  incoming: ApplicationEvent[]
): ApplicationEvent[] {
  const events = new Map(current.map((event) => [event.id, event]));
  for (const event of incoming) events.set(event.id, event);
  return [...events.values()].sort((left, right) =>
    left.occurredAt.localeCompare(right.occurredAt)
  );
}

export function mergeAcceptedApplication(
  current: JobApplication | undefined,
  incoming: JobApplication
): JobApplication {
  if (!current) return incoming;
  return {
    ...incoming,
    events: mergeApplicationEvents(current.events, incoming.events),
    identityAliases: [
      ...new Set([...(current.identityAliases ?? []), ...(incoming.identityAliases ?? [])])
    ].slice(-12)
  };
}
