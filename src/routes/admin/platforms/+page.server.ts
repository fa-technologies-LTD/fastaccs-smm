import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

// Platforms are managed inside Account Types now.
export const load: PageServerLoad = () => redirect(308, '/admin/tiers#platforms');
