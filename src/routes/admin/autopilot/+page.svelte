<script lang="ts">
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData | null } = $props();

	const s = $derived(data.settings);
	const ownerOnly = $derived(!data.isOwner);

	const when = (iso: string | null) =>
		iso
			? new Date(iso).toLocaleString('en-GB', {
					day: 'numeric',
					month: 'short',
					hour: '2-digit',
					minute: '2-digit',
					timeZone: 'Africa/Lagos'
				}) + ' WAT'
			: '—';

	const card = 'background: var(--bg-elev-1); border: 1px solid var(--border);';
	const inner = 'border: 1px solid var(--border); background: var(--bg);';
	const input =
		'background: var(--bg-elev-2); border: 1px solid var(--border); color: var(--text);';
	const secondary = 'border: 1px solid var(--border-2); color: var(--text);';
	const primary = (disabled: boolean) =>
		`background: var(--btn-primary-gradient); color: #04140C; opacity: ${disabled ? 0.5 : 1};`;

	const bindLink = $derived((form && 'bindLink' in form && form.bindLink) || data.bindLink);
	const bindCode = $derived(bindLink ? (bindLink.split('start=')[1] ?? '') : '');

	const readiness = $derived([
		{ ok: data.ready.telegramAccount, label: 'Telegram account connected' }
	]);
</script>

<svelte:head><title>Telegram autopilot · Admin</title></svelte:head>

