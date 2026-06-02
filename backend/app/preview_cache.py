import secrets
import time
from threading import Lock

_TTL_SECONDS = 5 * 60
_MAX_ENTRIES = 256

_lock = Lock()
_cache: dict[str, tuple[bytes, float]] = {}


def put(content: bytes) -> str:
    token = secrets.token_urlsafe(16)
    now = time.time()
    with _lock:
        _evict_expired_locked(now)
        if len(_cache) >= _MAX_ENTRIES:
            oldest = min(_cache, key=lambda t: _cache[t][1])
            del _cache[oldest]
        _cache[token] = (content, now + _TTL_SECONDS)
    return token


def get(token: str) -> bytes | None:
    now = time.time()
    with _lock:
        _evict_expired_locked(now)
        entry = _cache.get(token)
        return entry[0] if entry else None


def clear() -> None:
    with _lock:
        _cache.clear()


def _evict_expired_locked(now: float) -> None:
    expired = [t for t, (_, exp) in _cache.items() if exp <= now]
    for t in expired:
        del _cache[t]
