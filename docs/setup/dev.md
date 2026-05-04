# Dev Environment

Run `npm run db:seed` to populate demo org with patients.

## Mock Data

`scripts/generate-patients.ts` creates realistic patient records.

## Debug Mode

Set `DEBUG=api:*` to log all requests and tenant context.

## E2E Testing

`BYPASS_AUTH=true` skips auth in development only.
