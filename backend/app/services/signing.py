import hashlib
import hmac
import json
from datetime import datetime, timezone
from typing import Any, Dict, Union
from app.config import get_settings
from app.models.mandate import Mandate


def _normalize_value(val: Any) -> Any:
    if isinstance(val, datetime):
        if val.tzinfo is None:
            val = val.replace(tzinfo=timezone.utc)
        else:
            val = val.astimezone(timezone.utc)
        return val.isoformat()
    if isinstance(val, list):
        return sorted(_normalize_value(x) for x in val)
    if isinstance(val, dict):
        return {k: _normalize_value(v) for k, v in sorted(val.items())}
    return val


def canonicalize(mandate: Union[Mandate, Dict[str, Any]]) -> str:
    """
    Returns a deterministic JSON string representing all constraint fields
    of the mandate EXCEPT 'signature' and 'status'.
    Datetimes are normalized to UTC ISO strings, lists are sorted,
    keys are sorted, and no extra whitespace is included.
    """
    if isinstance(mandate, Mandate):
        raw_dict = mandate.model_dump()
    elif isinstance(mandate, dict):
        raw_dict = dict(mandate)
    else:
        raise ValueError(f"Unsupported mandate type for canonicalization: {type(mandate)}")

    # Exclude mutable runtime fields
    raw_dict.pop("signature", None)
    raw_dict.pop("status", None)

    canonical_dict = {k: _normalize_value(v) for k, v in raw_dict.items()}

    return json.dumps(canonical_dict, sort_keys=True, separators=(",", ":"))


def sign(mandate: Union[Mandate, Dict[str, Any]], secret: str = None) -> str:
    """
    Computes HMAC-SHA256 hex signature over the canonicalized mandate string.
    """
    if secret is None:
        secret = get_settings().MANDATE_SIGNING_SECRET

    payload = canonicalize(mandate).encode("utf-8")
    key = secret.encode("utf-8")
    return hmac.new(key, payload, hashlib.sha256).hexdigest()


def verify(mandate: Mandate, secret: str = None) -> bool:
    """
    Verifies that mandate.signature matches the HMAC-SHA256 computed from its content.
    Returns False if signature is missing or does not match.
    """
    if not mandate.signature:
        return False

    expected_signature = sign(mandate, secret=secret)
    return hmac.compare_digest(mandate.signature, expected_signature)

