# Billing API

All billing endpoints require JWT authentication.

---

## Endpoint Overview

| Endpoint | Returns | Use Case |
|----------|---------|----------|
| `GET /v1/billing` | Current month usage (no $) | Capacity indicators, usage stats |
| `GET /v1/billing/preview` | Current month invoice ($) | Billing dashboard, current charges |
| `GET /v1/billing/:year/:month` | Past month usage (no $) | Historical usage analytics |
| `GET /v1/billing/:year/:month/invoice` | Past month invoice ($) | Invoice history, past charges |

**Most common endpoints:**
- `/v1/billing/preview` → Main billing dashboard
- `/v1/billing/:year/:month/invoice` → Invoice history

---

## GET /v1/billing

Get current month usage summary (without prices).

### When to Use

- Show capacity usage: "Using 2 of 5 role slots"
- Display usage stats without exposing pricing
- Lightweight response when prices aren't needed

### UI Example

```
┌─────────────────────────────────────┐
│  Your Plan                          │
│  ───────────────────────────────    │
│  Active Roles: 2 of 5               │
│  ▓▓▓▓▓▓▓▓░░░░░░░░░░░░               │
└─────────────────────────────────────┘
```

### Response

```json
{
  "period": {
    "start": "2026-01-01T00:00:00.000Z",
    "end": "2026-02-01T00:00:00.000Z",
    "totalDays": 31
  },
  "jobs": [
    {
      "jobId": "abc123xyz",
      "activeWindows": [
        { "from": "2026-01-10T14:30:00Z", "to": null }
      ],
      "activeDays": 21.5,
      "activeFraction": 0.6935,
      "isStillActive": true
    }
  ],
  "summary": {
    "totalActiveJobDays": 21.5,
    "billingWaived": false,
    "billingWaivedReason": null
  }
}
```

### Response Fields

| Field | Description |
|-------|-------------|
| `activeWindows` | Array of active periods. Each has `from` (start) and `to` (end, `null` if still active) |
| `activeDays` | Number of days the job was/will be active in this period |
| `activeFraction` | Fraction of the billing period (activeDays / totalDays) |
| `isStillActive` | Whether the job is currently active |

### Pause/Resume Example

When a job is paused and resumed, `activeWindows` shows each active period:

```json
{
  "jobs": [
    {
      "jobId": "abc123xyz",
      "activeWindows": [
        { "from": "2026-01-05T10:00:00Z", "to": "2026-01-08T15:00:00Z" },
        { "from": "2026-01-10T09:00:00Z", "to": "2026-01-12T18:00:00Z" },
        { "from": "2026-01-15T08:00:00Z", "to": null }
      ],
      "activeDays": 8.5,
      "activeFraction": 0.2742,
      "isStillActive": true
    }
  ]
}
```

This shows the job was:
- Active Jan 5-8 (paused)
- Resumed Jan 10-12 (paused again)
- Resumed Jan 15 (still active)

Total billed time excludes paused periods.

---

## GET /v1/billing/preview

Preview current month charges up to now (with prices).

### When to Use

- Main billing dashboard showing current charges
- "You'll be charged approximately $X this month"
- Real-time billing preview

### UI Example

```
┌─────────────────────────────────────────────────┐
│  January 2026 (In Progress)                     │
├─────────────────────────────────────────────────┤
│  Active Roles                                   │
│  ┌───────────────────────────────────────────┐  │
│  │ Senior Software Engineer                  │  │
│  │ Active since Jan 8 · 23.72 days          │  │
│  │                                  $153.02  │  │
│  └───────────────────────────────────────────┘  │
│                                                 │
│  Subtotal                            $153.02   │
│  ─────────────────────────────────────────────  │
│  Estimated Total                     $153.02   │
│                                                 │
│  * Final amount calculated at month end        │
└─────────────────────────────────────────────────┘
```

### Response

```json
{
  "isPreview": true,
  "period": {
    "start": "2026-01-01T00:00:00.000Z",
    "end": "2026-01-08T15:30:00.000Z"
  },
  "lineItems": [
    {
      "jobId": "abc123xyz",
      "jobTitle": "Senior Software Engineer",
      "activeWindows": [
        { "from": "2026-01-05T10:00:00Z", "to": "2026-01-08T15:30:00Z" }
      ],
      "activeDays": 3.23,
      "unitPriceCents": 20000,
      "amountCents": 2084
    }
  ],
  "subtotalCents": 2084,
  "discountCents": 0,
  "discountReason": null,
  "totalCents": 2084,
  "currency": "usd",
  "formatted": {
    "subtotal": "$20.84",
    "discount": "$0.00",
    "total": "$20.84"
  }
}
```

---

## GET /v1/billing/:year/:month

