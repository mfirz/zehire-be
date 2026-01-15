# Authentication

Zehire API uses JWT (JSON Web Token) based authentication via magic link email login.

## Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                      Authentication Flow                            │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  1. POST /auth/login          2. Email received                     │
│     { email }                    [Click magic link]                 │
│         │                              │                            │
│         ▼                              ▼                            │
│  ┌─────────────┐              ┌─────────────────┐                   │
│  │ Send magic  │              │ GET /auth/callback                  │
│  │ link email  │              │ ?token=xxx                          │
│  └─────────────┘              └─────────────────┘                   │
│                                        │                            │
│                                        ▼                            │
│                               ┌─────────────────┐                   │
│                               │ Returns JWT in  │                   │
│                               │ Set-Cookie      │                   │
│                               │ (24h expiry)    │                   │
│                               └─────────────────┘                   │
│                                        │                            │
│                                        ▼                            │
│                               ┌─────────────────┐                   │
│  3. API Requests              │ Use JWT for API │                   │
│     Authorization:            │ requests        │                   │
│     Bearer <jwt>              └─────────────────┘                   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

## JWT Format

All JWTs are signed using HMAC-SHA256 (`HS256`).

### Header

```json
{
  "alg": "HS256",
  "typ": "JWT"
}
```

### Payload (Claims)

```json
{
  "sub": "user_abc123",
  "iss": "zehire",
  "aud": "zehire-api",
  "org_id": "org_xyz789",
  "email": "user@example.com",
  "role": "recruiter",
  "iat": 1705312200,
  "exp": 1705398600
}
```

| Claim    | Type   | Description                      |
| -------- | ------ | -------------------------------- |
| `sub`    | string | Subject - User ID                |
| `iss`    | string | Issuer - Always `zehire`         |
| `aud`    | string | Audience - Always `zehire-api`   |
| `org_id` | string | Organization ID (multi-tenancy)  |
| `email`  | string | User's email address             |
| `role`   | string | User role (`admin`, `recruiter`) |
| `iat`    | number | Issued At (Unix timestamp)       |
| `exp`    | number | Expiration (Unix timestamp)      |

### JWT Lifecycle

- **Token TTL**: 24 hours (default, configurable)
- **Refresh Tokens**: Not implemented (out of scope for v1)
- **Revocation**: Logout clears the cookie; tokens remain valid until expiry

## Using the Authorization Header

Protected endpoints require the JWT in the `Authorization` header:

```
Authorization: Bearer <jwt>
```

### Example Request

```bash
curl https://api.zehire.com/v1/jobs \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyX2FiYzEyMyIsImlzcyI6InplaGlyZSIsImF1ZCI6InplaGlyZS1hcGkiLCJlbWFpbCI6InVzZXJAZXhhbXBsZS5jb20iLCJyb2xlIjoicmVjcnVpdGVyIiwiaWF0IjoxNzA1MzEyMjAwLCJleHAiOjE3MDUzOTg2MDB9.signature" \
  -H "Content-Type: application/json" \
  -d '{"title": "Software Engineer"}'
```

## Authentication Endpoints

### POST /auth/login

Initiate magic link authentication. Sends an email with a one-time login link.

**Public endpoint** - No authentication required.

#### Request

```bash
curl -X POST https://api.zehire.com/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "user@example.com"}'
```

#### Response

```
204 No Content
```

Email is sent asynchronously. Response is immediate regardless of whether email exists.

#### Errors

| Status | Code                   | Description                     |
| ------ | ---------------------- | ------------------------------- |
| 400    | `INVALID_EMAIL`        | Email format invalid            |
| 404    | `EMAIL_NOT_REGISTERED` | Email is not registered in system |

---

### GET /auth/callback

Complete authentication using the magic link token. Returns JWT in a cookie.

**Public endpoint** - No authentication required.

#### Request

```bash
curl "https://api.zehire.com/auth/callback?token=abc123..."
```

#### Response

```json
{
  "user": {
    "id": "user_abc123",
    "email": "user@example.com",
    "role": "recruiter"
  }
}
```

Headers:

```
Set-Cookie: zehire_session=<jwt>; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=86400
```

Note: `SameSite=Lax` allows magic link navigation from email clients while still providing CSRF protection.

#### Errors

| Status | Code                 | Description                |
| ------ | -------------------- | -------------------------- |
| 400    | `INVALID_TOKEN`      | Token is malformed         |
| 410    | `TOKEN_EXPIRED`      | Token has expired (15 min) |
| 400    | `TOKEN_ALREADY_USED` | Token was already used     |

