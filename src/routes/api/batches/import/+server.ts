import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import type { Prisma } from '@prisma/client';
import { prisma } from '$lib/prisma';
import { parseCsvText } from '$lib/helpers/csv';
import {
	buildCsvHeaderDescriptors,
	getCredentialDisplayLabel,
	parseKnownAccountFieldValue,
	type CredentialExtras
} from '$lib/helpers/account-credentials';
import { normalizeAccountDataForPersistence } from '$lib/helpers/account-credentials';
import { invalidateAdminStatsCache } from '$lib/services/admin-metrics';
import { sendLowStockAdminAlertIfNeeded } from '$lib/services/admin-alerts';

function asText(value: FormDataEntryValue | null): string {
	return typeof value === 'string' ? value.trim() : '';
}

export const POST: RequestHandler = async ({ request, locals }) => {
	try {
		if (!locals.user || locals.user.userType !== 'ADMIN') {
			return json({ data: null, error: 'Unauthorized' }, { status: 401 });
		}

		const formData = await request.formData();
		const fileEntry = formData.get('file');
		const tierId = asText(formData.get('tier_id') || formData.get('tierId'));
		const requestedName = asText(formData.get('name'));
		const description = asText(formData.get('description'));

		if (!(fileEntry instanceof File)) {
			return json({ data: null, error: 'CSV file is required' }, { status: 400 });
		}
		if (!tierId) {
			return json({ data: null, error: 'Tier is required' }, { status: 400 });
		}

		const tier = await prisma.category.findUnique({
			where: { id: tierId },
			select: {
				id: true,
				name: true,
				parent: {
					select: {
						id: true,
						name: true
					}
				}
			}
		});
		if (!tier || !tier.parent) {
			return json({ data: null, error: 'Invalid tier selected for import' }, { status: 400 });
		}

		const csvText = await fileEntry.text();
		let parsedCsv: ReturnType<typeof parseCsvText>;
		try {
			parsedCsv = parseCsvText(csvText);
		} catch (error) {
			return json(
				{
					data: null,
					error:
						error instanceof Error
							? error.message
							: 'Invalid CSV format. Please check your file and retry.'
				},
				{ status: 400 }
			);
		}

		if (parsedCsv.headers.length === 0) {
			return json({ data: null, error: 'CSV file is empty or missing header row' }, { status: 400 });
		}

		if (parsedCsv.rows.length === 0) {
			return json({ data: null, error: 'CSV file has headers but no data rows' }, { status: 400 });
		}

		const headerDescriptors = buildCsvHeaderDescriptors(parsedCsv.headers);
		const duplicateHeaders: string[] = [];
		const seenHeaders = new Map<string, string>();
		for (const descriptor of headerDescriptors) {
			const key = descriptor.knownField
				? `known:${descriptor.knownField}`
				: `extra:${descriptor.normalized || descriptor.original.toLowerCase()}`;
			const previous = seenHeaders.get(key);
			if (previous) {
				duplicateHeaders.push(
					`${previous} and ${descriptor.original || `Column ${descriptor.index + 1}`}`
				);
				continue;
			}
			seenHeaders.set(key, descriptor.original || `Column ${descriptor.index + 1}`);
		}
		if (duplicateHeaders.length > 0) {
			return json(
				{
					data: null,
					error: `Duplicate CSV columns detected: ${duplicateHeaders.slice(0, 3).join('; ')}`
				},
				{ status: 400 }
			);
		}

		const rowErrors: string[] = [];
		const accountRows: Record<string, unknown>[] = [];

		for (const row of parsedCsv.rows) {
			if (row.values.length !== headerDescriptors.length) {
				rowErrors.push(
					`Line ${row.line}: expected ${headerDescriptors.length} columns but found ${row.values.length}`
				);
				continue;
			}

			const account: Record<string, unknown> = {
				categoryId: tierId,
				platform: tier.parent.name || tier.name || 'Unknown',
				status: 'available'
			};
			const credentialExtras: CredentialExtras = {};

			for (const descriptor of headerDescriptors) {
				const rawValue = row.values[descriptor.index] ?? '';
				const value = rawValue.trim();
				if (!value) continue;

				if (descriptor.knownField) {
					const parsed = parseKnownAccountFieldValue(descriptor.knownField, value);
					if (!parsed.ok) {
						rowErrors.push(
							`Line ${row.line} (${getCredentialDisplayLabel(descriptor.original)}): ${parsed.error}`
						);
						continue;
					}
					account[descriptor.knownField] = parsed.value;
					continue;
				}

				const extraKey = descriptor.original || `Column ${descriptor.index + 1}`;
				credentialExtras[extraKey] = value;
			}

			if (Object.keys(credentialExtras).length > 0) {
				account.credentialExtras = credentialExtras;
			}

			accountRows.push(account);
		}

		if (rowErrors.length > 0) {
			const preview = rowErrors.slice(0, 5).join(' | ');
			const suffix = rowErrors.length > 5 ? ` | +${rowErrors.length - 5} more error(s)` : '';
			return json(
				{
					data: null,
					error: `Import failed validation. ${preview}${suffix}`,
					errors: rowErrors
				},
				{ status: 400 }
			);
		}

		if (accountRows.length === 0) {
			return json({ data: null, error: 'No non-empty account rows found in CSV' }, { status: 400 });
		}

		const nowIso = new Date().toISOString();
		const metadata = {
			filename: fileEntry.name,
			upload_date: nowIso,
			file_size: fileEntry.size,
			headers: parsedCsv.headers,
			field_map: headerDescriptors.map((descriptor) => ({
				header: descriptor.original,
				normalized: descriptor.normalized,
				mapped_to: descriptor.knownField || null,
				label: getCredentialDisplayLabel(descriptor.original)
			}))
		};
		const batchName = requestedName || fileEntry.name.replace(/\.csv$/i, '') || 'Unnamed Batch';

		const createdBatch = await prisma.$transaction(async (tx) => {
			const batch = await tx.accountBatch.create({
				data: {
					categoryId: tierId,
					supplier: batchName,
					notes: description || null,
					totalUnits: accountRows.length,
					remainingUnits: accountRows.length,
					importStatus: 'completed',
					descriptors: {
						...metadata,
						status: 'completed',
						processed_accounts: accountRows.length
					}
				}
			});

			const normalizedAccounts = accountRows.map((rawAccount) => {
				const normalized = normalizeAccountDataForPersistence(rawAccount);
				return {
					...(normalized as Prisma.AccountUncheckedCreateInput),
					batchId: batch.id,
					categoryId: tierId,
					platform: tier.parent?.name || tier.name || 'Unknown',
					status: 'available'
				};
			});

			const insertResult = await tx.account.createMany({
				data: normalizedAccounts
			});
			if (insertResult.count !== normalizedAccounts.length) {
				throw new Error(
					`Batch import count mismatch: expected ${normalizedAccounts.length}, inserted ${insertResult.count}`
				);
			}

			return batch;
		});

		invalidateAdminStatsCache();
		void sendLowStockAdminAlertIfNeeded('batch_import').catch((error) => {
			console.error('Failed to evaluate low-stock alert after batch import:', error);
		});

		return json({
			data: {
				id: createdBatch.id,
				name: createdBatch.supplier || batchName,
				description: createdBatch.notes,
				tier_id: createdBatch.categoryId,
				total_accounts: createdBatch.totalUnits,
				processed_accounts: createdBatch.totalUnits,
				status: createdBatch.importStatus || 'completed',
				created_at: createdBatch.createdAt.toISOString(),
				updated_at: createdBatch.updatedAt.toISOString(),
				metadata
			},
			error: null
		});
	} catch (error) {
		console.error('Batch import error:', error);
		return json(
			{ data: null, error: error instanceof Error ? error.message : 'Batch import failed' },
			{ status: 500 }
		);
	}
};
