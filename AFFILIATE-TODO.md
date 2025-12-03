# Simplified Affiliate System TODO

## Overview

User enables Affiliate mode in profile. System generates code using INITIALS + running number. Code shared manually. Commissions tracked for every order using the code.

---

## Phase 1: Database Schema

- [ ] Add `isAffiliateEnabled` boolean field to User model (default: false)
- [ ] Run migration to add the field
- [ ] Verify existing AffiliateProgram table supports the flow (has: userId, affiliateCode, commissionRate, totalReferrals, totalSales, totalCommission)

## Phase 2: Code Generation Logic

- [ ] Create `src/lib/services/affiliate.ts`
- [ ] Implement function to extract initials from user's fullName
- [ ] Implement function to get next running number by checking existing codes
- [ ] Implement function to generate code: `INITIALS + NUMBER` (e.g., "JD001", "JD002")
- [ ] Implement function to create AffiliateProgram record when user enables affiliate mode

## Phase 3: Profile Toggle UI

- [ ] Add "Become an Affiliate" section to user dashboard/profile
- [ ] Add toggle/button to enable affiliate mode
- [ ] Show generated affiliate code after enabling
- [ ] Add copy-to-clipboard functionality for affiliate code
- [ ] Add shareable referral link: `https://fastaccs.vercel.app/?ref=CODE`

## Phase 4: Affiliate Dashboard

- [ ] Create simple affiliate stats section in user dashboard
- [ ] Display: Affiliate Code, Total Referrals, Total Sales, Total Commission
- [ ] Query from AffiliateProgram table
- [ ] Show "Enable Affiliate Mode" if not yet enabled

## Phase 5: Order Tracking with Affiliate Codes

- [ ] Update checkout to accept `?ref=CODE` URL parameter
- [ ] Validate affiliate code exists in AffiliateProgram table
- [ ] Store validated code in Order.affiliateCode field
- [ ] Store affiliate's userId in Order.affiliateUserId field
- [ ] Display "Referred by: CODE" in checkout if valid code used

## Phase 6: Commission Calculation

- [ ] Update order completion logic in `src/lib/services/fulfillment.ts`
- [ ] When order completes, check if Order.affiliateCode exists
- [ ] Calculate commission: `orderTotal * commissionRate / 100`
- [ ] Update AffiliateProgram: increment totalReferrals, add to totalSales, add to totalCommission
- [ ] Commission stored but not auto-paid (manual sharing approach)

## Phase 7: Testing

- [ ] Test enabling affiliate mode with different name formats
- [ ] Test code generation handles duplicates correctly
- [ ] Test URL parameter extraction and validation
- [ ] Test commission calculation accuracy
- [ ] Test stats update correctly after order completion

---

## API Endpoints Needed

### Enable Affiliate Mode

```
POST /api/affiliate/enable
Body: { userId }
Returns: { affiliateCode, referralLink }
```

### Get Affiliate Stats

```
GET /api/affiliate/stats
Query: ?userId=xxx
Returns: { code, totalReferrals, totalSales, totalCommission }
```

### Validate Affiliate Code (used during checkout)

```
GET /api/affiliate/validate
Query: ?code=xxx
Returns: { valid: boolean, userId?: string }
```

---

## Database Fields Summary

### User Table

- `isAffiliateEnabled: Boolean` (NEW - to be added)

### AffiliateProgram Table (existing)

- `userId: String`
- `affiliateCode: String` (unique)
- `commissionRate: Decimal`
- `totalReferrals: Int`
- `totalSales: Decimal`
- `totalCommission: Decimal`
- `status: String`

### Order Table (existing)

- `affiliateCode: String?`
- `affiliateUserId: String?`

---

## Code Generation Example

User: John Doe

- Extract initials: "JD"
- Check existing codes: JD001, JD002 exist
- Generate: "JD003"

User: Alice

- Extract initials: "A"
- No existing codes
- Generate: "A001"

---

## Commission Logic Example

Order Total: ₦50,000
Commission Rate: 10%
Commission: ₦5,000

AffiliateProgram updates:

- totalReferrals: +1
- totalSales: +50000
- totalCommission: +5000