<div class="space-y-6">
	<header>
		<h1 class="text-2xl font-bold" style="color: var(--text); font-family: var(--font-head);">
			Telegram autopilot
		</h1>
		<p class="mt-1 text-sm" style="color: var(--text-muted);">
			Answers people who ask where to buy in joined groups, and posts occasional promotions only
			where group rules allow them.
			{#if ownerOnly}<strong>Only the owner can change these settings.</strong>{/if}
		</p>
	</header>

	{#if form?.error}
		<p
			class="rounded-lg p-3 text-sm"
			style="border: 1px solid var(--danger, #e5484d); color: var(--text);"
		>
			{form.error}
		</p>
	{:else if form?.message}
		<div
			class="rounded-lg p-3 text-sm"
			style="border: 1px solid var(--primary); color: var(--text);"
		>
			<p>{form.message}</p>
		</div>
	{/if}

	{#if bindLink}
		<div
			class="rounded-lg p-4 text-sm"
			style="border: 1px solid var(--primary); color: var(--text);"
		>
			<p class="font-semibold">Connect your chat to the bot</p>
			<ol class="mt-2 list-decimal space-y-1 pl-5">
				<li>
					On your phone, open
					<a href={bindLink} target="_blank" rel="noreferrer" class="font-semibold underline"
						>{bindLink}</a
					>
					and press <strong>Start</strong>.
				</li>
				<li>The bot replies “✅ Connected”. Then refresh this page.</li>
				<li>
					No reply? In the bot chat, send exactly:
					<code class="rounded px-1" style="background: var(--bg-elev-2);">/start {bindCode}</code>
				</li>
			</ol>
			<p class="mt-2 text-xs" style="color: var(--text-muted);">
				This link stays the same until it's used, so pressing Connect bot again is safe.
			</p>
		</div>
	{/if}

	<!-- ============================== Status ============================== -->
	<section class="rounded-lg p-6" style={card}>
		<div class="flex flex-wrap items-center justify-between gap-3">
			<div>
				<h2 class="text-lg font-semibold" style="color: var(--text);">Status</h2>
				<p class="text-xs" style="color: var(--text-muted);">
					Last group check: {when(data.groups.lastRunAt)}
				</p>
				{#if data.state.pausedUntil && new Date(data.state.pausedUntil) > new Date()}
					<p class="mt-1 text-xs" style="color: var(--text-muted);">
						Telegram asked us to slow down until {when(data.state.pausedUntil)}.
					</p>
				{/if}
				{#if data.state.lastError}
					<p class="mt-1 text-xs" style="color: var(--danger, #e5484d);">
						Last problem: {data.state.lastError}
					</p>
				{/if}
			</div>
			<span
				class="rounded-full px-3 py-1 text-xs font-semibold"
				style="background: var(--bg-elev-2); color: {s.enabled
					? 'var(--primary)'
					: 'var(--text-muted)'};"
			>
				{s.enabled && s.groupsEnabled ? 'ON' : 'OFF'}
			</span>
		</div>

		<div class="mt-4 rounded-lg p-4 text-sm" style={inner}>
			<p class="font-semibold" style="color: var(--text);">Set-up checklist</p>
			<ul class="mt-2 space-y-1 text-xs" style="color: var(--text);">
				{#each readiness as item (item.label)}
					<li>{item.ok ? '✅' : '⬜'} {item.label}</li>
				{/each}
				{#if data.webhook}
					{#if !data.webhook.pointsHere}
						<li>⬜ Telegram is not sending the bot's messages here yet: press Connect bot</li>
					{:else if data.webhook.recentError}
						<li style="color: var(--danger, #e5484d);">
							⚠ Telegram can't reach the site: {data.webhook.lastError} ({when(
								data.webhook.lastErrorAt
							)})
						</li>
					{:else}
						<li>✅ Telegram can reach the site</li>
					{/if}
				{/if}
			</ul>
			<p class="mt-2 text-xs" style="color: var(--text-muted);">
				Secrets go in Vercel → Project → Settings → Environment Variables. They are never shown
				here.
			</p>
		</div>

		<div class="mt-4 flex flex-wrap gap-3">
			<form method="POST" action="?/connectBot">
				<button
					type="submit"
					disabled={ownerOnly || !data.ready.bot}
					class="rounded-lg px-4 py-2 text-sm font-semibold"
					style={secondary}
				>
					{data.ready.ownerConnected ? 'Reconnect bot' : 'Connect bot'}
				</button>
			</form>
			<form method="POST" action="?/toggle">
				<input type="hidden" name="field" value="enabled" />
				<button
					type="submit"
					disabled={ownerOnly}
					class="rounded-lg px-4 py-2 text-sm font-semibold"
					style={s.enabled ? secondary : primary(ownerOnly)}
				>
					{s.enabled ? 'Switch off' : 'Switch on'}
				</button>
			</form>
		</div>
	</section>

	<!-- ============================== Rules ============================== -->
	<section class="rounded-lg p-6" style={card}>
		<h2 class="text-lg font-semibold" style="color: var(--text);">Group limits</h2>
		<form method="POST" action="?/saveRules" class="mt-4 grid gap-3 sm:grid-cols-2">
			<div class="rounded-lg p-3 text-sm sm:col-span-2" style={inner}>
				<label class="flex items-center gap-2" style="color: var(--text);">
					<input
						type="checkbox"
						name="groupsEnabled"
						checked={s.groupsEnabled}
						disabled={ownerOnly}
					/>
					Group chats: answer people asking to buy, post promos where allowed
				</label>
				<p class="mt-1 text-xs" style="color: var(--text-muted);">
					Answers are public replies with a tracked link. It never messages members privately, never
					posts where the rules say no links or ads, and stops posting promos in a group after 3
					posts with no visits.
				</p>
				<div class="mt-2 grid gap-3 sm:grid-cols-3">
					<label style="color: var(--text-muted);">
						Answers a day (all groups)
						<input
							name="groupRepliesPerDay"
							type="number"
							min="0"
							max="30"
							value={s.groupRepliesPerDay}
							disabled={ownerOnly}
							class="mt-1 w-full rounded-lg px-3 py-2"
							style={input}
						/>
					</label>
					<label style="color: var(--text-muted);">
						New groups joined a day
						<input
							name="groupJoinsPerDay"
							type="number"
							min="0"
							max="8"
							value={s.groupJoinsPerDay}
							disabled={ownerOnly}
							class="mt-1 w-full rounded-lg px-3 py-2"
							style={input}
						/>
					</label>
					<label style="color: var(--text-muted);">
						Promo posts a day
						<input
							name="groupPostsPerDay"
							type="number"
							min="0"
							max="10"
							value={s.groupPostsPerDay}
							disabled={ownerOnly}
							class="mt-1 w-full rounded-lg px-3 py-2"
							style={input}
						/>
					</label>
				</div>
				<label class="mt-2 block" style="color: var(--text-muted);">
					Group search words (one per line)
					<textarea
						name="groupKeywords"
						rows="4"
						disabled={ownerOnly}
						class="mt-1 w-full rounded-lg px-3 py-2"
						style={input}>{s.groupKeywords.join('\n')}</textarea
					>
				</label>
			</div>
			<div class="sm:col-span-2">
				<button
					type="submit"
					disabled={ownerOnly}
					class="rounded-lg px-4 py-2 text-sm font-semibold"
					style={primary(ownerOnly)}>Save group limits</button
				>
			</div>
		</form>
	</section>

	<!-- ============================== Groups ============================== -->
	<section class="rounded-lg p-6" style={card}>
		<h2 class="text-lg font-semibold" style="color: var(--text);">
			Group chats ({data.groups.rows.filter((g) => g.status === 'joined').length} joined)
		</h2>
		<p class="text-xs" style="color: var(--text-muted);">
			Today: answered {data.groups.today.replies} buyer{data.groups.today.replies === 1 ? '' : 's'} ·
			{data.groups.today.posts} promo post{data.groups.today.posts === 1 ? '' : 's'} · joined {data
				.groups.today.joins} · {data.groups.queued} groups lined up · last run {when(
				data.groups.lastRunAt
			)}
		</p>
		{#if data.groups.rows.length === 0}
			<p class="mt-2 text-sm" style="color: var(--text-muted);">
				No groups yet. Add group search words above and wait for the next check.
			</p>
		{:else}
			<div class="mt-3 overflow-x-auto">
				<table class="w-full text-xs" style="color: var(--text);">
					<thead style="color: var(--text-muted);">
						<tr class="text-left">
							<th class="py-1 pr-3">Group</th>
							<th class="py-1 pr-3">Status</th>
							<th class="py-1 pr-3">Members</th>
							<th class="py-1 pr-3">Promos</th>
							<th class="py-1 pr-3">Buyers answered</th>
							<th class="py-1 pr-3">Missed (limits)</th>
							<th class="py-1">Latest</th>
						</tr>
					</thead>
					<tbody>
						{#each data.groups.rows as group (group.username)}
							<tr style="border-top: 1px solid var(--border);">
								<td class="py-1 pr-3">
									<a
										href={`https://t.me/${group.username}`}
										target="_blank"
										rel="noreferrer"
										class="underline">{group.title}</a
									>
								</td>
								<td class="py-1 pr-3">
									{group.status === 'joined'
										? 'Watching'
										: group.status === 'blocked'
											? `Can't post (${group.reason})`
											: group.status === 'skipped'
												? `Skipped (${group.reason})`
												: 'Found'}
								</td>
								<td class="py-1 pr-3">{group.members.toLocaleString('en-NG')}</td>
								<td class="py-1 pr-3">
									{group.adsAllowed
										? group.promoStopped
											? `stopped after ${group.promoPosts}`
											: `${group.promoPosts} posted`
										: 'not allowed'}
								</td>
								<td class="py-1 pr-3">{group.replies}</td>
								<td class="py-1 pr-3">{group.missed}</td>
								<td class="py-1" style="color: var(--text-muted);">{group.lastNote}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	</section>

	<!-- ============================== Activity ============================== -->
	<section class="rounded-lg p-6" style={card}>
		<h2 class="text-lg font-semibold" style="color: var(--text);">Recent activity</h2>
		{#if data.actions.length === 0}
			<p class="mt-2 text-sm" style="color: var(--text-muted);">No activity yet.</p>
		{:else}
			<ul class="mt-2 space-y-1 text-xs" style="color: var(--text);">
				{#each data.actions as item, i (i)}
					<li>
						<span style="color: var(--text-muted);">{when(item.at)}</span> · {item.action.replace(
							/_/g,
							' '
						)}{item.channel ? ` · @${item.channel}` : ''}
					</li>
				{/each}
			</ul>
		{/if}
	</section>
</div>
