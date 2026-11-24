import { isObject } from '../../../shared/is-object.ts'

/**
 * Reads whether Pi reports active work for a session, mirroring the manager's notion of a busy
 * session. Returns `undefined` when the state payload does not describe activity, so a caller can
 * keep its event-derived truth instead of trusting an incomplete snapshot.
 */
export function piSessionBusy(state: unknown): boolean | undefined {
  if (!isObject(state)) return undefined
  const { isCompacting, isStreaming, pendingMessageCount } = state
  if (typeof isStreaming !== 'boolean' || typeof isCompacting !== 'boolean') return undefined
  if (
    typeof pendingMessageCount !== 'number' || !Number.isInteger(pendingMessageCount)
    || pendingMessageCount < 0
  ) return undefined
  return isStreaming || isCompacting || pendingMessageCount > 0
}

/**
 * The agent-turn state a snapshot may adopt. A snapshot is authoritative only when it was fetched
 * after the newest agent lifecycle event already applied (`lastAgentEventAt <= fetchedAt`);
 * otherwise a live `agent_settled` that arrived while the request was in flight is newer, and
 * adopting the snapshot would resurrect a running turn the event already closed. Returns
 * `undefined` when the snapshot carries no activity truth, leaving the current state untouched.
 */
export function agentTurnFromSnapshot(
  busy: boolean | undefined,
  lastAgentEventAt: number,
  fetchedAt: number,
): boolean | undefined {
  if (busy === undefined || lastAgentEventAt > fetchedAt) return undefined
  return busy
}
