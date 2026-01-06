# ADR-001: API Versioning via URL Path

## Status

Accepted

## Date

2024-12-18

## Context

Zehire is building a public API for a hiring platform. The API will evolve over time, and breaking changes are inevitable. We need a versioning strategy that:

- Allows breaking changes without disrupting existing clients
- Is explicit and discoverable
- Works well with edge caching and CDNs
- Is simple to implement and maintain

### Options Considered

**1. URL Path Versioning (`/v1/jobs`)**

- Version in URL path
- Most explicit approach
- Industry standard (Stripe, GitHub, Twilio)

**2. Header Versioning (`Accept: application/vnd.zehire.v1+json`)**

- Version in Accept header
- Cleaner URLs
- Harder to test and debug

**3. Query Parameter Versioning (`/jobs?version=1`)**

- Version as query param
- Easy to add retroactively
- Caching complications
- Feels like an afterthought

**4. No Versioning**

- Single evolving API
- Requires perfect backward compatibility
- Not realistic for a growing product

## Decision

Use **URL path versioning** with the format `/{version}/{resource}`.

```
GET /v1/jobs
POST /v1/jobs
GET /v2/jobs
```

## Rationale

**Explicitness** — Every request clearly states which version it expects. No ambiguity.

**Cacheability** — Edge caches (Cloudflare, CDNs) can cache `/v1/jobs` and `/v2/jobs` independently without inspecting headers.

**Debuggability** — Logs, error reports, and traces show the exact version. No need to correlate with headers.

**Industry standard** — Developers expect path-based versioning. Lower cognitive load.

**Routing simplicity** — Hono can route `/v1/*` and `/v2/*` to different handlers trivially.

## Consequences

### Positive

- Clear API contracts per version
- Multiple versions can coexist in production
- Clients explicitly opt into version upgrades
- Easy to deprecate and sunset old versions
- Cache-friendly by default

### Negative

- URLs are slightly longer
- Version must be included in every request
- Old versions must be maintained until sunset

### Neutral

- Requires discipline to avoid breaking changes within a version
- Documentation must be version-aware

## Compliance

All public endpoints must:

1. Include version prefix (`/v1/`, `/v2/`)
2. Follow semantic versioning for major changes
3. Document breaking changes in changelog
4. Announce deprecation 6 months before removal

Internal endpoints (`/internal/*`) are exempt from versioning.