---

### POST /auth/logout

Clear the session cookie.

**Public endpoint** - No authentication required.

#### Request

```bash
curl -X POST https://api.zehire.com/auth/logout
```

#### Response

```
204 No Content
```

Headers:

```
Set-Cookie: zehire_session=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0
```

---

### GET /auth/me

Get the current authenticated user.

**Semi-protected** - Returns user info if authenticated, 401 otherwise.

#### Request

```bash
curl https://api.zehire.com/auth/me \
  -H "Cookie: zehire_session=<jwt>"
```

#### Response (Authenticated)

```json
{
  "user": {
    "id": "user_abc123",
    "email": "user@example.com",
    "role": "recruiter",
    "orgId": "org_xyz789"
  }
}
```

#### Response (Not Authenticated)

```json
{
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Not authenticated"
  }
}
```

## Error Responses

All authentication errors follow a consistent format:

```json
{
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Human-readable description"
  }
}
```

### Error Codes

| HTTP | Code                   | Description                            |
| ---- | ---------------------- | -------------------------------------- |
| 400  | `INVALID_EMAIL`        | Email format is invalid                |
| 400  | `INVALID_TOKEN`        | Magic link token is malformed          |
| 404  | `EMAIL_NOT_REGISTERED` | Email is not registered in system      |
| 410  | `TOKEN_EXPIRED`        | Magic link expired (15 min TTL)        |
| 400  | `TOKEN_ALREADY_USED`   | Magic link was already used            |
| 401  | `UNAUTHORIZED`         | Missing, invalid, or expired JWT       |
| 403  | `FORBIDDEN`            | Valid JWT but insufficient permissions |

## Protected vs Public Endpoints

| Endpoint               | Auth Required | Description      |
| ---------------------- | ------------- | ---------------- |
| `POST /auth/login`     | No            | Initiate login   |
| `GET /auth/callback`   | No            | Complete login   |
| `POST /auth/logout`    | No            | Clear session    |
| `GET /auth/me`         | Semi          | Get current user |
| `GET /internal/health` | No            | Health check     |
| `GET /v1/`             | No            | API root         |
| `POST /v1/jobs`        | **Yes**       | Create job       |
| `GET /v1/jobs/:id`     | **Yes**       | Get job status   |

## Security Considerations

### JWT Security

- **Signature**: HMAC-SHA256 with server-side secret
- **Timing-safe comparison**: Prevents timing attacks on signature verification
- **Short-lived tokens**: 24-hour expiry limits exposure window

### Cookie Security

- **HttpOnly**: Prevents JavaScript access (XSS protection)
- **Secure**: HTTPS only (in production)
- **SameSite=Lax**: CSRF protection while allowing magic link navigation from email clients

### Magic Link Security

- **Single-use tokens**: Invalidated after first use
- **Short TTL**: 15-minute expiry
- **Hashed storage**: SHA-256 hash stored, never plaintext

## Client Integration

### Web Application (Cookie-based)

For web apps, the JWT is automatically stored in an HttpOnly cookie:

```javascript
// Login
await fetch("/auth/login", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: "user@example.com" }),
});

// After clicking magic link, cookie is set automatically

// API calls include cookie automatically
const response = await fetch("/v1/jobs", {
  method: "POST",
  credentials: "include", // Important!
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ title: "Engineer" }),
});
```

### API Client (Header-based)

For API clients, extract the JWT and use the Authorization header:

```javascript
// Get JWT from callback response
const callbackResponse = await fetch("/auth/callback?token=xxx");
const setCookie = callbackResponse.headers.get("Set-Cookie");
const jwt = extractJwtFromCookie(setCookie);

// Use JWT in Authorization header
const response = await fetch("/v1/jobs", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${jwt}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ title: "Engineer" }),
});
```

## Troubleshooting

### "Missing or invalid Authorization header"

- Ensure header format is exactly: `Authorization: Bearer <jwt>`
- Check for extra spaces or missing "Bearer" prefix
- Verify the JWT is not empty

### "Invalid or expired JWT"

- JWT may have expired (24-hour TTL)
- JWT signature may be invalid
- JWT may have incorrect `iss` or `aud` claims

### "TOKEN_EXPIRED" on magic link

- Magic links expire after 15 minutes
- Request a new magic link via `/auth/login`

### "TOKEN_ALREADY_USED" on magic link

- Each magic link can only be used once
- Request a new magic link via `/auth/login`