Get usage for a specific month (without prices).

### When to Use

- Historical usage analytics
- Show past activity without exposing pricing
- Admin reporting on role activity

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| year | number | Year (2020-2100) |
| month | number | Month (1-12) |

### Example

```
GET /v1/billing/2025/12
```

### Response

Same format as `GET /v1/billing`.

---

## GET /v1/billing/:year/:month/invoice

Get invoice for a specific month (with prices).

### When to Use

- Invoice history page
- Show past billing details
- Download/export past invoices

### UI Example

```
┌──────────────────────────────────────────────────────┐
│  Billing History                                     │
├──────────────────────────────────────────────────────┤
│  January 2026          In Progress        [View →]   │
│  December 2025         $234.71   PAID     [View →]   │
│  November 2025         $180.00   PAID     [View →]   │
│  October 2025          $200.00   PAID     [View →]   │
└──────────────────────────────────────────────────────┘
```

Clicking "View" on December 2025:

```
┌─────────────────────────────────────────────────┐
│  December 2025                          PAID ✓  │
├─────────────────────────────────────────────────┤
│  Senior Software Engineer                       │
│  Dec 1 - Dec 15 · 14.75 days           $95.16  │
│                                                 │
│  Product Manager                                │
│  Dec 10 - Dec 31 · 21.63 days         $139.55  │
│                                                 │
│  ─────────────────────────────────────────────  │
│  Total                                $234.71   │
└─────────────────────────────────────────────────┘
```

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| year | number | Year (2020-2100) |
| month | number | Month (1-12) |

### Example

```
GET /v1/billing/2025/12/invoice
```

### Response

```json
{
  "isPreview": false,
  "period": {
    "start": "2025-12-01T00:00:00.000Z",
    "end": "2026-01-01T00:00:00.000Z"
  },
  "lineItems": [
    {
      "jobId": "abc123xyz",
      "jobTitle": "Senior Software Engineer",
      "activeWindows": [
        { "from": "2025-12-01T00:00:00Z", "to": "2025-12-15T18:00:00Z" }
      ],
      "activeDays": 14.75,
      "unitPriceCents": 20000,
      "amountCents": 9516
    },
    {
      "jobId": "def456uvw",
      "jobTitle": "Product Manager",
      "activeWindows": [
        { "from": "2025-12-10T09:00:00Z", "to": "2026-01-01T00:00:00Z" }
      ],
      "activeDays": 21.63,
      "unitPriceCents": 20000,
      "amountCents": 13955
    }
  ],
  "subtotalCents": 23471,
  "discountCents": 0,
  "discountReason": null,
  "totalCents": 23471,
  "currency": "usd",
  "formatted": {
    "subtotal": "$234.71",
    "discount": "$0.00",
    "total": "$234.71"
  }
}
```

---

## Founding Access (Billing Waived)

For organizations with billing waived, the invoice shows full price with 100% discount:

### UI Example

```
┌─────────────────────────────────────────────────┐
│  January 2026                    FOUNDING ACCESS │
├─────────────────────────────────────────────────┤
│  Senior Software Engineer                       │
│  Active since Jan 8 · 23.72 days       $153.02  │
│                                                 │
│  Subtotal                              $153.02  │
│  Founding Access Discount             -$153.02  │
│  ─────────────────────────────────────────────  │
│  Total                                  $0.00   │
└─────────────────────────────────────────────────┘
```

### Response

```json
{
  "isPreview": false,
  "period": { "..." : "..." },
  "lineItems": [ "..." ],
  "subtotalCents": 23471,
  "discountCents": -23471,
  "discountReason": "Founding Access",
  "totalCents": 0,
  "currency": "usd",
  "formatted": {
    "subtotal": "$234.71",
    "discount": "-$234.71",
    "total": "$0.00"
  }
}
```

---

## Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `INVALID_YEAR` | 400 | Year must be 2020-2100 |
| `INVALID_MONTH` | 400 | Month must be 1-12 |
| `FUTURE_PERIOD` | 400 | Cannot generate invoice for future periods |

---

## Pricing

| Item | Price |
|------|-------|
| Active role (per month) | $200.00 |

Billing is prorated by milliseconds for precision. If a job is active for 15 days in a 31-day month:

```
$200 × (15 / 31) = $96.77
```

### Versioned Pricing

Prices are versioned with effective dates. When generating an invoice:
- The system uses the price that was active at the start of the billing period
- Historical invoices always use the rate that was in effect at that time
- Future price changes can be scheduled in advance

For example:
- Rate $200/month effective from 2026-01-01
- Rate $250/month effective from 2026-03-01
- January/February invoices: calculated at $200/month
- March onwards: calculated at $250/month
