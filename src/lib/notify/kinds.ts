import type { Component } from 'svelte';
import { AlertCircle, AlertTriangle, CheckCircle, Gift, Info, Zap } from '$lib/icons';

/**
 * FastAccs customer notifications: one look per kind, used everywhere.
 *
 * - Toast (ToastContainer): quick feedback right after an action. success / error / warning / info.
 * - Notice (Notice.svelte): something about this page the buyer should know now. Stays in place.
 * - Spotlight (Spotlight.svelte): a pop-up for an announcement (something new) or a promo (an offer).
 *   Browsing pages only, one per visit, never while the cart has items (see popup-rules.ts).
 * - Decision (DecisionHost): a question before something that can't be undone; the safe answer is default.
 */
export type NoticeKind = 'success' | 'error' | 'warning' | 'info' | 'announcement' | 'promo';

export interface NoticeLook {
	icon: Component;
	/** CSS colour values (tokens from app.css). */
	color: string;
	background: string;
	border: string;
	/** Short label for pop-ups ("New", "Offer"); empty where none is shown. */
	eyebrow: string;
}

export const NOTICE_LOOK: Record<NoticeKind, NoticeLook> = {
	success: {
		icon: CheckCircle as unknown as Component,
		color: 'var(--status-success)',
		background: 'var(--status-success-bg)',
		border: 'var(--status-success-border)',
		eyebrow: ''
	},
	error: {
		icon: AlertCircle as unknown as Component,
		color: 'var(--status-error)',
		background: 'var(--status-error-bg)',
		border: 'var(--status-error-border)',
		eyebrow: ''
	},
	warning: {
		icon: AlertTriangle as unknown as Component,
		color: 'var(--status-warning)',
		background: 'var(--status-warning-bg)',
		border: 'var(--status-warning-border)',
		eyebrow: ''
	},
	info: {
		icon: Info as unknown as Component,
		color: 'var(--status-info)',
		background: 'var(--status-info-bg)',
		border: 'var(--status-info-border)',
		eyebrow: ''
	},
	announcement: {
		icon: Zap as unknown as Component,
		color: 'var(--notice-announce)',
		background: 'var(--notice-announce-bg)',
		border: 'var(--notice-announce-border)',
		eyebrow: 'New'
	},
	promo: {
		icon: Gift as unknown as Component,
		color: 'var(--notice-promo)',
		background: 'var(--notice-promo-bg)',
		border: 'var(--notice-promo-border)',
		eyebrow: 'Offer'
	}
};

/** Inline style that hands a kind's colours to a component (`--tone`, `--tone-bg`, `--tone-border`). */
export function toneStyle(kind: NoticeKind, accent?: string | null): string {
	const look = NOTICE_LOOK[kind];
	return accent
		? `--tone: ${accent}; --tone-bg: color-mix(in srgb, ${accent} 14%, transparent); --tone-border: color-mix(in srgb, ${accent} 40%, transparent);`
		: `--tone: ${look.color}; --tone-bg: ${look.background}; --tone-border: ${look.border};`;
}
