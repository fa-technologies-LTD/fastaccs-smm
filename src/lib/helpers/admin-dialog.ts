/** Keep keyboard focus inside the active admin dialog and restore it when closed. */
export function adminDialog(node: HTMLElement, close: () => void) {
	const previous = document.activeElement as HTMLElement | null;
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
			previous?.focus();
		}
	};
}
