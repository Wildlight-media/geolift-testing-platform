"""Local-disk file storage. Kept behind a small interface so it can be
swapped for S3/GCS later without touching callers.
"""

import uuid
from pathlib import Path

from app.core.config import settings


def _root() -> Path:
    root = Path(settings.STORAGE_DIR)
    root.mkdir(parents=True, exist_ok=True)
    return root


def save_bytes(*, subdir: str, filename: str, content: bytes) -> str:
    directory = _root() / subdir
    directory.mkdir(parents=True, exist_ok=True)
    unique_name = f"{uuid.uuid4().hex}_{filename}"
    path = directory / unique_name
    path.write_bytes(content)
    return str(path.relative_to(_root()))


def read_bytes(relative_path: str) -> bytes:
    return (_root() / relative_path).read_bytes()


def absolute_path(relative_path: str) -> Path:
    return _root() / relative_path
