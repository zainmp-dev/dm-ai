from __future__ import annotations

import threading
import time
from collections import defaultdict, deque


_LOCK = threading.Lock()
_BUCKETS: dict[str, deque[float]] = defaultdict(deque)


def check_rate_limit(key: str, *, max_requests: int, window_seconds: int) -> bool:
    now = time.time()
    oldest_allowed = now - window_seconds
    with _LOCK:
        bucket = _BUCKETS[key]
        while bucket and bucket[0] < oldest_allowed:
            bucket.popleft()
        if len(bucket) >= max_requests:
            return False
        bucket.append(now)
    return True
