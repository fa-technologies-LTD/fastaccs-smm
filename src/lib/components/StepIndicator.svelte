<script lang="ts">
	import { ChevronRight } from '@lucide/svelte';

	interface Props {
		steps?: Array<{ label: string; completed?: boolean }>;
		currentStep?: number;
	}

	let { steps = [], currentStep = 1 }: Props = $props();

	// Default steps if not provided
	const defaultSteps = [
		{ label: 'Choose Category', completed: false },
		{ label: 'Select Quantity', completed: false },
		{ label: 'Checkout', completed: false }
	];

	const displaySteps = steps.length > 0 ? steps : defaultSteps;
</script>

<!-- Step Indicator -->
<div class="flex items-center gap-2 rounded-lg bg-white/10 px-4 py-2 backdrop-blur-sm">
	<div class="flex items-center gap-2">
		<div
			class="flex h-6 w-6 items-center justify-center rounded-full bg-white text-xs font-bold text-blue-600"
		>
			{currentStep}
		</div>
		<span class="text-sm font-medium">{displaySteps[currentStep - 1]?.label || 'Step'}</span>
	</div>
	{#each displaySteps.slice(currentStep) as step, i}
		<ChevronRight class="h-4 w-4 opacity-50" />
		<span class="text-sm opacity-75">{step.label}</span>
	{/each}
</div>
