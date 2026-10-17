/** Owner policy: email actionable exceptions, not ordinary sales activity. */
export function shouldEmailAdmin(
	kind: 'routine_order' | 'routine_summary' | 'action_required'
): boolean {
	return kind === 'action_required';
}
