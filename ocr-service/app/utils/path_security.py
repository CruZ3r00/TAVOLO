"""Difesa contro path traversal: valida che un path sia dentro una whitelist."""

from __future__ import annotations

import os


def validate_input_path(path_str: str, allowed_dir: str) -> str:
    """Risolvi symlink e normalizza, poi verifica che il path sia sotto ``allowed_dir``.

    Ritorna il path assoluto normalizzato. Solleva ``PermissionError`` se il
    path tenta di uscire dalla whitelist.
    """

    if not path_str or not isinstance(path_str, str):
        raise PermissionError("file_path vuoto o non valido.")
    if not allowed_dir or not isinstance(allowed_dir, str):
        raise PermissionError("allowed_dir non configurato.")

    real_target = os.path.realpath(os.path.normpath(path_str))
    real_allowed = os.path.realpath(os.path.normpath(allowed_dir))

    if real_target == real_allowed:
        raise PermissionError("file_path coincide con allowed_dir (deve essere un file al suo interno).")

    if not real_target.startswith(real_allowed + os.sep):
        raise PermissionError(
            f"file_path fuori da ALLOWED_INPUT_DIR: {path_str!r} non e' sotto {allowed_dir!r}"
        )

    return real_target
