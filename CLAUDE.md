# Claude Code Project Context

This file is automatically read by Claude Code at the start of each session.

## Project Overview

Zehire is a hiring platform backend built on Cloudflare Workers with:
- **Hono** - Web framework
- **D1** - SQLite database
- **Drizzle ORM** - Type-safe database queries
- **R2** - Object storage (CVs)
- **Queues** - Background job processing

## D1 Database Optimization Guidelines

When writing D1 queries, follow these best practices to minimize costs and latency:

### 1. Batch Requests
```typescript
// Bad: Sequential queries (200ms+ each)
await db.insert(table1).values(data1);
await db.insert(table2).values(data2);

// Good: Batch operations
await db.batch([
  db.insert(table1).values(data1),
  db.insert(table2).values(data2),
]);
```

### 2. Exclude IDs from Updates
```typescript
// Bad: ID in SET triggers FK checks
await db.update(users).set({ id, name, email }).where(eq(users.id, id));

// Good: Exclude ID from SET
await db.update(users).set({ name, email }).where(eq(users.id, id));
```

### 3. Avoid COUNT(*) for Pagination
```typescript
// Bad: Full table scan
const total = await db.select({ count: count() }).from(table);

// Good: Cursor-based pagination, skip total counts
const items = await db.select().from(table)
  .where(gt(table.id, cursor))
  .limit(limit + 1); // +1 to detect hasMore
```

### 4. Split Complex Joins
```typescript
// Bad: Multiple LEFT JOINs cause Cartesian explosion
const result = await db.select()
  .from(jobs)
  .leftJoin(applications, ...)
  .leftJoin(answers, ...);

// Good: Separate queries + app-level transformation
const jobs = await db.select().from(jobs).where(...);
const applications = await db.select().from(applications).where(...);
// Transform in application code
```

### 5. Bulk Inserts (Max 100 Parameters)
```typescript
// Bad: Individual inserts
for (const item of items) {
  await db.insert(table).values(item);
}

// Good: Chunked bulk insert
const CHUNK_SIZE = 100;
for (let i = 0; i < items.length; i += CHUNK_SIZE) {
  const chunk = items.slice(i, i + CHUNK_SIZE);
  await db.insert(table).values(chunk);
}
```

### 6. Use Indexed Lookups
```typescript
// Good: Fast indexed query for cache validation
async isSlugPublished(slug: string): Promise<boolean> {
  const result = await this.db
    .select({ id: jobs.id })  // Minimal columns
    .from(jobs)
    .where(and(
      eq(jobs.publicSlug, slug),  // Indexed
      eq(jobs.status, "published") // Indexed
    ))
    .get();  // Single row
  return result !== undefined;
}
```

### Cost Reference
- D1 Reads: $0.001 per 1M rows read
- D1 Writes: $1.00 per 1M rows written
- 100M requests with 1 row each = $0.10

## Caching Strategy

### Public Job Cache (D1 Validation)
- Cache job data with Workers Cache API
- On cache hit, validate job status via fast D1 indexed query
- This ensures paused/closed jobs return 404 across all PoPs
- Cost: ~$0.10 per 100M requests (negligible)

### Jobs List Cache (Version-Based)
- Cache key includes `jobsListVersion` from database
- On data change, increment version → automatic cache invalidation
- Works globally because version is stored in D1 (replicated)
