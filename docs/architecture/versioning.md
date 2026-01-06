# API Versioning

Zehire uses URL path-based versioning for all public APIs.

## Format

```
/{version}/{resource}
```

Examples:

```
GET  /v1/jobs
POST /v1/jobs
GET  /v2/jobs
```

## Why Path-Based Versioning

**Explicit** — The version is visible in every request. No hidden headers or query parameters.

**Cacheable** — CDNs and edge caches can differentiate versions without inspecting headers.

**Debuggable** — Logs, traces, and error reports show the exact version used.

**Routable** — Traffic can be split by version at the edge without application logic.

## When to Create a New Version

Create a new version (`/v2`) when making **breaking changes**:

- Removing a field from a response
- Renaming a field
- Changing a field's type
- Removing an endpoint
- Changing authentication requirements
- Changing error response structure

## What Can Change Within a Version

The following changes are **non-breaking** and allowed within the same version:

- Adding new optional fields to request bodies
- Adding new fields to response bodies
- Adding new endpoints
- Adding new error codes (clients should handle unknown codes gracefully)
- Performance improvements
- Bug fixes

## Version Lifecycle

```
┌──────────┐     ┌──────────┐     ┌────────────┐     ┌──────────┐
│  Active  │ ──▶ │Deprecated│ ──▶ │ Sunset     │ ──▶ │ Removed  │
└──────────┘     └──────────┘     └────────────┘     └──────────┘
```

### Active

- Fully supported
- Receives bug fixes and non-breaking improvements
- Recommended for new integrations

### Deprecated

- Still functional
- No new features
- Clients should migrate to newer version
- Deprecation announced via changelog and response headers

### Sunset

- Returns warnings in responses
- May have degraded functionality
- Hard deadline for removal announced

### Removed

- Returns `410 Gone`
- No longer available

## Deprecation Notice

When a version is deprecated, responses include:

```
Deprecation: true
Sunset: Sat, 01 Jan 2025 00:00:00 GMT
Link: </v2/jobs>; rel="successor-version"
```

## Internal APIs

Internal endpoints (`/internal/*`) are **not versioned**:

- Used only by Zehire infrastructure
- No external consumers
- Can change without notice
- Breaking changes are coordinated internally

## Multiple Versions in Production

Multiple versions can run simultaneously:

```
/v1/jobs  →  v1 handler (deprecated)
/v2/jobs  →  v2 handler (active)
```

Both share the same Worker deployment. Version routing happens in application code.

## Client Expectations

Clients must:

- Always include version in requests
- Handle unknown response fields gracefully (forward compatibility)
- Monitor deprecation headers
- Plan migrations when deprecation is announced
