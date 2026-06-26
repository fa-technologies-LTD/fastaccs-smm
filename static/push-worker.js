self.addEventListener('push', (event) => {
	let payload = { title: 'FastAccs', body: 'You have a new update.' };
	try {
		if (event.data) payload = event.data.json();
	} catch {
		// keep default payload
	}

	event.waitUntil(
		self.registration.showNotification(payload.title, {
			body: payload.body,
			icon: '/favicon.png',
			data: { url: payload.url || '/' }
		})
	);
});

self.addEventListener('notificationclick', (event) => {
	event.notification.close();
	const url = event.notification.data?.url || '/';
	event.waitUntil(
		self.clients.matchAll({ type: 'window' }).then((clients) => {
			for (const client of clients) {
				if (client.url === url && 'focus' in client) return client.focus();
			}
			return self.clients.openWindow(url);
		})
	);
});
