"""Configurazione logging strutturato JSON.

Un formatter minimale senza dipendenze extra: serializza ogni record in JSON
con timestamp ISO, level, logger, message ed eventuali ``extra``.
"""

from __future__ import annotations

import json
import logging
import sys
from datetime import datetime, timezone
from typing import Any

_RESERVED_RECORD_ATTRS: frozenset[str] = frozenset(
    {
        "args",
        "asctime",
        "created",
        "exc_info",
        "exc_text",
        "filename",
        "funcName",
        "levelname",
        "levelno",
        "lineno",
        "message",
        "module",
        "msecs",
        "msg",
        "name",
        "pathname",
        "process",
        "processName",
        "relativeCreated",
        "stack_info",
        "thread",
        "threadName",
        "taskName",
    }
)


class JsonFormatter(logging.Formatter):
    """Formatter che emette una riga JSON per record."""

    def format(self, record: logging.LogRecord) -> str:  # noqa: D401
        ts = datetime.fromtimestamp(record.created, tz=timezone.utc).isoformat()
        payload: dict[str, Any] = {
            "timestamp": ts,
            "level": record.levelname,
            "logger": record.name,
            "msg": record.getMessage(),
        }

        if record.exc_info:
            payload["exc"] = self.formatException(record.exc_info)
        if record.stack_info:
            payload["stack"] = self.formatStack(record.stack_info)

        extras: dict[str, Any] = {}
        for key, value in record.__dict__.items():
            if key in _RESERVED_RECORD_ATTRS or key.startswith("_"):
                continue
            try:
                json.dumps(value, default=str)
                extras[key] = value
            except (TypeError, ValueError):
                extras[key] = repr(value)
        if extras:
            payload["extra"] = extras

        return json.dumps(payload, ensure_ascii=False, default=str)


def configure_logging(level: str = "INFO") -> None:
    """Configura il root logger con ``JsonFormatter`` su stdout.

    Idempotente: rimuove eventuali handler preesistenti aggiunti da uvicorn
    per evitare duplicazioni di output.
    """

    resolved = getattr(logging, (level or "INFO").upper(), logging.INFO)

    root = logging.getLogger()
    root.setLevel(resolved)

    for handler in list(root.handlers):
        root.removeHandler(handler)

    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(JsonFormatter())
    handler.setLevel(resolved)
    root.addHandler(handler)

    # Allinea i logger uvicorn al nostro formatter per avere output omogeneo.
    for uv_name in ("uvicorn", "uvicorn.error", "uvicorn.access"):
        uv_logger = logging.getLogger(uv_name)
        uv_logger.handlers = []
        uv_logger.propagate = True
        uv_logger.setLevel(resolved)
