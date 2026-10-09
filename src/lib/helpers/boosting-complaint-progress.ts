/** Only public, persisted facts; supplier identifiers and internal actions stay private. */
export function getBoostComplaintStatusLabel(report: {
	status: string;
	refillState?: string | null;
	refillCheckedAt?: unknown;
}): string {
	const checked =
		(typeof report.refillCheckedAt === 'string' || report.refillCheckedAt instanceof Date) &&
		Number.isFinite(new Date(report.refillCheckedAt).getTime());
	if (report.status === 'resolved')
		return checked && report.refillState === 'completed' ? 'Refill complete' : 'Resolved';
	if (report.status === 'rejected') return 'Reviewed — contact support';
	if (report.status === 'escalated') {
		if (checked && report.refillState === 'in_progress') return 'Refill in progress';
		if (report.refillState === 'pending') return 'Refill requested';
		if (['rejected', 'unknown'].includes(report.refillState || '')) return 'Under review';
		return 'Follow-up requested';
	}
	return 'Under review';
}
