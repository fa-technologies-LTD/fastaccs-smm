// See https://kit.svelte.dev/docs/types#app
// for information about these interfaces
declare global {
	namespace App {
		// interface Error {}
		interface Locals {
			user: import('@prisma/client').User | null;
			session: import('@prisma/client').Session | null;
		}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}

	interface Window {
		gtag: (...args: any[]) => void;
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
