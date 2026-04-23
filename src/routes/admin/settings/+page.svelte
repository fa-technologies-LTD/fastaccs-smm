<script lang="ts">
	import type { ActionData, PageData } from './$types';
	import { addToast } from '$lib/stores/toasts';

	let { data, form }: { data: PageData; form: ActionData | null } = $props();

	const settings = data.settings;
	const announcementBanner = data.announcementBanner;
	const envConfig = data.envConfig;
	const featureFlags = data.featureFlags;
	const smtpHealth = data.smtpHealth;
	const sessions = data.sessions || [];
	let admins = $state(data.admins || []);
	const canManageSettings = data.canManageSettings;
	const canManageRoles = data.canManageRoles;
	const roleManagementEnabled = Boolean(featureFlags.adminRoleManagement);
	const storeControlsEnabled = Boolean(featureFlags.adminStoreControls);
	const announcementBannerEnabled = Boolean(featureFlags.adminAnnouncementBanner);
	const testEmailDefault = ((data as any).user?.email || '') as string;

	const recipientsInput = settings.notifications.adminRecipients.join('\n');

	async function updateAdminRole(userId: string, role: string) {
		if (!canManageRoles) return;

		const response = await fetch(`/api/admin/roles/${userId}`, {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ role })
		});
		const result = await response.json();

		if (!response.ok || !result.success) {
			addToast({
				type: 'error',
				title: result.error || 'Failed to update role',
				duration: 3200
			});
			return;
		}

		admins = admins.map((admin: any) =>
			admin.id === userId ? { ...admin, role: result.data.role } : admin
		);
		addToast({
			type: 'success',
			title: 'Admin role updated',
			duration: 2200
		});
	}
</script>

