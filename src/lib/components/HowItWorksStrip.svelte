<section class="how-strip" aria-label="How it works">
	<div class="strip-inner">
		<p class="strip-label">How it works</p>
		<div class="steps">
			<div class="step">
				<span class="step-num">1</span>
				<div>
					<p class="step-title">Browse & pick</p>
					<p class="step-body">Choose a platform and account type that fits your needs.</p>
				</div>
			</div>
			<span class="step-divider" aria-hidden="true"></span>
			<div class="step">
				<span class="step-num">2</span>
				<div>
					<p class="step-title">Pay securely</p>
					<p class="step-body">Complete checkout with our encrypted payment gateway.</p>
				</div>
			</div>
			<span class="step-divider" aria-hidden="true"></span>
			<div class="step">
				<span class="step-num">3</span>
				<div>
					<p class="step-title">Receive full details</p>
					<p class="step-body">Login credentials delivered to your email within minutes.</p>
				</div>
			</div>
		</div>
	</div>
</section>

<style>
	.how-strip {
		background: var(--bg-elev-1);
		border-top: 1px solid var(--border);
		border-bottom: 1px solid var(--border);
		padding: 1.5rem 1rem;
	}

	.strip-inner {
		max-width: 64rem;
		margin: 0 auto;
	}

	.strip-label {
		font-family: var(--font-head);
		font-size: 0.7rem;
		font-weight: 700;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--primary);
		text-align: center;
		margin-bottom: 1rem;
	}

	.steps {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	@media (min-width: 640px) {
		.steps {
			flex-direction: row;
			align-items: flex-start;
			gap: 0;
		}
	}

	.step {
		display: flex;
		align-items: flex-start;
		gap: 0.75rem;
		flex: 1;
	}

	@media (min-width: 640px) {
		.step {
			padding: 0 1.25rem;
		}
		.step:first-child {
			padding-left: 0;
		}
		.step:last-child {
			padding-right: 0;
		}
	}

	.step-num {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		border-radius: 50%;
		background: rgba(5, 212, 113, 0.14);
		border: 1px solid rgba(5, 212, 113, 0.32);
		color: var(--primary);
		font-family: var(--font-head);
		font-size: 0.8rem;
		font-weight: 700;
		flex-shrink: 0;
	}

	.step-title {
		font-family: var(--font-head);
		font-size: 0.92rem;
		font-weight: 700;
		color: var(--text);
		margin-bottom: 0.2rem;
	}

	.step-body {
		font-family: var(--font-body);
		font-size: 0.82rem;
		color: var(--text-muted);
		line-height: 1.45;
	}

	.step-divider {
		display: none;
	}

	@media (min-width: 640px) {
		.step-divider {
			display: block;
			width: 1px;
			align-self: stretch;
			background: var(--border);
			flex-shrink: 0;
			margin-top: 4px;
		}
	}
</style>
