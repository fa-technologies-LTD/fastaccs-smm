import { afterEach, expect, it, vi } from 'vitest';
import { adminDialog } from './admin-dialog';
const cleanup: Array<() => void> = [];
afterEach(() => {
	for (const destroy of cleanup.splice(0).reverse()) destroy();
});
function node(tag = 'div') {
	const item = document.createElement(tag);
	item.tabIndex = -1;
	document.body.append(item);
	cleanup.push(() => item.remove());
	return item;
}
it('keeps nested dialogs scroll-locked and restores the original overflow and focus only on final close', () => {
	const original = document.body.style.overflow;
	const trigger = node('button');
	trigger.focus();
	const first = node(),
		second = node();
	const outer = adminDialog(first, vi.fn());
	const inner = adminDialog(second, vi.fn());
	expect(document.body.style.overflow).toBe('hidden');
	inner.destroy();
	expect(document.body.style.overflow).toBe('hidden');
	expect(document.activeElement).toBe(first);
	outer.destroy();
	expect(document.body.style.overflow).toBe(original);
	expect(document.activeElement).toBe(trigger);
});
it('cycles keyboard focus within the dialog and handles Escape without scrolling the page', () => {
	const panel = node();
	const first = document.createElement('button'),
		last = document.createElement('button');
	panel.append(first, last);
	const close = vi.fn();
	const action = adminDialog(panel, close);
	cleanup.push(() => action.destroy());
	last.focus();
	panel.dispatchEvent(
		new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })
	);
	expect(document.activeElement).toBe(first);
	panel.dispatchEvent(
		new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true })
	);
	expect(document.activeElement).toBe(last);
	panel.dispatchEvent(
		new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
	);
	expect(close).toHaveBeenCalledOnce();
});
