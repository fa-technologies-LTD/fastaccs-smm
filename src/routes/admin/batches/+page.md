# Admin Batches Management

## Purpose

Bulk upload and manage account batches via CSV import. Upload hundreds/thousands of accounts at once, map CSV columns to database fields, validate data, and track import progress.

## Route

`/admin/batches`

## File Structure

- `+page.svelte` - Batch upload UI
- `+page.ts` - Client-side data loading

## Components Imported

- **Navigation** - Admin navigation
- **Footer** - Site footer

## Icons Used

- `Upload`, `Download`, `FileText`, `CheckCircle`, `XCircle`, `AlertCircle`, `Clock`, `Trash2`, `Eye` from `@lucide/svelte`

## Data Sources

### API Endpoints

**1. GET** `/api/admin/batches?page=1&limit=20`
**Returns:**

```typescript
{
  success: boolean;
  data: {
    batches: Batch[];
    totalCount: number;
    currentPage: number;
    totalPages: number;
  };
}
```

**Batch Interface:**

```typescript
interface Batch {
	id: string;
	filename: string;
	status: 'pending' | 'processing' | 'completed' | 'failed' | 'partial';
	totalRecords: number;
	successCount: number;
	failedCount: number;
	errors?: BatchError[];
	uploadedBy: string; // Admin user ID
	startedAt?: DateTime;
	completedAt?: DateTime;
	createdAt: DateTime;
	metadata?: {
		platform?: string;
		tier?: string;
		columnMapping?: Record<string, string>;
	};
}

interface BatchError {
	row: number;
	field: string;
	value: string;
	error: string;
}
```

**2. POST** `/api/admin/batches/upload` - Upload CSV file

**3. POST** `/api/admin/batches/${id}/process` - Start processing batch

**4. GET** `/api/admin/batches/${id}` - Get batch details and errors

**5. DELETE** `/api/admin/batches/${id}` - Delete batch

**6. GET** `/api/admin/batches/${id}/download-errors` - Download error CSV

**7. GET** `/api/admin/batches/template` - Download CSV template

## Page State

```typescript
let batches = $state<Batch[]>([]);
let loading = $state(true);
let uploading = $state(false);
let currentBatch = $state<Batch | null>(null);
let showDetailsModal = $state(false);
let uploadProgress = $state<number>(0);
let selectedFile = $state<File | null>(null);
let selectedPlatform = $state<string>('');
let selectedTier = $state<string>('');
let columnMapping = $state<Record<string, string>>({});
```

## Key Features

### 1. Upload Section

**File Upload Area:**

- Drag-and-drop zone
- Or click to browse
- Accepts .csv files only
- Shows selected filename
- File size limit (e.g., 10MB max)

**Upload Form:**

- Platform dropdown (required)
- Tier dropdown (filtered by platform)
- CSV file selector
- Column mapping preview
- Upload button

**CSV Requirements:**

- Format: UTF-8 encoded CSV
- Required columns: username, email, password
- Optional columns: emailPassword, twoFactorCode, accountLink, followers, following, posts
- First row must be headers

### 2. Column Mapping

**Auto-Detection:**
System attempts to map CSV columns automatically:

- "username" → username
- "email" → email
- "password" → password
- "email_password" → emailPassword
- "2fa" / "2fa_code" → twoFactorCode
- "link" / "url" → accountLink
- "followers" → stats.followers
- "following" → stats.following
- "posts" → stats.posts

**Manual Mapping:**
If columns don't match, admin can map manually:

- CSV Column → Database Field dropdown

### 3. Batch History Table

**Columns:**

- Batch ID (truncated)
- Filename
- Platform/Tier
- Status badge
- Total records
- Success count (green)
- Failed count (red)
- Uploaded by
- Upload date
- Actions

**Status Badges:**

- Pending: Gray - awaiting processing
- Processing: Blue - currently importing
- Completed: Green - all successful
- Failed: Red - all failed
- Partial: Orange - some succeeded, some failed

### 4. Batch Details Modal

**Information:**

- Batch ID
- Filename
- Platform and tier
- Status
- Upload date/time
- Processing started
- Processing completed
- Total records
- Success count
- Failed count

**Error Table (if any):**

- Row number
- Field name
- Invalid value
- Error message
- Action: Skip row / Fix and retry

**Actions:**

- Retry failed records
- Download error report (CSV)
- Delete batch
- Download original file

### 5. Processing Status

**Real-time Progress:**

- Progress bar (0-100%)
- Records processed / total
- Current status message
- Estimated time remaining

**Post-Processing Summary:**

- ✅ X accounts successfully added
- ❌ Y accounts failed
- ⚠️ Z accounts skipped (duplicates)
- View error details button

### 6. CSV Template Download

Provides a sample CSV with:

- Correct column headers
- Example rows
- Format guidelines
- Field requirements

## User Actions

### Uploading

- Select platform and tier
- Choose CSV file
- Review column mapping
- Start upload
- Monitor progress

### Management

- View batch history
- View batch details
- Download error reports
- Retry failed imports
- Delete old batches

