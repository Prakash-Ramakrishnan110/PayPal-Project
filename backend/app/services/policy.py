from datetime import datetime, timezone
from typing import List, Optional
from pydantic import BaseModel, Field

from app.models.mandate import Mandate
from app.models.purchase import PurchaseRequest
from app.services.signing import verify


class Decision(BaseModel):
    decision: str = Field(..., description="Verdict: 'ALLOW' | 'ESCALATE' | 'BLOCK'")
    reason_codes: List[str] = Field(default_factory=list, description="Machine-readable policy rule codes")
    human_message: str = Field(..., description="Clear one-sentence user-friendly explanation")


def evaluate(
    mandate: Mandate,
    request: PurchaseRequest,
    spent_this_month_cents: int = 0,
    recent_purchase_timestamps: Optional[List[datetime]] = None,
    now: Optional[datetime] = None,
    reserved_pending_cents: int = 0,
) -> Decision:
    """
    Pure deterministic policy evaluation outside the LLM.
    Evaluates purchase request against the signed mandate.
    Returns Decision with ALLOW, ESCALATE, or BLOCK.
    """
    if now is None:
        now = datetime.now(timezone.utc)
    elif now.tzinfo is None:
        now = now.replace(tzinfo=timezone.utc)

    if recent_purchase_timestamps is None:
        recent_purchase_timestamps = []

    block_reasons: List[str] = []
    total_cents = request.unit_price_cents * request.quantity

    # 1. Cryptographic Signature check
    if not verify(mandate):
        block_reasons.append("SIGNATURE_INVALID")

    # 2. Status & Expiration checks
    if mandate.status == "revoked":
        block_reasons.append("MANDATE_REVOKED")
    
    expires_at = mandate.expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)

    if mandate.status == "expired" or now > expires_at:
        block_reasons.append("MANDATE_EXPIRED")

    # 3. Currency check
    if request.currency.upper() != mandate.currency.upper():
        block_reasons.append("CURRENCY_MISMATCH")

    # 4. Blocked categories check (case-insensitive)
    normalized_blocked = [c.lower() for c in mandate.blocked_categories]
    if request.category.lower() in normalized_blocked:
        block_reasons.append("CATEGORY_BLOCKED")

    # 5. Allowed categories check (if non-empty)
    if mandate.allowed_categories:
        normalized_allowed = [c.lower() for c in mandate.allowed_categories]
        if request.category.lower() not in normalized_allowed:
            block_reasons.append("CATEGORY_NOT_ALLOWED")

    # 6. Allowed merchants check (if non-empty)
    if mandate.allowed_merchants:
        normalized_merchants = [m.lower() for m in mandate.allowed_merchants]
        if request.merchant.lower() not in normalized_merchants:
            block_reasons.append("MERCHANT_NOT_ALLOWED")

    # 7. Quantity check
    if request.quantity > mandate.max_quantity_per_item:
        block_reasons.append("QUANTITY_EXCEEDED")

    # 8. Per-transaction cap
    if total_cents > mandate.per_transaction_cap_cents:
        block_reasons.append("OVER_TRANSACTION_CAP")

    # 9. Monthly cap (including completed + reserved pending/awaiting amounts)
    effective_monthly_spend = spent_this_month_cents + reserved_pending_cents
    if effective_monthly_spend + total_cents > mandate.monthly_cap_cents:
        block_reasons.append("OVER_MONTHLY_CAP")

    # 10. Velocity limit: more than 3 purchases within the trailing 60 seconds
    recent_in_window = 0
    for ts in recent_purchase_timestamps:
        norm_ts = ts if ts.tzinfo is not None else ts.replace(tzinfo=timezone.utc)
        if 0 <= (now - norm_ts).total_seconds() <= 60:
            recent_in_window += 1

    if recent_in_window >= 3:
        block_reasons.append("VELOCITY_LIMIT")

    # If any BLOCK conditions matched, collect all and return BLOCK
    if block_reasons:
        reasons_str = ", ".join(block_reasons)
        human_msg = (
            f"Purchase of {request.quantity}x '{request.item_name}' (${total_cents / 100:.2f}) "
            f"blocked: {reasons_str}."
        )
        return Decision(
            decision="BLOCK",
            reason_codes=block_reasons,
            human_message=human_msg,
        )

    # 11. Escalate if above auto-approve threshold but within caps
    if total_cents > mandate.auto_approve_under_cents:
        human_msg = (
            f"Purchase of {request.quantity}x '{request.item_name}' (${total_cents / 100:.2f}) "
            f"from {request.merchant} requires human approval because it exceeds the auto-approval threshold "
            f"(${mandate.auto_approve_under_cents / 100:.2f})."
        )
        return Decision(
            decision="ESCALATE",
            reason_codes=["ABOVE_AUTO_APPROVE"],
            human_message=human_msg,
        )

    # Otherwise ALLOW
    human_msg = (
        f"Purchase of {request.quantity}x '{request.item_name}' (${total_cents / 100:.2f}) "
        f"from {request.merchant} is within mandate limits and approved."
    )
    return Decision(
        decision="ALLOW",
        reason_codes=["WITHIN_MANDATE"],
        human_message=human_msg,
    )
