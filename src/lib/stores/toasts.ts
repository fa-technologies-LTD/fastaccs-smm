import { writable } from 'svelte/store';

export interface Toast {
	id: string;
	type: 'success' | 'error' | 'warning' | 'info';
	title: string;
	message?: string;
	duration?: number;
	link?: string;
	count?: number;
	createdAt?: number;
	dedupeKey?: string;
}

export const toasts = writable<Toast[]>([]);

let toastId = 0;
const MAX_VISIBLE_TOASTS = 4;
const DEFAULT_DEDUPE_WINDOW_MS = 2500;
const toastTimers = new Map<string, ReturnType<typeof setTimeout>>();

function clearToastTimer(id: string): void {
	const existing = toastTimers.get(id);
	if (existing) {
		clearTimeout(existing);
		toastTimers.delete(id);
	}
}

function scheduleToastRemoval(id: string, duration: number): void {
	clearToastTimer(id);
	if (!duration || duration <= 0) return;
	const timeout = setTimeout(() => {
		removeToast(id);
	}, duration);
	toastTimers.set(id, timeout);
}

export function addToast(
	toast: Omit<Toast, 'id'> & {
		dedupe?: boolean;
		dedupeWindowMs?: number;
	}
) {
	const id = (++toastId).toString();
	const now = Date.now();
	const dedupeWindowMs = Number(toast.dedupeWindowMs ?? DEFAULT_DEDUPE_WINDOW_MS);
	const dedupeKey =
		toast.dedupeKey ||
		`${toast.type}::${String(toast.title || '').trim()}::${String(toast.message || '').trim()}::${String(toast.link || '').trim()}`;
	const dedupeEnabled = toast.dedupe ?? true;
	const newToast: Toast = {
		...toast,
		id,
		duration: toast.duration ?? 3000,
		count: 1,
		createdAt: now,
		dedupeKey
	};

	let returnedId = id;
	toasts.update((all) => {
		if (dedupeEnabled) {
			const existingIndex = all.findIndex((item) => item.dedupeKey === dedupeKey);
			if (existingIndex >= 0) {
				const existing = all[existingIndex];
				const previousCreatedAt = Number(existing.createdAt || 0);
				if (now - previousCreatedAt <= dedupeWindowMs) {
					const mergedToast: Toast = {
						...existing,
						createdAt: now,
						duration: newToast.duration,
						count: Math.max(1, Number(existing.count || 1) + 1)
					};
					const clone = [...all];
					clone[existingIndex] = mergedToast;
					returnedId = existing.id;
					return clone;
				}
			}
		}

		const next = [...all, newToast];
		while (next.length > MAX_VISIBLE_TOASTS) {
			const removed = next.shift();
			if (removed?.id) {
				clearToastTimer(removed.id);
			}
		}
		return next;
	});

	const activeDuration =
		toast.duration ??
		(toast.duration === 0 ? 0 : 3000);
	if (activeDuration && activeDuration > 0) {
		scheduleToastRemoval(returnedId, activeDuration);
	}

	return returnedId;
}

export function removeToast(id: string) {
	clearToastTimer(id);
	toasts.update((all) => all.filter((toast) => toast.id !== id));
}

export function clearToasts() {
	for (const id of toastTimers.keys()) {
		clearToastTimer(id);
	}
	toasts.set([]);
}

// Convenience functions
export function showSuccess(title: string, message?: string, duration?: number, link?: string) {
	return addToast({ type: 'success', title, message, duration, link });
}

export function showError(title: string, message?: string, duration?: number) {
	return addToast({ type: 'error', title, message, duration });
}

export function showWarning(title: string, message?: string, duration?: number) {
	return addToast({ type: 'warning', title, message, duration });
}

export function showInfo(title: string, message?: string, duration?: number) {
	return addToast({ type: 'info', title, message, duration });
}
