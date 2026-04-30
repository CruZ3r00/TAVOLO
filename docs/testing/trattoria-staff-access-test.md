# Trattoria Staff Access Test

Date: 2026-04-30

## Setup

Owner account tested:

- Username: `Trattoria al grande`
- User id: `1`
- Subscription status at test time: `active`

Staff accounts created/updated in `public.up_users`:

- `TrattoriaAlGrande.cameriere`
- `TrattoriaAlGrande.cucina`

Staff links created/updated in `public.restaurant_staff`:

| owner_id | user_id | role | active |
| --- | ---: | --- | --- |
| 1 | 46 | cameriere | true |
| 1 | 47 | cucina | true |

## Database Checks

- Owner subscription resolves as valid: `true`
- Cameriere password hash check: `true`
- Cucina password hash check: `true`
- Cameriere confirmed: `true`
- Cucina confirmed: `true`
- Cameriere blocked: `false`
- Cucina blocked: `false`
- Cameriere maps to owner `Trattoria al grande`
- Cucina maps to owner `Trattoria al grande`

## Subscription Inheritance Check

The test temporarily changed the owner subscription status to `canceled` inside a database transaction, checked the staff subscription resolution, then rolled the transaction back.

Result:

- Simulated owner status: `canceled`
- Staff subscription valid while owner is canceled: `false`
- Rollback completed: `true`

## Local API Note

Direct HTTP tests against local Strapi were attempted, but the sandboxed local process could not remain available for API requests:

- background `strapi develop` failed with `EPERM` on Strapi config/process spawn;
- the database-level checks above verify the same owner/staff/subscription relationships used by `resolveStaffContext`.

## Verification Commands

- Backend syntax check for `staff-access.js`: passed
- Backend test file direct run, `node tests\utils.test.js`: passed, 4 tests
- `npm test` later hit a Windows `spawn EPERM` in the Node test runner; the same test file passes when run directly
- Frontend production build: passed
