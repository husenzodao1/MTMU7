# School Platform

Government-grade multi-school education platform built with Next.js, Supabase, TypeScript, and next-intl.

## Local development

```bash
npm ci
npm run dev
```

Copy `.env.example` to a local environment file and provide local values without committing them.

## Verification

```bash
npm run lint
npm run typecheck
npm run test:unit
npm run test:db
npm run db:types -- --check
node scripts/i18n/check-messages.mts
node scripts/i18n/check-usage.mts
npm run security:secrets
npm run build
```

Read `docs/operations/DEPLOYMENT.md` before deploying. Production readiness requires live Supabase/Auth/Storage/Realtime smoke tests and owner approval of official identity content.
