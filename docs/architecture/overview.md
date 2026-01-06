# Architecture Overview

Zehire backend is an edge-first API built on Cloudflare Workers.

## Why Cloudflare Workers

**Global edge deployment** — Code runs in 300+ locations worldwide. Requests are handled at the nearest edge node, minimizing latency for a globally distributed user base.

**No cold starts** — Workers use V8 isolates, not containers. Startup time is measured in milliseconds, not seconds.

**Predictable costs** — Pay-per-request pricing with generous free tier. No idle compute costs. Scales to zero automatically.

**Integrated ecosystem** — Native access to D1 (SQL), KV (key-value), R2 (object storage), and Queues when needed, all within the same platform.

## Why Hono

**Edge-native** — Hono is designed for edge runtimes. Zero Node.js dependencies. Works identically in Workers, Deno, and Bun.

**Minimal footprint** — Core framework is ~14KB. Fast cold starts, low memory usage.

**Familiar API** — Express-like routing with modern TypeScript support. Low learning curve for most backend developers.

**No magic** — Explicit routing, explicit middleware. Easy to understand, easy to debug.

## Design Principles

### Edge-First

Every architectural decision assumes code runs at the edge:

- No long-lived connections
- No filesystem access
- No Node.js APIs
- Request-scoped state only

### Cost-Aware

Infrastructure is chosen based on actual requirements, not anticipated scale:

- Start with Workers Free tier
- Add D1/KV/R2 only when persistence is needed
- Avoid Durable Objects unless strong consistency is required
- Monitor costs as a first-class metric

### Simplicity Over Abstraction

Avoid premature patterns:

- No "service layer" until there are services to share
- No dependency injection until there are dependencies to inject
- No ORM until query complexity justifies it

Code should be obvious to read, even if slightly repetitive.

### Contract-First

APIs are contracts:

- Public APIs are versioned and stable
- Breaking changes require new versions
- Internal APIs are flexible and unversioned
- Documentation is mandatory, not optional

## Component Overview

```
┌─────────────────────────────────────────────┐
│              Cloudflare Edge                │
│  ┌───────────────────────────────────────┐  │
│  │          Cloudflare Worker            │  │
│  │  ┌─────────────────────────────────┐  │  │
│  │  │           Hono App              │  │  │
│  │  │  ┌───────────┐ ┌─────────────┐  │  │  │
│  │  │  │  /v1/*    │ │ /internal/* │  │  │  │
│  │  │  └───────────┘ └─────────────┘  │  │  │
│  │  └─────────────────────────────────┘  │  │
│  └───────────────────────────────────────┘  │
│                     │                       │
│    ┌────────────────┼────────────────┐      │
│    ▼                ▼                ▼      │
│  ┌────┐         ┌─────┐          ┌─────┐   │
│  │ D1 │         │ KV  │          │ R2  │   │
│  │(future)      │(future)        │(future) │
│  └────┘         └─────┘          └─────┘   │
└─────────────────────────────────────────────┘
```

## Current State

The backend currently implements:

- `GET /v1/` — API root
- `GET /internal/health` — Health check
- `POST /v1/jobs` — Create job (documented, implementation pending)

No database or external services are connected. All responses are stateless.