<div class="space-y-6">
	<div>
		<h1 class="text-2xl font-bold" style="color: var(--text)">Settings</h1>
		<p class="mt-1" style="color: var(--text-muted)">
			Configuration-only controls for business profile, payments, store operations, security, and
			notifications.
		</p>
	</div>

	{#if form?.error}
		<div
			class="rounded-lg p-4"
			style="border: 1px solid var(--status-error-border); background: var(--status-error-bg); color: var(--status-error);"
		>
			{form.error}
		</div>
	{/if}

	{#if form?.success && form?.message}
		<div
			class="rounded-lg p-4"
			style="border: 1px solid var(--status-success-border); background: var(--status-success-bg); color: var(--status-success);"
		>
			{form.message}
		</div>
	{/if}

	<div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
		<section
			class="rounded-lg p-6"
			style="background: var(--bg-elev-1); border: 1px solid var(--border);"
		>
			<h2 class="text-lg font-semibold" style="color: var(--text)">Business Profile</h2>
			<form method="POST" action="?/saveBusiness" class="mt-4 space-y-4">
				<label class="block text-sm" style="color: var(--text-muted);">
					Business name
					<input
						type="text"
						name="businessName"
						value={settings.business.businessName}
						class="mt-1 w-full rounded-lg px-3 py-2"
						style="background: var(--bg); border: 1px solid var(--border); color: var(--text);"
						required
						disabled={!canManageSettings}
					/>
				</label>

				<label class="block text-sm" style="color: var(--text-muted);">
					Business email
					<input
						type="email"
						name="businessEmail"
						value={settings.business.businessEmail}
						class="mt-1 w-full rounded-lg px-3 py-2"
						style="background: var(--bg); border: 1px solid var(--border); color: var(--text);"
						required
						disabled={!canManageSettings}
					/>
				</label>

				<label class="block text-sm" style="color: var(--text-muted);">
					WhatsApp support number
					<input
						type="text"
						name="whatsappNumber"
						value={settings.business.whatsappNumber}
						class="mt-1 w-full rounded-lg px-3 py-2"
						style="background: var(--bg); border: 1px solid var(--border); color: var(--text);"
						disabled={!canManageSettings}
					/>
				</label>

				<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
					<label class="block text-sm" style="color: var(--text-muted);">
						Currency code
						<input
							type="text"
							name="currencyCode"
							value={settings.business.currencyCode}
							maxlength="3"
							class="mt-1 w-full rounded-lg px-3 py-2"
							style="background: var(--bg); border: 1px solid var(--border); color: var(--text);"
							disabled={!canManageSettings}
						/>
					</label>
					<label class="block text-sm" style="color: var(--text-muted);">
						Business timezone
						<input
							type="text"
							name="businessTimezone"
							value={settings.business.businessTimezone}
							class="mt-1 w-full rounded-lg px-3 py-2"
							style="background: var(--bg); border: 1px solid var(--border); color: var(--text);"
							disabled={!canManageSettings}
						/>
					</label>
				</div>

				<button
					type="submit"
					class="rounded-full px-4 py-2 text-sm font-semibold text-white transition-opacity disabled:opacity-50"
					style="background: var(--btn-primary-gradient)"
					disabled={!canManageSettings}
				>
					Save business settings
				</button>
			</form>
		</section>

		<section
			class="rounded-lg p-6"
			style="background: var(--bg-elev-1); border: 1px solid var(--border);"
		>
			<h2 class="text-lg font-semibold" style="color: var(--text)">Announcement Banner</h2>
			<p class="mt-1 text-sm" style="color: var(--text-muted);">
				Global storefront banner with optional schedule and dismiss behavior.
			</p>
			{#if !announcementBannerEnabled}
				<p class="mt-2 text-sm" style="color: var(--text-muted);">
					Announcement banner runtime is currently disabled by feature flag.
				</p>
			{/if}

			<form method="POST" action="?/saveAnnouncementBanner" class="mt-4 space-y-4">
				<label
					class="flex items-center justify-between rounded-lg p-3 text-sm"
					style="border: 1px solid var(--border); background: var(--bg); color: var(--text);"
				>
					<span>Enable banner</span>
					<input
						type="checkbox"
						name="enabled"
						checked={announcementBanner.enabled}
						disabled={!canManageSettings || !announcementBannerEnabled}
					/>
				</label>

				<label class="block text-sm" style="color: var(--text-muted);">
					Banner text
					<textarea
						name="text"
						rows="3"
						maxlength="220"
						class="mt-1 w-full rounded-lg px-3 py-2"
						style="background: var(--bg); border: 1px solid var(--border); color: var(--text);"
						placeholder="Planned maintenance on Friday 8PM WAT. Checkout remains open."
						disabled={!canManageSettings || !announcementBannerEnabled}>{announcementBanner.text}</textarea
					>
				</label>

				<label class="block text-sm" style="color: var(--text-muted);">
					Optional link
					<input
						type="text"
						name="link"
						value={announcementBanner.link || ''}
						class="mt-1 w-full rounded-lg px-3 py-2"
						style="background: var(--bg); border: 1px solid var(--border); color: var(--text);"
						placeholder="/promotions or https://..."
						disabled={!canManageSettings || !announcementBannerEnabled}
					/>
				</label>

				<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
					<label class="block text-sm" style="color: var(--text-muted);">
						Starts at ({announcementBanner.timezone})
						<input
							type="datetime-local"
							name="startsAt"
							value={announcementBanner.startsAtInput}
							class="mt-1 w-full rounded-lg px-3 py-2"
							style="background: var(--bg); border: 1px solid var(--border); color: var(--text);"
							disabled={!canManageSettings || !announcementBannerEnabled}
						/>
					</label>
					<label class="block text-sm" style="color: var(--text-muted);">
						Ends at ({announcementBanner.timezone})
						<input
							type="datetime-local"
							name="endsAt"
							value={announcementBanner.endsAtInput}
							class="mt-1 w-full rounded-lg px-3 py-2"
							style="background: var(--bg); border: 1px solid var(--border); color: var(--text);"
							disabled={!canManageSettings || !announcementBannerEnabled}
						/>
					</label>
				</div>

				<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
					<label
						class="flex items-center justify-between rounded-lg p-3 text-sm"
						style="border: 1px solid var(--border); background: var(--bg); color: var(--text);"
					>
						<span>Dismissible</span>
						<input
							type="checkbox"
							name="dismissible"
							checked={announcementBanner.dismissible}
							disabled={!canManageSettings || !announcementBannerEnabled}
						/>
					</label>
					<label class="block text-sm" style="color: var(--text-muted);">
						Version
						<input
							type="number"
							name="version"
							value={announcementBanner.version}
							min="1"
							max="9999"
							class="mt-1 w-full rounded-lg px-3 py-2"
							style="background: var(--bg); border: 1px solid var(--border); color: var(--text);"
							disabled={!canManageSettings || !announcementBannerEnabled}
						/>
					</label>
				</div>

				<div class="rounded-lg p-3 text-sm" style="border: 1px dashed var(--border); background: var(--bg);">
					<p class="font-semibold" style="color: var(--text);">Preview</p>
					<p class="mt-1" style="color: var(--text-muted);">
						{announcementBanner.text || 'No banner text set yet.'}
					</p>
					{#if announcementBanner.link}
						<p class="mt-1 break-all text-xs" style="color: var(--text-dim);">
							Link: {announcementBanner.link}
						</p>
					{/if}
				</div>

				<button
					type="submit"
					class="rounded-full px-4 py-2 text-sm font-semibold text-white transition-opacity disabled:opacity-50"
					style="background: var(--btn-primary-gradient)"
					disabled={!canManageSettings || !announcementBannerEnabled}
				>
					Save announcement banner
				</button>
			</form>
		</section>

		<section
			class="rounded-lg p-6"
			style="background: var(--bg-elev-1); border: 1px solid var(--border);"
		>
			<h2 class="text-lg font-semibold" style="color: var(--text)">Payment Configuration</h2>
			<p class="mt-1 text-sm" style="color: var(--text-muted);">
				Monnify mode remains env-controlled. Runtime payment controls below are configuration-only.
			</p>

			<form method="POST" action="?/savePayment" class="mt-4 space-y-4">
				<label class="block text-sm" style="color: var(--text-muted);">
					Minimum order value
					<input
						type="number"
						min="0"
						step="1"
						name="minOrderValue"
						value={settings.payment.minOrderValue}
						class="mt-1 w-full rounded-lg px-3 py-2"
						style="background: var(--bg); border: 1px solid var(--border); color: var(--text);"
						disabled={!canManageSettings}
					/>
				</label>
				<label class="inline-flex items-center gap-2 text-sm" style="color: var(--text);">
					<input
						type="checkbox"
						name="processingFeeEnabled"
						checked={settings.payment.processingFeeEnabled}
						disabled={!canManageSettings}
					/>
					Enable processing fee rules
				</label>
				<button
					type="submit"
					class="rounded-full px-4 py-2 text-sm font-semibold text-white transition-opacity disabled:opacity-50"
					style="background: var(--btn-primary-gradient)"
					disabled={!canManageSettings}
				>
					Save payment config
				</button>
			</form>

			<div class="mt-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
				<div class="rounded-lg p-3" style="background: var(--bg); border: 1px solid var(--border);">
					<div style="color: var(--text-muted)">Payment mode</div>
					<div class="mt-1 font-semibold" style="color: var(--text)">{envConfig.paymentMode}</div>
				</div>
				<div class="rounded-lg p-3" style="background: var(--bg); border: 1px solid var(--border);">
					<div style="color: var(--text-muted)">Monnify base URL</div>
					<div class="mt-1 font-semibold break-all" style="color: var(--text)">
						{envConfig.monnifyBaseUrl}
					</div>
				</div>
				<div class="rounded-lg p-3" style="background: var(--bg); border: 1px solid var(--border);">
					<div style="color: var(--text-muted)">Runtime environment</div>
					<div class="mt-1 font-semibold" style="color: var(--text)">{envConfig.nodeEnv}</div>
				</div>
				<div class="rounded-lg p-3" style="background: var(--bg); border: 1px solid var(--border);">
					<div style="color: var(--text-muted)">Monnify API key</div>
					<div class="mt-1 font-mono text-xs font-semibold" style="color: var(--text)">
						{envConfig.monnifyApiKeyMasked}
					</div>
				</div>
				<div class="rounded-lg p-3" style="background: var(--bg); border: 1px solid var(--border);">
					<div style="color: var(--text-muted)">Monnify secret</div>
					<div class="mt-1 font-mono text-xs font-semibold" style="color: var(--text)">
						{envConfig.monnifySecretMasked}
					</div>
				</div>
				<div class="rounded-lg p-3" style="background: var(--bg); border: 1px solid var(--border);">
					<div style="color: var(--text-muted)">Contract code</div>
					<div class="mt-1 font-mono text-xs font-semibold" style="color: var(--text)">
						{envConfig.monnifyContractCodeMasked}
					</div>
				</div>
			</div>
		</section>
	</div>

	<div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
		<section
			class="rounded-lg p-6"
			style="background: var(--bg-elev-1); border: 1px solid var(--border);"
		>
			<h2 class="text-lg font-semibold" style="color: var(--text)">Email / SMTP</h2>
			<div class="mt-3 flex items-center gap-2 text-sm">
				<span
					class="rounded-full px-2 py-0.5 font-semibold"
					style={smtpHealth.configured
						? 'background: var(--status-success-bg); color: var(--status-success); border: 1px solid var(--status-success-border);'
						: 'background: var(--status-warning-bg); color: var(--status-warning); border: 1px solid var(--status-warning-border);'}
				>
					{smtpHealth.configured ? 'Healthy' : 'Incomplete'}
				</span>
				{#if !smtpHealth.configured}
					<span style="color: var(--text-muted);">Missing: {smtpHealth.missing.join(', ')}</span>
				{/if}
			</div>

			<div class="mt-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
				<div class="rounded-lg p-3" style="background: var(--bg); border: 1px solid var(--border);">
					<div style="color: var(--text-muted)">SMTP host</div>
					<div class="mt-1 font-semibold" style="color: var(--text)">{smtpHealth.host}</div>
				</div>
				<div class="rounded-lg p-3" style="background: var(--bg); border: 1px solid var(--border);">
					<div style="color: var(--text-muted)">SMTP user</div>
					<div class="mt-1 font-semibold" style="color: var(--text)">{smtpHealth.userPreview}</div>
				</div>
				<div class="rounded-lg p-3" style="background: var(--bg); border: 1px solid var(--border);">
					<div style="color: var(--text-muted)">Port / Secure</div>
					<div class="mt-1 font-semibold" style="color: var(--text)">
						{smtpHealth.port || 'Not set'} / {smtpHealth.secure ? 'TLS' : 'STARTTLS/Plain'}
					</div>
				</div>
				<div class="rounded-lg p-3" style="background: var(--bg); border: 1px solid var(--border);">
					<div style="color: var(--text-muted)">Sender</div>
					<div class="mt-1 font-semibold" style="color: var(--text)">
						{smtpHealth.fromName} ({smtpHealth.fromEmail})
					</div>
				</div>
			</div>

			<form method="POST" action="?/sendTestEmail" class="mt-4 flex flex-col gap-3 sm:flex-row">
				<input
					type="email"
					name="testEmail"
					value={testEmailDefault}
					placeholder="test@company.com"
					class="w-full rounded-lg px-3 py-2 text-sm"
					style="background: var(--bg); border: 1px solid var(--border); color: var(--text);"
					disabled={!canManageSettings}
				/>
				<button
					type="submit"
					class="rounded-full px-4 py-2 text-sm font-semibold text-white transition-opacity disabled:opacity-50"
					style="background: var(--btn-primary-gradient)"
					disabled={!canManageSettings}
				>
					Send test email
				</button>
			</form>
		</section>

		<section
			class="rounded-lg p-6"
			style="background: var(--bg-elev-1); border: 1px solid var(--border);"
		>
			<h2 class="text-lg font-semibold" style="color: var(--text)">Security / Sessions</h2>
			<p class="mt-1 text-sm" style="color: var(--text-muted);">
				Active session management. Revoke any session immediately.
			</p>

			{#if sessions.length === 0}
				<p class="mt-3 text-sm" style="color: var(--text-muted);">No sessions found.</p>
			{:else}
				<div class="mt-3 max-h-64 space-y-2 overflow-auto pr-1">
					{#each sessions as session}
						<div
							class="rounded-lg p-3"
							style="background: var(--bg); border: 1px solid var(--border);"
						>
							<div class="flex flex-wrap items-center justify-between gap-2">
								<div>
									<p class="text-sm font-semibold" style="color: var(--text);">
										{session.user.fullName || session.user.email || session.userId}
									</p>
									<p class="text-xs" style="color: var(--text-muted);">
										{session.user.email || session.userId} • {session.user.userType}
									</p>
									<p class="text-xs" style="color: var(--text-dim);">
										Created: {new Date(session.createdAt).toLocaleString()} • Expires: {new Date(
											session.expiresAt
										).toLocaleString()}
									</p>
								</div>
								<form method="POST" action="?/revokeSession">
									<input type="hidden" name="sessionId" value={session.id} />
									<button
										type="submit"
										class="rounded-full px-3 py-1 text-xs font-semibold"
										style="background: var(--status-error-bg); color: var(--status-error); border: 1px solid var(--status-error-border);"
										disabled={!canManageSettings}
									>
										Revoke
									</button>
								</form>
							</div>
						</div>
					{/each}
				</div>
			{/if}
		</section>
	</div>

	<div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
		<section
			class="rounded-lg p-6"
			style="background: var(--bg-elev-1); border: 1px solid var(--border);"
		>
			<h2 class="text-lg font-semibold" style="color: var(--text)">Store Controls</h2>
			{#if !storeControlsEnabled}
				<p class="mt-1 text-sm" style="color: var(--text-muted);">
					Store controls are currently disabled by feature flag.
				</p>
			{/if}
			<form method="POST" action="?/saveStoreControls" class="mt-4 space-y-3">
				<label
					class="flex items-center justify-between rounded-lg p-3 text-sm"
					style="border: 1px solid var(--border); background: var(--bg); color: var(--text);"
				>
					<span>Maintenance mode</span>
					<input
						type="checkbox"
						name="maintenanceMode"
						checked={settings.storeControls.maintenanceMode}
						disabled={!canManageSettings || !storeControlsEnabled}
					/>
				</label>
				<label
					class="flex items-center justify-between rounded-lg p-3 text-sm"
					style="border: 1px solid var(--border); background: var(--bg); color: var(--text);"
				>
					<span>Checkout enabled</span>
					<input
						type="checkbox"
						name="checkoutEnabled"
						checked={settings.storeControls.checkoutEnabled}
						disabled={!canManageSettings || !storeControlsEnabled}
					/>
				</label>
				<label
					class="flex items-center justify-between rounded-lg p-3 text-sm"
					style="border: 1px solid var(--border); background: var(--bg); color: var(--text);"
				>
					<span>Auto-delivery paused</span>
					<input
						type="checkbox"
						name="autoDeliveryPaused"
						checked={settings.storeControls.autoDeliveryPaused}
						disabled={!canManageSettings || !storeControlsEnabled}
					/>
				</label>
				<button
					type="submit"
					class="rounded-full px-4 py-2 text-sm font-semibold text-white transition-opacity disabled:opacity-50"
					style="background: var(--btn-primary-gradient)"
					disabled={!canManageSettings || !storeControlsEnabled}
				>
					Save store controls
				</button>
			</form>
		</section>

		<section
			class="rounded-lg p-6"
			style="background: var(--bg-elev-1); border: 1px solid var(--border);"
		>
			<h2 class="text-lg font-semibold" style="color: var(--text)">Notification Thresholds</h2>
			<form method="POST" action="?/saveNotifications" class="mt-4 space-y-4">
				<label class="block text-sm" style="color: var(--text-muted);">
					Admin recipients
					<textarea
						name="adminRecipients"
						rows="4"
						class="mt-1 w-full rounded-lg px-3 py-2"
						style="background: var(--bg); border: 1px solid var(--border); color: var(--text);"
						placeholder="one email per line"
						disabled={!canManageSettings}>{recipientsInput}</textarea
					>
				</label>

				<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
					<label class="block text-sm" style="color: var(--text-muted);">
						Low-stock threshold
						<input
							type="number"
							name="lowStockThreshold"
							value={settings.notifications.lowStockThreshold}
							min="1"
							max="999"
							class="mt-1 w-full rounded-lg px-3 py-2"
							style="background: var(--bg); border: 1px solid var(--border); color: var(--text);"
							disabled={!canManageSettings}
						/>
					</label>
					<label class="block text-sm" style="color: var(--text-muted);">
						Win-back days threshold
						<input
							type="number"
							name="winbackDaysThreshold"
							value={settings.notifications.winbackDaysThreshold}
							min="1"
							max="365"
							class="mt-1 w-full rounded-lg px-3 py-2"
							style="background: var(--bg); border: 1px solid var(--border); color: var(--text);"
							disabled={!canManageSettings}
						/>
					</label>
				</div>

				<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
					<label class="block text-sm" style="color: var(--text-muted);">
						Broadcast batch size
						<input
							type="number"
							name="broadcastBatchSize"
							value={settings.notifications.broadcastBatchSize}
							min="1"
							max="1000"
							class="mt-1 w-full rounded-lg px-3 py-2"
							style="background: var(--bg); border: 1px solid var(--border); color: var(--text);"
							disabled={!canManageSettings}
						/>
					</label>
					<label class="block text-sm" style="color: var(--text-muted);">
						Broadcast delay (ms)
						<input
							type="number"
							name="broadcastBatchDelayMs"
							value={settings.notifications.broadcastBatchDelayMs}
							min="100"
							max="60000"
							class="mt-1 w-full rounded-lg px-3 py-2"
							style="background: var(--bg); border: 1px solid var(--border); color: var(--text);"
							disabled={!canManageSettings}
						/>
					</label>
				</div>

				<button
					type="submit"
					class="rounded-full px-4 py-2 text-sm font-semibold text-white transition-opacity disabled:opacity-50"
					style="background: var(--btn-primary-gradient)"
					disabled={!canManageSettings}
				>
					Save notification settings
				</button>
			</form>
		</section>
	</div>

	<div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
		<section
			class="rounded-lg p-6"
			style="background: var(--bg-elev-1); border: 1px solid var(--border);"
		>
			<h2 class="text-lg font-semibold" style="color: var(--text)">Admin Roles</h2>
			<p class="mt-1 text-sm" style="color: var(--text-muted);">
				Role split is enforced server-side: FULL_ADMIN, ORDER_MANAGER, READ_ONLY.
			</p>
			{#if !roleManagementEnabled}
				<p class="mt-3 text-sm" style="color: var(--text-muted);">
					Role management is currently disabled by feature flag.
				</p>
			{:else}
				<div class="mt-4 space-y-2">
					{#each admins as admin}
						<div
							class="flex flex-wrap items-center justify-between gap-2 rounded-lg p-3"
							style="border: 1px solid var(--border); background: var(--bg);"
						>
							<div>
								<p class="text-sm font-semibold" style="color: var(--text);">
									{admin.fullName || admin.email || admin.id}
								</p>
								<p class="text-xs" style="color: var(--text-muted);">{admin.email || admin.id}</p>
							</div>
							<select
								class="rounded-lg px-2 py-1 text-sm"
								style="background: var(--bg-elev-1); border: 1px solid var(--border); color: var(--text);"
								value={admin.role}
								onchange={(event) =>
									updateAdminRole(admin.id, (event.currentTarget as HTMLSelectElement).value)}
								disabled={!canManageRoles}
							>
								<option value="FULL_ADMIN">FULL_ADMIN</option>
								<option value="ORDER_MANAGER">ORDER_MANAGER</option>
								<option value="READ_ONLY">READ_ONLY</option>
							</select>
						</div>
					{/each}
				</div>

				<div
					class="mt-4 rounded-lg p-3"
					style="border: 1px dashed var(--border); background: var(--bg);"
				>
					<p class="text-sm font-semibold" style="color: var(--text)">Admin Invite (Placeholder)</p>
					<p class="mt-1 text-xs" style="color: var(--text-muted);">
						Invite workflow is staged for a later phase. Role defaults will apply after invite
						acceptance.
					</p>
					<div class="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
						<input
							type="email"
							placeholder="new-admin@company.com"
							class="rounded-lg px-3 py-2 text-sm"
							style="background: var(--bg-elev-1); border: 1px solid var(--border); color: var(--text-dim);"
							disabled
						/>
						<select
							class="rounded-lg px-3 py-2 text-sm"
							style="background: var(--bg-elev-1); border: 1px solid var(--border); color: var(--text-dim);"
							disabled
						>
							<option>FULL_ADMIN</option>
							<option>ORDER_MANAGER</option>
							<option>READ_ONLY</option>
						</select>
					</div>
				</div>
			{/if}
		</section>

		<section
			class="rounded-lg p-6"
			style="background: var(--bg-elev-1); border: 1px solid var(--border);"
		>
			<h2 class="text-lg font-semibold" style="color: var(--text)">Feature Flags</h2>
			<form method="POST" action="?/saveFeatureFlags" class="mt-4 space-y-3">
				<label
					class="flex items-center justify-between rounded-lg p-3 text-sm"
					style="border: 1px solid var(--border); background: var(--bg); color: var(--text);"
				>
					<span>Admin promotions module</span>
					<input
						type="checkbox"
						name="adminPromotions"
						checked={featureFlags.adminPromotions}
						disabled={!canManageSettings}
					/>
				</label>
				<label
					class="flex items-center justify-between rounded-lg p-3 text-sm"
					style="border: 1px solid var(--border); background: var(--bg); color: var(--text);"
				>
					<span>Announcement banner module</span>
					<input
						type="checkbox"
						name="adminAnnouncementBanner"
						checked={featureFlags.adminAnnouncementBanner}
						disabled={!canManageSettings}
					/>
				</label>
				<label
					class="flex items-center justify-between rounded-lg p-3 text-sm"
					style="border: 1px solid var(--border); background: var(--bg); color: var(--text);"
				>
					<span>Advanced analytics widgets</span>
					<input
						type="checkbox"
						name="adminAdvancedAnalytics"
						checked={featureFlags.adminAdvancedAnalytics}
						disabled={!canManageSettings}
					/>
				</label>
				<label
					class="flex items-center justify-between rounded-lg p-3 text-sm"
					style="border: 1px solid var(--border); background: var(--bg); color: var(--text);"
				>
					<span>Admin role management</span>
					<input
						type="checkbox"
						name="adminRoleManagement"
						checked={featureFlags.adminRoleManagement}
						disabled={!canManageSettings}
					/>
				</label>
				<label
					class="flex items-center justify-between rounded-lg p-3 text-sm"
					style="border: 1px solid var(--border); background: var(--bg); color: var(--text);"
				>
					<span>Store controls module</span>
					<input
						type="checkbox"
						name="adminStoreControls"
						checked={featureFlags.adminStoreControls}
						disabled={!canManageSettings}
					/>
				</label>
				<button
					type="submit"
					class="rounded-full px-4 py-2 text-sm font-semibold text-white transition-opacity disabled:opacity-50"
					style="background: var(--btn-primary-gradient)"
					disabled={!canManageSettings}
				>
					Save feature flags
				</button>
			</form>
		</section>
	</div>
</div>
