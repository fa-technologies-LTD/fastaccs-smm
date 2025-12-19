# Authentication Pages

## Overview

Authentication system with login, signup, and OAuth flows. Handles user registration, email/password authentication, Google OAuth, and session management.

---

## Login Page

### Route

`/auth/login`

### File Structure

- `+page.svelte` - Login UI
- No `+page.server.ts` (uses API routes)

### Purpose

Authenticate existing users via email/password or Google OAuth. Redirects authenticated users and preserves return URL.

### Components Imported

- **Navigation** (`$lib/components/Navigation.svelte`) - Global navigation
- **Footer** (`$lib/components/Footer.svelte`) - Site footer

### Icons Used

- `Mail`, `Lock`, `AlertCircle` from `@lucide/svelte`
- Google logo (inline SVG)

### Data Sources

**API Endpoint:**

```typescript
POST /api/auth/login
{
  email: string;
  password: string;
}

Returns:
{
  success: boolean;
  message: string;
  error?: string;
}
```

**Google OAuth:**

```typescript
GET / api / auth / google;
// Redirects to Google OAuth consent
```

### Page State

```typescript
let email = $state('');
let password = $state('');
let loading = $state(false);
let error = $state<string | null>(null);
```

### Form Fields

1. **Email**
   - Type: email
   - Required
   - Validation: Email format

2. **Password**
   - Type: password
   - Required
   - Minimum: 8 characters

### User Actions

- Submit email/password form
- Click "Sign in with Google"
- Navigate to `/auth/signup`
- Navigate to `/auth/forgot-password` (if exists)

### Authentication Flow

```
1. User enters credentials
2. POST to /api/auth/login
3. Backend validates credentials
4. Creates session
5. Sets session cookie
6. Redirects to returnUrl or /dashboard
```

### Error Handling

- Invalid credentials
- Account not found
- Server error
- Network error

### SEO Metadata

- **Title**: "Login - FastAccs"
- **Description**: "Sign in to your FastAccs account"

---

## Signup Page

### Route

`/auth/signup`

### File Structure

- `+page.svelte` - Signup UI

### Purpose

Register new users with email/password or Google OAuth. Creates user account and session.

### Components Imported

- **Navigation** - Global navigation
- **Footer** - Site footer

### Icons Used

- `User`, `Mail`, `Lock`, `AlertCircle` from `@lucide/svelte`
- Google logo (inline SVG)

### Data Sources

**API Endpoint:**

```typescript
POST /api/auth/signup
{
  name: string;
  email: string;
  password: string;
  confirmPassword: string;
}

Returns:
{
  success: boolean;
  message: string;
  userId: string;
  error?: string;
}
```

### Page State

```typescript
let name = $state('');
let email = $state('');
let password = $state('');
let confirmPassword = $state('');
let loading = $state(false);
let error = $state<string | null>(null);
```

### Form Fields

1. **Full Name**
   - Required
   - Minimum: 2 characters

2. **Email**
   - Type: email
   - Required
   - Must be unique

3. **Password**
   - Type: password
   - Required
   - Minimum: 8 characters
   - Requirements shown

4. **Confirm Password**
   - Must match password

### Validation Rules

- All fields required
- Email format valid
- Password minimum 8 chars
- Passwords match
- Email not already registered

### User Actions

- Submit registration form
- Click "Sign up with Google"
- Navigate to `/auth/login`

### Registration Flow

```
1. User fills form
2. Client validates inputs
3. POST to /api/auth/signup
4. Backend checks email uniqueness
5. Hashes password (bcrypt)
6. Creates User record
7. Creates session
8. Sets session cookie
9. Redirects to /dashboard
```

### Error Handling

- Email already exists
- Passwords don't match
- Invalid email format
- Weak password
- Server error

### SEO Metadata

- **Title**: "Sign Up - FastAccs"
- **Description**: "Create your FastAccs account"

---

## OAuth Callback Page

### Route

`/auth/callback/google`

### File Structure

- `+page.svelte` - Loading state
- `+page.ts` - Handle OAuth callback

