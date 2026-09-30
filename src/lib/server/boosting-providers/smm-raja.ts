import { env } from '$env/dynamic/private';
import { createPanelReadClient } from './panel-client';

export const smmRajaClient = createPanelReadClient({
	id: 'smm_raja',
	label: 'SMM Raja',
	baseUrl: 'https://www.smmraja.com/api/v2',
	getApiKey: () => env.SMMRAJA_API_KEY
});
