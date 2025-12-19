# Support Page

## Purpose

Customer support hub where users can find help, contact the team, and access FAQs. Provides multiple communication channels and self-service resources.

## Route

`/support`

## File Structure

- `+page.svelte` - Main support page (static)

## Components Imported

- **Navigation** (`$lib/components/Navigation.svelte`) - Global navigation
- **Footer** (`$lib/components/Footer.svelte`) - Site footer

## Icons Used

- `Mail`, `MessageCircle`, `Phone`, `Clock`, `HelpCircle`, `Send` from `@lucide/svelte`

## Data Sources

### No API Calls

Static content page. Contact form submission (if implemented) would use API.

## Page Sections

### 1. Hero Section

**Content:**

- Page title: "We're Here to Help"
- Subtitle: Support commitment message
- Visual: Gradient background

### 2. Contact Methods

#### Email Support

- **Icon:** Mail
- **Contact:** support@fastaccs.com
- **Response Time:** 24 hours
- **Best For:** Detailed issues, account problems

#### Live Chat

- **Icon:** MessageCircle
- **Status:** Available 24/7 (or business hours)
- **Response Time:** Real-time
- **Best For:** Quick questions

#### Phone Support

- **Icon:** Phone
- **Contact:** +234 XXX XXX XXXX
- **Hours:** Business hours
- **Best For:** Urgent issues

### 3. Contact Form

**Fields:**

- Name (required)
- Email (required)
- Subject (required)
- Message (required, textarea)

**Actions:**

- Send Message button
- Form validation
- Success/error feedback

**API (When Implemented):**

```typescript
POST / api / support / ticket;
{
	name: string;
	email: string;
	subject: string;
	message: string;
}
```

### 4. FAQ Section

**Common Questions:**

1. **How long does delivery take?**
   - Answer: Instant for most orders

2. **What if my account has issues?**
   - Answer: Contact support for replacement

3. **Can I get a refund?**
   - Answer: Refund policy explanation

4. **How do I access my purchases?**
   - Answer: Dashboard → Purchases tab

5. **What payment methods do you accept?**
   - Answer: Wallet, cards, bank transfer

6. **Is it safe to buy accounts?**
   - Answer: Security explanation

7. **Can I choose a specific account?**
   - Answer: Automated system explanation

8. **What about account warranty?**
   - Answer: Warranty/guarantee terms

### 5. Quick Links

- View Orders → `/dashboard?tab=orders`
- Track Purchase → `/dashboard?tab=purchases`
- Manage Account → `/dashboard?tab=profile`
- Browse Accounts → `/platforms`

### 6. Business Hours

**Support Availability:**

- Email: 24/7
- Live Chat: [Hours specified]
- Phone: Mon-Fri 9AM-6PM WAT

## Page State

```typescript
let formData = $state({
	name: '',
	email: '',
	subject: '',
	message: ''
});

let submitting = $state(false);
let submitted = $state(false);
let error = $state<string | null>(null);
```

## Form Handling

### Validation

- Name: Required, min 2 chars
- Email: Required, valid format
- Subject: Required
- Message: Required, min 10 chars

### Submission (If Implemented)

```typescript
async function handleSubmit() {
	submitting = true;

	const response = await fetch('/api/support/ticket', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(formData)
	});

	if (response.ok) {
		submitted = true;
		// Show success message
		// Clear form
	} else {
		error = 'Failed to send message';
	}

	submitting = false;
}
```

## User Actions

- Read FAQ for self-service help
- Fill contact form
- Click email/phone links to contact directly
- Navigate to dashboard for account management
- Use live chat (if implemented)

## SEO Metadata

- **Title**: "Support - FastAccs"
- **Description**: "Get help with your FastAccs account. Contact our 24/7 support team via email, chat, or phone."

## Key Features

### Self-Service

- Comprehensive FAQ
- Quick links to dashboard sections
- Clear instructions

### Multiple Channels

- Email for detailed issues
- Chat for quick help
- Phone for urgent matters

### User-Friendly

- Simple contact form
- Clear contact info
- Expected response times

## Related Pages

- `/dashboard` - User account management
- `/how-it-works` - Platform explanation
- `/platforms` - Browse products

## Component Dependencies

```
+page.svelte
├── Navigation
├── Footer
└── Form elements (native HTML)
```

## Backend Integration Needed

### Support Ticket System

**Table: SupportTicket**

```typescript
{
  id: string;
  userId?: string; // Optional if not logged in
  name: string;
  email: string;
  subject: string;
  message: string;
  status: 'open' | 'in_progress' | 'resolved' | 'closed';
  priority: 'low' | 'medium' | 'high';
  createdAt: DateTime;
  updatedAt: DateTime;
}
```

### Email Integration

- Send notification to support team
- Auto-reply to customer
- Ticket number generation

## Potential Enhancements

- Live chat widget integration (Intercom, Crisp)
- Ticket tracking system
- Knowledge base/Help Center
- Video tutorials
- Screen recording for bug reports
- Attachment uploads
- Status updates via email

## Contact Information

**Update these in production:**

- support@fastaccs.com
- +234 XXX XXX XXXX
- WhatsApp business number
- Telegram support channel
- Social media handles

## Notes

- Form submission not yet implemented
- Live chat may require third-party service
- Phone number placeholder needs updating
- Could add business address for credibility
- FAQ could be expanded to separate knowledge base
- Consider adding chatbot for automated responses