### Purpose

Receive OAuth code from Google, exchange for user data, create/login user, establish session.

### Components Imported

- **Loader** icon from `@lucide/svelte`

### Data Sources

**API Endpoint:**

```typescript
POST /api/auth/google/callback
{
  code: string; // From query param
}

Returns:
{
  success: boolean;
  user: User;
  isNewUser: boolean;
  error?: string;
}
```

### OAuth Flow

```
1. User clicks "Sign in with Google" on login/signup
2. Redirects to Google OAuth consent
3. User approves
4. Google redirects to /auth/callback/google?code=xxx
5. +page.ts extracts code
6. POST code to /api/auth/google/callback
7. Backend exchanges code for tokens
8. Fetches user info from Google
9. Finds or creates User record
10. Creates session
11. Redirects to /dashboard
```

### Page State

```typescript
let status = $state<'loading' | 'success' | 'error'>('loading');
let message = $state('Authenticating with Google...');
```

### Query Parameters

- `code` - OAuth authorization code (required)
- `state` - CSRF token (optional)
- `error` - OAuth error (if declined)

### Error Handling

- Missing code
- Invalid code
- OAuth error from Google
- Failed to fetch user info
- Database error

### Security

- State parameter for CSRF protection
- Code exchange happens server-side only
- Google tokens not exposed to client
- Session cookie HttpOnly

---

## Shared Authentication Logic

### Session Management

**Location:** `src/lib/auth/session.ts`

**Functions:**

- `createSession(userId)` - Creates session record
- `getSession(sessionId)` - Retrieves session
- `deleteSession(sessionId)` - Logs out

### Password Hashing

**Location:** `src/lib/auth/user.ts`

**Functions:**

- `hashPassword(password)` - Bcrypt hash
- `verifyPassword(password, hash)` - Verify hash

### OAuth Integration

**Location:** `src/lib/auth/oauth.ts`

**Providers:**

- Google (implemented)
- Facebook (planned)
- Twitter (planned)

### Middleware

**Location:** `src/hooks.server.ts`

**Session Check:**

```typescript
export const handle: Handle = async ({ event, resolve }) => {
	const sessionId = event.cookies.get('session');

	if (sessionId) {
		const session = await getSession(sessionId);
		if (session) {
			event.locals.user = session.user;
		}
	}

	return resolve(event);
};
```

---

## Database Schema

### User Table

```typescript
model User {
  id            String    @id @default(uuid())
  name          String
  email         String    @unique
  passwordHash  String?   // Null for OAuth-only users
  role          String    @default("user")
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  sessions      Session[]
  orders        Order[]
  // ... other relations
}
```

### Session Table

```typescript
model Session {
  id        String   @id @default(uuid())
  userId    String
  expiresAt DateTime
  createdAt DateTime @default(now())

  user      User     @relation(fields: [userId], references: [id])
}
```

---

## Related API Routes

### `/api/auth/login/+server.ts`

- Validates credentials
- Creates session
- Sets cookie

### `/api/auth/signup/+server.ts`

- Validates input
- Checks email uniqueness
- Hashes password
- Creates user
- Creates session

### `/api/auth/logout/+server.ts`

- Deletes session
- Clears cookie

### `/api/auth/google/+server.ts`

- Initiates OAuth flow
- Redirects to Google

### `/api/auth/google/callback/+server.ts`

- Exchanges code for tokens
- Fetches user info
- Creates/finds user
- Creates session

---

## Security Features

- Passwords hashed with bcrypt (10 rounds)
- Session-based authentication
- HttpOnly secure cookies
- CSRF protection for OAuth
- Email validation
- Rate limiting (should be added)
- SQL injection protection (Prisma ORM)

## UX Features

- Return URL preservation
- Loading states
- Error messages
- OAuth as alternative
- Remember me (could be added)
- Email verification (could be added)

## Notes

- No email verification currently
- No password reset flow yet
- No 2FA
- OAuth only supports Google currently
- Sessions expire after 30 days
- Role field for future admin system
