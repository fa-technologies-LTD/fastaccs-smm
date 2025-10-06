import { json } from '@sveltejs/kit';

export async function GET() {
	try {
		// Test email sending
		const response = await fetch('/api/send-email', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				to: 'test@example.com',
				subject: 'FastAccs Test Email',
				content:
					'This is a test email from FastAccs.\n\n**Bold text**\n- List item 1\n- List item 2'
			})
		});

		const result = await response.json();

		return json({
			status: response.ok ? 'success' : 'error',
			result
		});
	} catch (error) {
		return json({
			status: 'error',
			error: error instanceof Error ? error.message : 'Unknown error'
		});
	}
}
