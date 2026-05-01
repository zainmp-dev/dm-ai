from __future__ import annotations

from urllib.parse import urlparse


def require_https_redirect_uri(uri: str, *, field_name: str) -> str:
    value = uri.strip()
    parsed = urlparse(value)
    if not parsed.netloc:
        raise ValueError(f"{field_name} must be a valid absolute URL")
    if parsed.scheme == "https":
        return value
    # Local development callback can be plain HTTP on localhost.
    if parsed.scheme == "http" and parsed.hostname in {"localhost", "127.0.0.1", "::1"}:
        return value
    raise ValueError(f"{field_name} must be HTTPS (or HTTP only for localhost)")
