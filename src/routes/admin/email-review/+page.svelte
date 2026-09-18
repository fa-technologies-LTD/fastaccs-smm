<script lang="ts">
	import { Mail, Search } from '$lib/icons';

	type Audience = 'All' | 'Customer' | 'Admin';
	type Classification = 'All' | 'Transactional' | 'Marketing' | 'Operational';
	type State = 'All' | 'Live' | 'Paused' | 'Manual';

	interface EmailEntry {
		id: string;
		name: string;
		audience: 'Customer' | 'Admin';
		classification: 'Transactional' | 'Marketing' | 'Operational';
		state: 'Live' | 'Paused' | 'Manual';
		trigger: string;
		timing: string;
		frequency: string;
		protections: string;
		subject: string;
		preheader: string;
		body: string;
		ctaText: string | null;
		ctaUrl: string | null;
		notes: string;
		source: string;
		html: string;
	}

	let { data }: { data: { entries: EmailEntry[] } } = $props();
	let query = $state('');
	let audience = $state<Audience>('All');
	let classification = $state<Classification>('All');
	let statusFilter = $state<State>('All');
	let selectedId = $state('');

	const normalizedQuery = $derived(query.trim().toLowerCase());
	const filtered = $derived(
		data.entries.filter((entry) => {
			if (audience !== 'All' && entry.audience !== audience) return false;
			if (classification !== 'All' && entry.classification !== classification) return false;
			if (statusFilter !== 'All' && entry.state !== statusFilter) return false;
			if (!normalizedQuery) return true;
			return [entry.name, entry.subject, entry.trigger, entry.body, entry.notes, entry.source]
				.join(' ')
				.toLowerCase()
				.includes(normalizedQuery);
		})
	);
	const selected = $derived(
		filtered.find((entry) => entry.id === selectedId) || filtered[0] || data.entries[0]
	);
	const customerCount = $derived(
		data.entries.filter((entry) => entry.audience === 'Customer').length
	);
	const adminCount = $derived(data.entries.filter((entry) => entry.audience === 'Admin').length);
	const pausedCount = $derived(data.entries.filter((entry) => entry.state === 'Paused').length);

	function selectEmail(id: string) {
		selectedId = id;
		if (window.innerWidth < 1100) {
			requestAnimationFrame(() => {
				document.getElementById('email-review-detail')?.scrollIntoView({
					behavior: 'smooth',
					block: 'start'
				});
			});
		}
	}
</script>

