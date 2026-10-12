import type { HandleClientError } from '@sveltejs/kit';
import { keepServerPageOnBootFailure } from '$lib/client/boot-guard';

export const handleError: HandleClientError = ({ error }) => {
	console.error(error);
	// A script failed to download before the app started: re-throwing stops SvelteKit from replacing
	// the server-rendered page with its error page (see boot-guard.ts).
	if (keepServerPageOnBootFailure(error)) throw error;
};
