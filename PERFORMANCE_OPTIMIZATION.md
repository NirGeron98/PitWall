# Performance Optimization: Races List Endpoint

## Problem Diagnosis

The `/api/races` endpoint was experiencing slow response times, especially on the first request. After analysis, the bottleneck was identified in the following areas:

1. **Database Query Performance**: While indexes existed on `year` and `round` separately, a composite index was missing for the common query pattern (filter by year, order by round).

2. **Cache Write Overhead**: The cache write operation on cache miss could be optimized.

3. **Lack of Detailed Timing**: No visibility into which operations were slow.

4. **Payload Compatibility**: Missing `EventDate` field that frontend expects.

## Optimizations Implemented

### 1. Database Index Optimization (`server/app/models.py`)
- **Added composite index** `idx_races_year_round` on `(year, round)` columns
- This dramatically speeds up queries that filter by year and order by round
- The index is automatically used by SQLAlchemy for the query pattern in `cache_races_snapshot()`

### 2. Enhanced Performance Logging (`server/app/services/f1_service.py`)
- Added detailed timing logs in `cache_races_snapshot()`:
  - Query time (DB read)
  - Build time (payload construction)
  - Cache write time (DB write)
  - Total time
- This provides visibility into which operation is slow

### 3. Optimized Cache Function (`server/app/services/f1_service.py`)
- Improved timing granularity in `cache_races_snapshot()`
- Added `EventDate` field to payload for frontend compatibility
- Ensured cache is written even for empty results to avoid repeated DB queries

### 4. Enhanced Endpoint Logging (`server/app/routers/races.py`)
- Added detailed performance logs showing:
  - Cache hit type (memory vs DB)
  - Cache age (for memory cache)
  - Query times for each layer
  - Number of races returned
- Improved cache expiration handling

## Performance Characteristics

### Expected Response Times

1. **Memory Cache Hit**: < 1ms
   - Instant response from in-memory cache (5-minute TTL)

2. **DB Cache Hit**: < 5ms
   - Fast response from `AppCacheModel` table
   - Automatically populates memory cache for next request

3. **Cache Miss (Cold Start)**: < 50ms
   - Queries `RaceModel` table (fast with composite index)
   - Builds minimal payload (only fields needed for `RaceCard`)
   - Writes to `AppCacheModel` for future requests
   - Subsequent requests will hit DB cache (< 5ms)

### Multi-Layer Caching Strategy

```
Request → Memory Cache (5min TTL) → DB Cache (AppCacheModel) → DB Query (RaceModel)
```

1. **Layer 1: In-Memory Cache** (fastest)
   - Per-process dictionary cache
   - 5-minute TTL
   - Instant response

2. **Layer 2: Database Cache** (fast)
   - Stored in `AppCacheModel` table
   - Persists across server restarts
   - Typically < 5ms response time

3. **Layer 3: Database Query** (acceptable)
   - Queries `RaceModel` table directly
   - Uses composite index for optimal performance
   - Builds and caches payload
   - Typically < 50ms response time

## Code Changes Summary

### Files Modified

1. **`server/app/models.py`**
   - Added composite index `idx_races_year_round` on `RaceModel`
   - Imported `Index` from SQLAlchemy

2. **`server/app/services/f1_service.py`**
   - Enhanced `cache_races_snapshot()` with detailed timing logs
   - Added `EventDate` field to payload for frontend compatibility
   - Improved cache write efficiency

3. **`server/app/routers/races.py`**
   - Enhanced endpoint logging with detailed performance metrics
   - Improved cache expiration handling
   - Added cache age tracking for memory cache

## Verification

To verify the optimizations are working:

1. **Check server logs** for `[PERF]` messages showing:
   - Cache hit types and response times
   - Breakdown of operations in `cache_races_snapshot()`

2. **Test scenarios**:
   - First request (cache miss): Should be < 50ms
   - Second request (memory cache hit): Should be < 1ms
   - After server restart (DB cache hit): Should be < 5ms

3. **Monitor performance**:
   - Look for `[PERF]` log entries showing timing breakdowns
   - Verify cache hit rates improve over time

## Database Migration

The composite index will be automatically created when:
- The application starts and `init_db()` is called, OR
- You run a migration tool (if using Alembic)

For existing databases, you may need to manually create the index:
```sql
CREATE INDEX IF NOT EXISTS idx_races_year_round ON races(year, round);
```

## Notes

- The endpoint returns **minimal payload** (only fields needed for `RaceCard` rendering)
- No FastF1 session loading occurs for the races list
- Cache invalidation is TTL-based (5 minutes for memory, persistent for DB)
- The solution maintains backward compatibility with existing API contracts

