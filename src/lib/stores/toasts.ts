import { writable } from 'svelte/store';

export interface Toast {
	id: string;
	type: 'success' | 'error' | 'warning' | 'info';
	title: string;
	message?: string;
	duration?: number;
	link?: string;
}

export const toasts = writable<Toast[]>([]);

let toastId = 0;

export function addToast(toast: Omit<Toast, 'id'>) {
	const id = (++toastId).toString();
	const newToast: Toast = {
		...toast,
		id,
		duration: toast.duration ?? 3000
	};

	toasts.update((all) => [...all, newToast]);

	if (newToast.duration && newToast.duration > 0) {
		setTimeout(() => {
			removeToast(id);
		}, newToast.duration);
	}

	return id;
}

export function removeToast(id: string) {
	toasts.update((all) => all.filter((toast) => toast.id !== id));
}

export function clearToasts() {
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