<svelte:head>
	<title>Email Review | Fast Accounts Admin</title>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<main class="review-page">
	<header class="page-header">
		<div class="header-icon"><Mail size={22} /></div>
		<div>
			<p class="eyebrow">INTERNAL REVIEW</p>
			<h1>Every email, in one place</h1>
			<p class="intro">
				See what customers receive, why it sends, and how often—without sending anything.
			</p>
		</div>
	</header>

	<section class="summary" aria-label="Email catalogue summary">
		<div><strong>{data.entries.length}</strong><span>email versions</span></div>
		<div><strong>{customerCount}</strong><span>customer-facing</span></div>
		<div><strong>{adminCount}</strong><span>admin</span></div>
		<div><strong>{pausedCount}</strong><span>paused</span></div>
	</section>
	<p class="shared-rule">
		Shared rule: the “Move Fast Accounts to Primary” inbox tip appears only on a customer’s first
		three successfully sent emails. Failed attempts and admin/operations emails do not count.
	</p>

	<section class="toolbar" aria-label="Filter emails">
		<label class="search-field">
			<Search size={17} />
			<span class="sr-only">Search emails</span>
			<input bind:value={query} placeholder="Search subject, trigger or copy…" />
		</label>
		<select bind:value={audience} aria-label="Filter by recipient">
			<option>All</option>
			<option>Customer</option>
			<option>Admin</option>
		</select>
		<select bind:value={classification} aria-label="Filter by email type">
			<option>All</option>
			<option>Transactional</option>
			<option>Marketing</option>
			<option>Operational</option>
		</select>
		<select bind:value={statusFilter} aria-label="Filter by state">
			<option>All</option>
			<option>Live</option>
			<option>Paused</option>
			<option>Manual</option>
		</select>
	</section>

	<div class="workspace">
		<aside class="email-list" aria-label="Email copies">
			<div class="list-heading">
				<strong>{filtered.length} shown</strong>
				<span>Choose an email</span>
			</div>
			{#each filtered as email (email.id)}
				<button
					type="button"
					class:active={selected?.id === email.id}
					onclick={() => selectEmail(email.id)}
				>
					<div class="email-row-top">
						<span class="state state-{email.state.toLowerCase()}">{email.state}</span>
						<span>{email.audience}</span>
					</div>
					<strong>{email.name}</strong>
					<small>{email.subject}</small>
				</button>
			{:else}
				<div class="empty">No emails match those filters.</div>
			{/each}
		</aside>

		{#if selected}
			<section class="detail" id="email-review-detail">
				<div class="detail-header">
					<div>
						<div class="pills">
							<span>{selected.audience}</span>
							<span>{selected.classification}</span>
							<span class="state state-{selected.state.toLowerCase()}">{selected.state}</span>
						</div>
						<h2>{selected.name}</h2>
					</div>
				</div>

				<div class="facts">
					<div>
						<span>When it fires</span>
						<p>{selected.trigger}</p>
					</div>
					<div>
						<span>Timing</span>
						<p>{selected.timing}</p>
					</div>
					<div>
						<span>Repeat rule</span>
						<p>{selected.frequency}</p>
					</div>
					<div>
						<span>Safeguards</span>
						<p>{selected.protections}</p>
					</div>
				</div>

				<div class="copy-panel">
					<div>
						<span>Subject</span>
						<p>{selected.subject}</p>
					</div>
					<div>
						<span>Inbox preview</span>
						<p>{selected.preheader}</p>
					</div>
					<div>
						<span>Body</span>
						<pre>{selected.body}</pre>
					</div>
					{#if selected.ctaText}
						<div>
							<span>Button</span>
							<p>{selected.ctaText}</p>
						</div>
					{/if}
				</div>

				<div class="review-note">
					<div>
						<span>What to know</span>
						<p>{selected.notes}</p>
					</div>
					<div><span>Live source</span><code>{selected.source}</code></div>
				</div>

				<div class="preview-heading">
					<div>
						<span>Rendered preview</span>
						<p>Sample names and order details only.</p>
					</div>
				</div>
				<div class="preview-frame">
					<iframe
						title={`${selected.name} rendered email preview`}
						srcdoc={selected.html}
						sandbox="allow-popups allow-popups-to-escape-sandbox"
					></iframe>
				</div>
			</section>
		{/if}
	</div>
</main>

<style>
	.review-page {
		max-width: 1500px;
		margin: 0 auto;
		padding: 28px 24px 72px;
		color: var(--text);
	}
	.page-header {
		display: flex;
		gap: 16px;
		align-items: flex-start;
	}
	.header-icon {
		display: grid;
		place-items: center;
		width: 46px;
		height: 46px;
		flex: 0 0 auto;
		border: 1px solid #1e6c49;
		border-radius: 14px;
		color: #31d083;
		background: #0d261a;
	}
	.eyebrow {
		margin: 0 0 6px;
		color: #31d083;
		font-size: 11px;
		font-weight: 800;
		letter-spacing: 0.16em;
	}
	h1 {
		margin: 0;
		font-size: clamp(28px, 4vw, 42px);
		line-height: 1.1;
		letter-spacing: -0.03em;
	}
	.intro {
		margin: 9px 0 0;
		color: var(--text-muted);
		font-size: 15px;
	}
	.summary {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 10px;
		margin: 24px 0 14px;
	}
	.summary div {
		padding: 15px 16px;
		border: 1px solid var(--border);
		border-radius: 14px;
		background: var(--bg-elev-1);
	}
	.summary strong {
		display: block;
		font-size: 23px;
		line-height: 1;
	}
	.summary span {
		display: block;
		margin-top: 7px;
		color: var(--text-muted);
		font-size: 12px;
	}
	.shared-rule {
		margin: 0 0 14px;
		padding: 11px 13px;
		border: 1px solid rgba(49, 208, 131, 0.25);
		border-radius: 12px;
		color: var(--text-muted);
		background: rgba(49, 208, 131, 0.07);
		font-size: 13px;
		line-height: 1.55;
	}
	.toolbar {
		display: grid;
		grid-template-columns: minmax(260px, 1fr) repeat(3, auto);
		gap: 9px;
		margin-bottom: 14px;
	}
	.search-field {
		display: flex;
		align-items: center;
		gap: 9px;
		min-height: 44px;
		padding: 0 13px;
		border: 1px solid var(--border);
		border-radius: 12px;
		color: var(--text-muted);
		background: var(--bg-elev-1);
	}
	.search-field input {
		width: 100%;
		border: 0;
		outline: 0;
		color: var(--text);
		background: transparent;
		font: inherit;
	}
	select {
		min-height: 44px;
		padding: 0 34px 0 12px;
		border: 1px solid var(--border);
		border-radius: 12px;
		color: var(--text);
		background: var(--bg-elev-1);
	}
	.workspace {
		display: grid;
		grid-template-columns: minmax(270px, 350px) minmax(0, 1fr);
		align-items: start;
		min-height: 700px;
		border: 1px solid var(--border);
		border-radius: 18px;
		overflow: hidden;
		background: var(--bg-elev-1);
	}
	.email-list {
		position: sticky;
		top: 16px;
		max-height: calc(100vh - 32px);
		overflow-y: auto;
		border-right: 1px solid var(--border);
	}
	.list-heading {
		position: sticky;
		top: 0;
		z-index: 2;
		display: flex;
		justify-content: space-between;
		padding: 17px;
		border-bottom: 1px solid var(--border);
		background: color-mix(in srgb, var(--bg-elev-1) 94%, transparent);
		backdrop-filter: blur(12px);
	}
	.list-heading span {
		color: var(--text-muted);
		font-size: 12px;
	}
	.email-list button {
		display: block;
		width: 100%;
		padding: 16px 17px;
		border: 0;
		border-bottom: 1px solid var(--border);
		color: var(--text);
		text-align: left;
		background: transparent;
		cursor: pointer;
	}
	.email-list button:hover {
		background: rgba(255, 255, 255, 0.035);
	}
	.email-list button.active {
		box-shadow: inset 3px 0 #28c77b;
		background: #0c2118;
	}
	.email-row-top {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 8px;
		color: var(--text-muted);
		font-size: 10px;
		text-transform: uppercase;
		letter-spacing: 0.07em;
	}
	.email-list button strong {
		display: block;
		font-size: 14px;
	}
	.email-list button small {
		display: -webkit-box;
		margin-top: 5px;
		overflow: hidden;
		color: var(--text-muted);
		font-size: 12px;
		line-height: 1.4;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
	}
	.state {
		display: inline-flex;
		width: fit-content;
		padding: 4px 7px;
		border-radius: 999px;
		font-size: 10px;
		font-weight: 800;
		line-height: 1;
	}
	.state-live {
		color: #43dc91;
		background: #0d3322;
	}
	.state-paused {
		color: #f0c96d;
		background: #342a0e;
	}
	.state-manual {
		color: #ada7ff;
		background: #222042;
	}
	.empty {
		padding: 30px 18px;
		color: var(--text-muted);
		text-align: center;
	}
	.detail {
		min-width: 0;
		padding: 26px;
		scroll-margin-top: 18px;
	}
	.detail-header h2 {
		margin: 12px 0 0;
		font-size: 28px;
		letter-spacing: -0.02em;
	}
	.pills {
		display: flex;
		flex-wrap: wrap;
		gap: 7px;
	}
	.pills > span:not(.state) {
		padding: 5px 8px;
		border: 1px solid var(--border);
		border-radius: 999px;
		color: var(--text-muted);
		font-size: 10px;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.06em;
	}
	.facts {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 10px;
		margin: 22px 0 12px;
	}
	.facts div,
	.copy-panel,
	.review-note {
		border: 1px solid var(--border);
		border-radius: 14px;
		background: var(--bg);
	}
	.facts div {
		padding: 14px;
	}
	.facts span,
	.copy-panel span,
	.review-note span,
	.preview-heading span {
		display: block;
		margin-bottom: 6px;
		color: #55d996;
		font-size: 10px;
		font-weight: 800;
		text-transform: uppercase;
		letter-spacing: 0.1em;
	}
	.facts p,
	.copy-panel p,
	.review-note p {
		margin: 0;
		color: var(--text);
		font-size: 13px;
		line-height: 1.55;
	}
	.copy-panel {
		padding: 2px 16px;
	}
	.copy-panel > div {
		padding: 14px 0;
		border-bottom: 1px solid var(--border);
	}
	.copy-panel > div:last-child {
		border: 0;
	}
	.copy-panel pre {
		margin: 0;
		white-space: pre-wrap;
		word-break: break-word;
		color: var(--text);
		font: 13px/1.65 inherit;
	}
	.review-note {
		display: grid;
		grid-template-columns: 1.3fr 1fr;
		gap: 18px;
		margin-top: 12px;
		padding: 15px 16px;
	}
	.review-note code {
		color: var(--text-muted);
		font-size: 11px;
		word-break: break-word;
	}
	.preview-heading {
		display: flex;
		justify-content: space-between;
		margin: 26px 2px 10px;
	}
	.preview-heading p {
		margin: 0;
		color: var(--text-muted);
		font-size: 12px;
	}
	.preview-frame {
		overflow: hidden;
		border: 1px solid var(--border);
		border-radius: 16px;
		background: #07100c;
	}
	.preview-frame iframe {
		display: block;
		width: 100%;
		height: 860px;
		border: 0;
		background: #07100c;
	}
	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
	}
	@media (max-width: 1099px) {
		.workspace {
			grid-template-columns: 1fr;
		}
		.email-list {
			position: static;
			max-height: 430px;
			border-right: 0;
			border-bottom: 1px solid var(--border);
		}
	}
	@media (max-width: 720px) {
		.review-page {
			padding: 20px 12px 56px;
		}
		.summary {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
		.toolbar {
			grid-template-columns: repeat(3, minmax(0, 1fr));
		}
		.search-field {
			grid-column: 1 / -1;
		}
		select {
			width: 100%;
			min-width: 0;
			padding-right: 18px;
			font-size: 12px;
		}
		.detail {
			padding: 20px 13px;
		}
		.facts,
		.review-note {
			grid-template-columns: 1fr;
		}
		.preview-frame iframe {
			height: 760px;
		}
	}
</style>
