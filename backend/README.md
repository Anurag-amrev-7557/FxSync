# Audio Sync Backend - Performance & Sync Enhancements

## Ultra-Low-Latency Sync Mode

- **Immediate `sync_state` emits**: The backend now emits `sync_state` to all clients immediately on any play, pause, seek, or track change event, in addition to regular intervals.
- **Aggressive sync intervals**: The default sync interval is now 100ms (down from 400ms), and for high-drift sessions, 60ms (down from 200ms).
- **Ultra-low-latency mode**: Set the environment variable `ULTRA_LOW_LATENCY=true` to enable even more aggressive intervals (50ms/30ms).
- **Drift feedback**: If any client reports drift above the threshold, the controller receives a `drift_feedback` event for immediate action.
- **Sync batching**: Multiple sync emits in the same tick are batched to avoid event loop overload.

## How to Enable Ultra-Low-Latency Mode

Set in your environment (e.g., `.env` or deployment config):

```
ULTRA_LOW_LATENCY=true
```

## Summary of Improvements
- Faster and more reliable sync for all clients.
- Immediate feedback to controllers for drift issues.
- Lower latency for all real-time events.
- Efficient event batching to avoid performance bottlenecks.

## Advanced Latency & Sync Enhancements (2024)

- **NTP-like batch time sync:** Clients can request multiple time samples at once using the `time_sync_batch` socket event for more accurate offset/RTT calculation.
- **High-resolution timestamps:** All sync events now include a `hrtime` field (nanoseconds since process start) for ultra-precise timing.
- **Adaptive per-session sync intervals:** The backend dynamically adjusts the sync interval for each session based on recent drift and RTT, for optimal performance and network usage.
- **/time HTTP endpoint:** GET `/time` returns `{ serverTime, hrtime }` for HTTP-based time sync.
- **Immediate listener sync on drift:** If a client reports high drift, all listeners in the session receive an immediate `sync_state` for rapid correction.

All enhancements are backward-compatible and do not break existing protocol or state.

---

For further tuning, adjust the `BASE_SYNC_INTERVAL` and `HIGH_DRIFT_SYNC_INTERVAL` in `socket.js` as needed. 