let lockCount = 0;

export function lockScroll(): void {
	if (typeof document === 'undefined') return;
	lockCount += 1;
	if (lockCount === 1) {
		document.body.style.overflow = 'hidden';
	}
}

export function unlockScroll(): void {
	if (typeof document === 'undefined') return;
	lockCount = Math.max(0, lockCount - 1);
	if (lockCount === 0) {
		document.body.style.overflow = 'auto';
	}
}
