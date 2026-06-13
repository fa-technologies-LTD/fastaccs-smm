export const CHART_COLORS = [
	'var(--primary)',
	'var(--status-info)',
	'var(--status-pending)',
	'var(--status-warning)',
	'var(--status-error)',
	'var(--text-dim)'
] as const;

export const STATUS_COLOR_MAP: Record<string, string> = {
	paid: 'var(--status-success)',
	completed: 'var(--status-success)',
	processing: 'var(--status-info)',
	pending: 'var(--status-pending)',
	pending_payment: 'var(--status-pending)',
	cancelled: 'var(--status-error)',
	failed: 'var(--status-error)'
};

export const DEFAULT_CHART_HEIGHT = 220;
export const DEFAULT_SPARKLINE_HEIGHT = 40;
export const CHART_FALLBACK_WIDTH = 600;

export type ChartDatum = {
	label: string;
	value: number;
	color?: string;
};
