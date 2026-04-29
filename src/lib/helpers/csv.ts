export interface ParsedCsvRow {
	line: number;
	values: string[];
}

export interface ParsedCsvResult {
	headers: string[];
	rows: ParsedCsvRow[];
}

function stripBom(value: string): string {
	if (value.charCodeAt(0) === 0xfeff) {
		return value.slice(1);
	}
	return value;
}

function normalizeLineEndingChar(input: string, index: number): { advance: number; isLineBreak: boolean } {
	const ch = input[index];
	if (ch === '\r') {
		if (input[index + 1] === '\n') {
			return { advance: 2, isLineBreak: true };
		}
		return { advance: 1, isLineBreak: true };
	}
	if (ch === '\n') {
		return { advance: 1, isLineBreak: true };
	}
	return { advance: 1, isLineBreak: false };
}

export function parseCsvText(csvText: string): ParsedCsvResult {
	const input = stripBom(String(csvText || ''));
	const rows: ParsedCsvRow[] = [];

	let index = 0;
	let line = 1;
	let rowLine = 1;
	let inQuotes = false;
	let fieldWasQuoted = false;
	let currentField = '';
	let currentRow: string[] = [];

	const pushField = () => {
		currentRow.push(fieldWasQuoted ? currentField : currentField.trim());
		currentField = '';
		fieldWasQuoted = false;
	};

	const pushRow = () => {
		const hasAnyValue = currentRow.some((value) => value.trim().length > 0);
		if (hasAnyValue) {
			rows.push({ line: rowLine, values: [...currentRow] });
		}
		currentRow = [];
	};

	while (index < input.length) {
		const ch = input[index];

		if (inQuotes) {
			if (ch === '"') {
				if (input[index + 1] === '"') {
					currentField += '"';
					index += 2;
					continue;
				}
				inQuotes = false;
				index += 1;
				continue;
			}

			const lineEnding = normalizeLineEndingChar(input, index);
			if (lineEnding.isLineBreak) {
				currentField += '\n';
				index += lineEnding.advance;
				line += 1;
				continue;
			}

			currentField += ch;
			index += 1;
			continue;
		}

		if (ch === '"') {
			if (currentField.trim().length > 0) {
				throw new Error(`Invalid CSV: unexpected quote at line ${line}`);
			}
			currentField = '';
			fieldWasQuoted = true;
			inQuotes = true;
			index += 1;
			continue;
		}

		if (ch === ',') {
			pushField();
			index += 1;
			continue;
		}

		const lineEnding = normalizeLineEndingChar(input, index);
		if (lineEnding.isLineBreak) {
			pushField();
			pushRow();
			index += lineEnding.advance;
			line += 1;
			rowLine = line;
			continue;
		}

		currentField += ch;
		index += 1;
	}

	if (inQuotes) {
		throw new Error(`Invalid CSV: unterminated quoted field at line ${line}`);
	}

	pushField();
	pushRow();

	if (rows.length === 0) {
		return { headers: [], rows: [] };
	}

	const [headerRow, ...dataRows] = rows;
	const headers = headerRow.values.map((header) => header.trim());

	return {
		headers,
		rows: dataRows
	};
}
