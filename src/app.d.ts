// See https://kit.svelte.dev/docs/types#app
// for information about these interfaces
declare global {
	namespace App {
		// interface Error {}
		interface Locals {
			user: import('@prisma/client').User | null;
			session: import('@prisma/client').Session | null;
			adminContext: import('$lib/auth/admin-roles').AdminContext | null;
		}
		interface PageData {
			seo?: {
				title?: string;
				description?: string;
				type?: string;
			};
		}
		// interface PageState {}
		// interface Platform {}
	}

	interface Window {
		dataLayer?: unknown[][];
		gtag?: (...args: unknown[]) => void;
		snaptr?: ((command: 'init' | 'track', ...args: unknown[]) => void) & {
			queue: unknown[];
			handleRequest?: (...args: unknown[]) => void;
		};
		// Set by the inline Snap Pixel snippet in src/app.html when it fires
		// the initial PAGE_VIEW before hydration.
		__snapPixelBootstrapped?: boolean;
		__snapPixelInitialPageKey?: string;
		Tawk_API?: {
			maximize?: () => void;
			minimize?: () => void;
			toggle?: () => void;
			showWidget?: () => void;
			hideWidget?: () => void;
		};
		Tawk_LoadStart?: Date;
	}
}

export {};
