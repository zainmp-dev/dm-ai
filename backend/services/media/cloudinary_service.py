"""Cloudinary signed uploads — shared by Media setup and Blog featured images."""

from __future__ import annotations

import base64
import hashlib
import logging
import re
import time
import uuid
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

import requests
from fastapi import HTTPException

from config import settings

logger = logging.getLogger(__name__)

BLOG_IMAGE_MAX_BYTES = 10 * 1024 * 1024
BLOG_IMAGE_TRANSFORMATION = "c_limit,w_1920,h_1080,q_auto,f_auto"


def cloudinary_uploads_ready() -> bool:
    return bool(
        settings.cloudinary_cloud_name and settings.cloudinary_api_key and settings.cloudinary_api_secret
    )


def cloudinary_public_id_stem(file_name: str | None, *, prefix: str = "flowpilot") -> str:
    raw = (file_name or "").strip()
    if raw:
        base = Path(raw).name
        stem = base.rsplit(".", 1)[0] if "." in base else base
        safe = re.sub(r"[^a-zA-Z0-9_-]+", "_", stem).strip("_")
        if safe:
            return safe[:120]
    return f"{prefix}-{uuid.uuid4().hex[:10]}"


def _signed_upload(
    *,
    file_payload: str,
    file_name: str | None,
    folder: str,
    public_id: str,
    transformation: str | None = None,
    resource_endpoint: str = "auto/upload",
) -> str:
    if not cloudinary_uploads_ready():
        raise HTTPException(status_code=400, detail="Cloudinary credentials are not configured")

    timestamp = str(int(time.time()))
    params_to_sign: dict[str, str] = {
        "folder": folder,
        "public_id": public_id,
        "timestamp": timestamp,
    }
    if transformation:
        params_to_sign["transformation"] = transformation

    signature_payload = "&".join(f"{key}={params_to_sign[key]}" for key in sorted(params_to_sign))
    signature = hashlib.sha1(f"{signature_payload}{settings.cloudinary_api_secret}".encode()).hexdigest()

    try:
        response = requests.post(
            f"https://api.cloudinary.com/v1_1/{settings.cloudinary_cloud_name}/{resource_endpoint}",
            data={
                **params_to_sign,
                "api_key": settings.cloudinary_api_key,
                "signature": signature,
                "file": file_payload,
            },
            timeout=settings.request_timeout_seconds,
        )
        response.raise_for_status()
        payload = response.json()
    except requests.RequestException as exc:
        detail = exc.response.text[:300] if exc.response is not None else str(exc)
        raise HTTPException(status_code=502, detail=f"Cloudinary upload failed: {detail}") from exc
    except ValueError as exc:
        raise HTTPException(status_code=502, detail="Cloudinary returned invalid JSON") from exc

    secure_url = str(payload.get("secure_url", "")).strip()
    if not secure_url:
        raise HTTPException(status_code=502, detail="Cloudinary upload did not return a secure URL")
    return secure_url


def upload_data_url_to_cloudinary(
    data_url: str,
    file_name: str | None,
    *,
    folder: str | None = None,
    transformation: str | None = None,
    public_id_prefix: str = "flowpilot",
) -> str:
    """Upload a base64 data URL (used by Media setup)."""
    target_folder = folder or settings.cloudinary_folder
    public_id = cloudinary_public_id_stem(file_name, prefix=public_id_prefix)
    return _signed_upload(
        file_payload=data_url,
        file_name=file_name,
        folder=target_folder,
        public_id=public_id,
        transformation=transformation,
        resource_endpoint="auto/upload",
    )


def upload_bytes_to_cloudinary(
    file_bytes: bytes,
    file_name: str,
    content_type: str,
    *,
    subfolder: str = "blog",
    transformation: str = BLOG_IMAGE_TRANSFORMATION,
) -> str:
    """Upload raw image bytes (Blog featured images)."""
    if not file_bytes:
        raise HTTPException(status_code=400, detail="Empty file")
    if len(file_bytes) > BLOG_IMAGE_MAX_BYTES:
        raise HTTPException(status_code=400, detail="Image must be under 10MB")

    mime = (content_type or "").strip().lower()
    if not mime.startswith("image/"):
        raise HTTPException(status_code=400, detail="Only image files are allowed")

    b64 = base64.b64encode(file_bytes).decode("ascii")
    data_url = f"data:{mime};base64,{b64}"
    base_folder = (settings.cloudinary_folder or "flowpilot").strip().strip("/")
    folder = f"{base_folder}/{subfolder}".strip("/")
    public_id = cloudinary_public_id_stem(file_name, prefix="blog")
    return _signed_upload(
        file_payload=data_url,
        file_name=file_name,
        folder=folder,
        public_id=public_id,
        transformation=transformation,
        resource_endpoint="image/upload",
    )


