let scrollLocks = 0;
let previousOverflow = '';

/** Keep keyboard focus inside the dialog, stop background scrolling and restore both on close. */
export function adminDialog(node: HTMLElement, close: () => void) {
	const previous = document.activeElement as HTMLElement | null;
	if (scrollLocks++ === 0) {
		previousOverflow = document.body.style.overflow;
		document.body.style.overflow = 'hidden';
	}
	node.focus();
	const keydown = (event: KeyboardEvent) => {
		if (event.key === 'Escape') {
			event.preventDefault();
			close();
			return;
		}
		if (event.key !== 'Tab') return;
		const items = [
			...node.querySelectorAll<HTMLElement>(
				'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]'
			)
		].filter((item) => item.getClientRects().length > 0);
		const first = items[0],
			last = items.at(-1);
		if (!first) {
			event.preventDefault();
			node.focus();
		} else if (
			event.shiftKey &&
			(document.activeElement === first || document.activeElement === node)
		) {
			event.preventDefault();
			last?.focus();
		} else if (
			!event.shiftKey &&
			(document.activeElement === last || document.activeElement === node)
		) {
			event.preventDefault();
			first.focus();
		}
	};
	node.addEventListener('keydown', keydown);
	return {
		destroy() {
			node.removeEventListener('keydown', keydown);
			if (--scrollLocks === 0) document.body.style.overflow = previousOverflow;
			if (previous?.isConnected) previous.focus({ preventScroll: true });
		}
	};
}