## CSV Template Structure

```csv
username,email,password,emailPassword,twoFactorCode,accountLink,followers,following,posts
user1,user1@example.com,pass123,emailpass123,2FA001,https://instagram.com/user1,10500,850,42
user2,user2@example.com,pass456,emailpass456,2FA002,https://instagram.com/user2,10800,920,38
```

## API Request Examples

### Upload Batch

```typescript
POST /api/admin/batches/upload
Content-Type: multipart/form-data

{
  file: <CSV file>,
  platform: "instagram",
  tier: "instagram-10k",
  columnMapping: {
    "username": "username",
    "email": "email",
    "password": "password",
    "email_pwd": "emailPassword",
    "2fa": "twoFactorCode"
  }
}
```

### Process Batch

```typescript
POST /api/admin/batches/${batchId}/process

Response:
{
  success: boolean;
  message: string;
  batchId: string;
  status: "processing"
}
```

### Get Batch Details

```typescript
GET /api/admin/batches/${batchId}

Response:
{
  success: boolean;
  data: {
    batch: Batch;
    errors: BatchError[];
  }
}
```

### Download CSV Template

```typescript
GET /api/admin/batches/template

Returns: CSV file download
```

## Processing Flow

1. **Upload Phase**
   - Admin selects CSV file
   - System validates file format
   - Creates Batch record (status: pending)
   - Stores file temporarily

2. **Validation Phase**
   - Parse CSV rows
   - Validate required fields
   - Check for duplicates
   - Verify platform/tier exists
   - Record validation errors

3. **Import Phase**
   - Process valid rows
   - Create Account records
   - Update success/fail counts
   - Link to Product (tier)
   - Mark as available status

4. **Completion Phase**
   - Update Batch status
   - Generate error report if any
   - Send notification to admin
   - Clean up temporary files

## Validation Rules

### Required Fields

- username: Required, min 3 chars, unique
- email: Required, email format, unique
- password: Required, min 6 chars

### Optional Fields

- emailPassword: Min 6 chars if provided
- twoFactorCode: Alphanumeric
- accountLink: Valid URL
- followers: Positive integer
- following: Positive integer
- posts: Non-negative integer

### Duplicate Detection

Check against existing accounts:

- Username exact match
- Email exact match
- Skip if duplicate found

## Error Handling

### Common Errors

- Missing required field
- Invalid email format
- Duplicate username/email
- Invalid platform/tier ID
- Malformed CSV
- File too large
- Processing timeout

### Error Report

CSV file with:

- Original row number
- All column values
- Error message
- Suggested fix

## SEO Metadata

- **Title**: "Batch Upload - Admin - FastAccs"
- **Robots**: "noindex, nofollow"

## Security

- Admin role required
- File type validation (CSV only)
- File size limit
- Sanitize CSV input
- Prevent CSV injection
- Rate limiting on uploads

## Related Pages

- `/admin/inventory` - View uploaded accounts
- `/admin/categories` - Manage platforms/tiers

## Component Dependencies

```
+page.svelte
├── Navigation
├── Footer
├── File upload component
├── Progress bar
├── Modal components
└── Batches API
```

## Backend Services Used

- `src/lib/services/batches.ts` - Batch processing
- `src/lib/services/inventory.ts` - Account creation
- `src/routes/api/admin/batches/+server.ts` - Main endpoint

## Database Operations

### Create Batch

```typescript
const batch = await prisma.batch.create({
	data: {
		filename,
		status: 'pending',
		totalRecords: 0,
		successCount: 0,
		failedCount: 0,
		uploadedBy: adminUserId,
		metadata: {
			platform,
			tier,
			columnMapping
		}
	}
});
```

### Process Batch

```typescript
// For each valid row in CSV
await prisma.account.create({
	data: {
		productId,
		username,
		email,
		emailPassword,
		password,
		twoFactorCode,
		accountLink,
		stats: {
			followers,
			following,
			posts
		},
		status: 'available'
	}
});

// Update batch progress
await prisma.batch.update({
	where: { id: batchId },
	data: {
		successCount: { increment: 1 }
	}
});
```

### Record Errors

```typescript
await prisma.batchError.createMany({
	data: errors.map((err) => ({
		batchId,
		row: err.row,
		field: err.field,
		value: err.value,
		error: err.error
	}))
});
```

## Performance Considerations

- Process batches in chunks (100-500 rows at a time)
- Use database transactions
- Queue large batches
- Timeout after 5 minutes
- Use worker threads for processing
- Store files in temporary directory
- Clean up old batches after 30 days

## Batch Status Flow

```
pending → processing → completed
                 ↓         ↓
              failed    partial
```

## Notes

- Large batches (>1000 rows) may take several minutes
- Consider using job queue (Bull, etc.) for async processing
- Email admin when batch completes
- Store original CSV for 7 days for reference
- Partial status means some succeeded, some failed
- Can retry only failed rows from a batch
- Template CSV includes data format examples
- Column mapping saved for future uploads