def try_upload_remote_to_cloudinary(source_url: str, *, public_id: str) -> str | None:
    if not cloudinary_uploads_ready():
        return None
    if not source_url.startswith("https://") or source_url.startswith("https://res.cloudinary.com/"):
        return None
    timestamp = str(int(time.time()))
    params_to_sign: dict[str, str] = {
        "folder": settings.cloudinary_folder,
        "public_id": public_id,
        "timestamp": timestamp,
    }
    signature_payload = "&".join(f"{key}={params_to_sign[key]}" for key in sorted(params_to_sign))
    signature = hashlib.sha1(f"{signature_payload}{settings.cloudinary_api_secret}".encode()).hexdigest()
    try:
        response = requests.post(
            f"https://api.cloudinary.com/v1_1/{settings.cloudinary_cloud_name}/auto/upload",
            data={
                **params_to_sign,
                "api_key": settings.cloudinary_api_key,
                "signature": signature,
                "file": source_url,
            },
            timeout=settings.request_timeout_seconds,
        )
        response.raise_for_status()
        payload = response.json()
    except requests.RequestException as exc:
        detail = exc.response.text[:300] if exc.response is not None else str(exc)
        logger.warning("Cloudinary remote upload failed: %s", detail)
        return None
    except ValueError as exc:
        logger.warning("Cloudinary remote upload invalid JSON: %s", exc)
        return None

    secure_url = str(payload.get("secure_url", "")).strip()
    return secure_url or None


def cloudinary_public_id_from_delivery_url(url: str) -> tuple[str, str, str] | None:
    try:
        u = urlparse(url.strip())
        if (u.netloc or "").lower().split(":")[0] != "res.cloudinary.com":
            return None
        parts = [x for x in u.path.strip("/").split("/") if x]
        if len(parts) < 4 or parts[2] != "upload":
            return None
        cloud_name, resource_type = parts[0], parts[1]
        if resource_type not in ("image", "video", "raw"):
            return None
        rest = parts[3:]
        if rest and rest[0].startswith("v") and len(rest[0]) > 1 and rest[0][1:].isdigit():
            rest = rest[1:]
        if not rest:
            return None
        last = rest[-1]
        if "." in last:
            base, ext = last.rsplit(".", 1)
            if ext.isalnum() and 1 <= len(ext) <= 8:
                rest = rest[:-1] + [base]
        public_id = "/".join(rest)
        if not public_id or ".." in public_id:
            return None
        return cloud_name, resource_type, public_id
    except (ValueError, IndexError):
        return None


def try_destroy_cloudinary_delivery_asset(media_url: str) -> None:
    parsed = cloudinary_public_id_from_delivery_url(media_url)
    if parsed is None:
        return
    cloud_name, resource_type, public_id = parsed
    if cloud_name != settings.cloudinary_cloud_name:
        logger.warning("Skipping Cloudinary destroy: URL cloud %r != CLOUDINARY_CLOUD_NAME", cloud_name)
        return
    if not settings.cloudinary_api_key or not settings.cloudinary_api_secret:
        return
    timestamp = str(int(time.time()))
    params_to_sign = {"public_id": public_id, "timestamp": timestamp}
    signature_payload = "&".join(f"{k}={params_to_sign[k]}" for k in sorted(params_to_sign))
    signature = hashlib.sha1(f"{signature_payload}{settings.cloudinary_api_secret}".encode()).hexdigest()
    try:
        endpoint = f"https://api.cloudinary.com/v1_1/{cloud_name}/{resource_type}/destroy"
        response = requests.post(
            endpoint,
            data={**params_to_sign, "api_key": settings.cloudinary_api_key, "signature": signature},
            timeout=settings.request_timeout_seconds,
        )
        if response.status_code >= 400:
            logger.warning("Cloudinary destroy failed (%s): %s", response.status_code, response.text[:400])
    except requests.RequestException as exc:
        logger.warning("Cloudinary destroy request failed: %s", exc)


def is_valid_featured_image_url(url: str) -> bool:
    u = (url or "").strip()
    if not u:
        return True
    if u.startswith("https://res.cloudinary.com/"):
        return True
    if u.startswith("https://") and any(
        host in u.lower()
        for host in (
            "images.pexels.com",
            "image.pollinations.ai",
            "pexels.com",
        )
    ):
        return True
    prefix = "/" + settings.public_api_prefix.strip().strip("/")
    if u.startswith(f"{prefix}/media-assets/"):
        return True
    return False
