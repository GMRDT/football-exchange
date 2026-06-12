/**
 * Group-exit evaluation (F3.6): turns get_group_exit_state() decisions into
 * finalize_group_exit() calls. Pure orchestration — the survival pricing
 * lives in market.ts (applySurvival, invariant #4) and the tournament
 * ranking lives in SQL (compute_group_standings). Imported by the ingest
 * Edge Function and by the integration tests, like tick-core's runTick.
 */
import { applySurvival } from './market.ts'

export type GroupExitDecision = {
  team_id: string
  group_name: string
  outcome: 'advanced' | 'eliminated'
  reason: string
  players: { player_id: string; fair_value: string }[]
}

export type GroupExitState = {
  groups_with_matches: number
  complete_groups: number
  all_complete: boolean
  group_round_id: string | null
  decisions: GroupExitDecision[]
}

export type GroupExitSummary = {
  applied: number
  skipped: number
  errors: string[]
}

/**
 * Structural subset of a supabase-js client — keeps this module portable
 * between the Deno Edge runtime and the node test runner.
 */
export type RpcClient = {
  rpc: (
    fn: string,
    args?: Record<string, unknown>
  ) => PromiseLike<{ data: unknown; error: { message: string } | null }>
}

/**
 * Applies every currently-decidable group exit, exactly once per team.
 * Idempotent end to end: get_group_exit_state() only returns teams without a
 * group_exits row, and finalize_group_exit() inserts that row atomically with
 * the fair-value writes. On fv_conflict (a concurrent ingest moved a fair
 * value mid-flight) the whole evaluation refetches fresh state and retries.
 */
export async function evaluateGroupExits(client: RpcClient): Promise<GroupExitSummary> {
  const summary: GroupExitSummary = { applied: 0, skipped: 0, errors: [] }

  for (let attempt = 0; attempt < 3; attempt++) {
    const { data, error } = await client.rpc('get_group_exit_state')
    if (error) {
      summary.errors.push(`get_group_exit_state: ${error.message}`)
      return summary
    }
    const state = data as GroupExitState

    if (state.decisions.length === 0) return summary
    if (!state.group_round_id) {
      summary.errors.push('group_exit: group-stage round missing')
      return summary
    }

    let conflict = false
    for (const decision of state.decisions) {
      const fairValues = decision.players.map((p) => ({
        player_id: p.player_id,
        expected_fair_value: p.fair_value,
        new_fair_value: applySurvival(p.fair_value, decision.outcome === 'advanced').toFixed(6),
      }))

      const { data: result, error: exitError } = await client.rpc('finalize_group_exit', {
        p_team_id: decision.team_id,
        p_outcome: decision.outcome,
        p_reason: decision.reason,
        p_round_id: state.group_round_id,
        p_fair_values: fairValues,
      })

      if (exitError) {
        if (exitError.message.includes('fv_conflict')) {
          conflict = true
          break
        }
        summary.errors.push(
          `finalize_group_exit ${decision.group_name}/${decision.team_id}: ${exitError.message}`
        )
        continue
      }

      if ((result as { applied: boolean }).applied) summary.applied++
      else summary.skipped++
    }

    if (!conflict) return summary
    // fv_conflict: loop back for fresh fair values; already-applied teams are
    // excluded by get_group_exit_state on the next pass.
  }

  summary.errors.push('group_exit: fv_conflict retries exhausted')
  return summary
}
