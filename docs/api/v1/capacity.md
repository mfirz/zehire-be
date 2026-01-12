# Capacity API

Get organization capacity status for various resources.

All capacity endpoints require JWT authentication.

---

## GET /v1/capacity

Get capacity status for the authenticated organization.

### Authentication

**Required**: JWT via `Authorization: Bearer <jwt>` or session cookie

### Response

#### 200 OK

```json
{
  "jobs": {
    "activeRoles": 2,
    "capacity": 3,
    "isOverCapacity": false,
    "canActivate": true
  }
}
```

### Response Fields

#### `jobs` - Active Roles Capacity

| Field | Type | Description |
|-------|------|-------------|
| `activeRoles` | number | Current count of published + paused jobs |
| `capacity` | number | Maximum allowed active roles for the organization |
| `isOverCapacity` | boolean | True if activeRoles > capacity (soft warning, no enforcement) |
| `canActivate` | boolean | True if a new role can be published (activeRoles < capacity) |

### Understanding Capacity

**Active roles** include both `published` and `paused` jobs. This is because Zehire is "on the hook" for evaluative work in both states - candidates can still be in the pipeline even when a job is paused.

**Capacity enforcement:**
- Publishing a job when at capacity returns `CAPACITY_EXCEEDED` error
- Resuming a paused job does NOT count against capacity (it was already active)
- Closing a job frees up capacity

**Example scenarios:**

| Scenario | activeRoles | capacity | canActivate |
|----------|-------------|----------|-------------|
| New org, no jobs | 0 | 3 | true |
| One published job | 1 | 3 | true |
| At capacity | 3 | 3 | false |
| Over capacity (legacy) | 4 | 3 | false |

### Future Expansion

This endpoint is designed to support additional capacity types in the future:

```json
{
  "jobs": { ... },
  "users": { ... },
  "candidates": { ... }
}
```

---

## Related Endpoints

- [GET /v1/jobs](./jobs.md#get-v1jobs) - List jobs (no longer includes capacity)
- [POST /v1/jobs/:id/publish](./jobs.md#post-v1jobsidpublish) - Publish job (checks capacity)
