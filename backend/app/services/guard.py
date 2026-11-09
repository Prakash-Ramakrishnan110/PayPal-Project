import json
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field
from sqlmodel import Session, select

from app.config import get_settings
from app.database import engine
from app.models.audit import AuditEvent, PendingApproval
from app.models.mandate import Mandate
from app.models.purchase import PurchaseRequest
from app.services.paypal import PayPalError, paypal_client
from app.services.policy import Decision, evaluate


class GuardResult(BaseModel):
    decision: str = Field(..., description="'ALLOW' | 'ESCALATE' | 'BLOCK'")
    status: str = Field(..., description="'AWAITING_PAYPAL_APPROVAL' | 'AWAITING_HUMAN_APPROVAL' | 'BLOCKED'")
    reason_codes: List[str] = Field(default_factory=list)
    human_message: str
    paypal_order_id: Optional[str] = None
    approve_url: Optional[str] = None
    pending_approval_id: Optional[str] = None
    audit_event_id: str
    amount_cents: int


def _get_monthly_spent_and_timestamps(session: Session, mandate_id: str, now: datetime):
    # Beginning of current month
    month_start = datetime(now.year, now.month, 1, tzinfo=timezone.utc)

    # 1. Completed purchases this month
    completed_events = session.exec(
        select(AuditEvent).where(
            AuditEvent.mandate_id == mandate_id,
            AuditEvent.event_type == "PURCHASE_COMPLETED",
            AuditEvent.timestamp >= month_start,
        )
    ).all()
    completed_cents = sum(e.amount_cents or 0 for e in completed_events)

    # 2. Reserved spend: ALLOW events currently awaiting PayPal checkout
    # Find orders created in the last 2 hours that haven't completed or failed yet
    two_hours_ago = now - timedelta(hours=2)
    allowed_events = session.exec(
        select(AuditEvent).where(
            AuditEvent.mandate_id == mandate_id,
            AuditEvent.event_type == "PURCHASE_ALLOWED",
            AuditEvent.timestamp >= two_hours_ago,
        )
    ).all()

    # Completed order IDs
    completed_order_ids = {e.paypal_order_id for e in completed_events if e.paypal_order_id}
    reserved_paypal_cents = sum(
        e.amount_cents or 0
        for e in allowed_events
        if e.paypal_order_id and e.paypal_order_id not in completed_order_ids
    )

    # 3. Reserved spend: pending human approvals
    pending_approvals = session.exec(
        select(PendingApproval).where(
            PendingApproval.mandate_id == mandate_id,
            PendingApproval.status == "pending",
        )
    ).all()
    reserved_pending_cents = sum(p.amount_cents for p in pending_approvals) + reserved_paypal_cents

    # 4. Recent purchase attempt timestamps (for velocity limit)
    ten_mins_ago = now - timedelta(minutes=10)
    recent_events = session.exec(
        select(AuditEvent).where(
            AuditEvent.mandate_id == mandate_id,
            AuditEvent.event_type.in_(["PURCHASE_ALLOWED", "PURCHASE_COMPLETED"]),
            AuditEvent.timestamp >= ten_mins_ago,
        )
    ).all()
    recent_timestamps = [e.timestamp for e in recent_events]

    return completed_cents, reserved_pending_cents, recent_timestamps


async def process_purchase_request(
    request: PurchaseRequest,
    session: Optional[Session] = None,
) -> GuardResult:
    """
    Core Mandate Guard evaluation & purchase pipeline:
    1. Loads active mandate (BLOCK if none).
    2. Computes spent and reserved budget.
    3. Runs deterministic PolicyEngine.
    4. Writes AuditEvent.
    5. If ALLOW: creates PayPal order, returns approval URL.
    6. If ESCALATE: creates PendingApproval queue entry.
    7. If BLOCK: returns verdict without touching PayPal.
    """
    settings = get_settings()
    now = datetime.now(timezone.utc)

    # Use existing session or create fresh one
    owns_session = session is None
    if owns_session:
        session = Session(engine)

    try:
        # 1. Fetch active mandate
        mandate = session.exec(
            select(Mandate).where(Mandate.status == "active").order_by(Mandate.created_at.desc())
        ).first()

        total_cents = request.unit_price_cents * request.quantity

        if not mandate:
            audit = AuditEvent(
                timestamp=now,
                mandate_id=None,
                event_type="PURCHASE_BLOCKED",
                decision="BLOCK",
                reason_codes=["NO_ACTIVE_MANDATE"],
                amount_cents=total_cents,
                merchant=request.merchant,
                category=request.category,
                item_name=request.item_name,
                payload_json=json.dumps(request.model_dump()),
            )
            session.add(audit)
            session.commit()
            session.refresh(audit)

            return GuardResult(
                decision="BLOCK",
                status="BLOCKED",
                reason_codes=["NO_ACTIVE_MANDATE"],
                human_message="Purchase blocked: No active spending mandate exists. Please create and activate a mandate first.",
                audit_event_id=audit.id,
                amount_cents=total_cents,
            )

        # 2. Compute spending metrics & timestamps
        spent_cents, reserved_cents, recent_timestamps = _get_monthly_spent_and_timestamps(session, mandate.id, now)

        # 3. Deterministic Policy Evaluation
        decision = evaluate(
            mandate=mandate,
            request=request,
            spent_this_month_cents=spent_cents,
            recent_purchase_timestamps=recent_timestamps,
            now=now,
            reserved_pending_cents=reserved_cents,
        )

        audit_id = str(uuid.uuid4())

        # 4. Handle Decision
        if decision.decision == "BLOCK":
            audit = AuditEvent(
                id=audit_id,
                timestamp=now,
                mandate_id=mandate.id,
                event_type="PURCHASE_BLOCKED",
                decision="BLOCK",
                reason_codes=decision.reason_codes,
                amount_cents=total_cents,
                merchant=request.merchant,
                category=request.category,
                item_name=request.item_name,
                payload_json=json.dumps(request.model_dump()),
            )
            session.add(audit)
            session.commit()

            return GuardResult(
                decision="BLOCK",
                status="BLOCKED",
                reason_codes=decision.reason_codes,
                human_message=decision.human_message,
                audit_event_id=audit.id,
                amount_cents=total_cents,
            )

        elif decision.decision == "ESCALATE":
            # Queue for human approval
            pending = PendingApproval(
                timestamp=now,
                mandate_id=mandate.id,
                request_payload_json=json.dumps(request.model_dump()),
                amount_cents=total_cents,
                merchant=request.merchant,
                item_name=request.item_name,
                status="pending",
            )
            session.add(pending)

            audit = AuditEvent(
                id=audit_id,
                timestamp=now,
                mandate_id=mandate.id,
                event_type="PURCHASE_ESCALATED",
                decision="ESCALATE",
                reason_codes=decision.reason_codes,
                amount_cents=total_cents,
                merchant=request.merchant,
                category=request.category,
                item_name=request.item_name,
                payload_json=json.dumps(request.model_dump()),
            )
            session.add(audit)
            session.commit()
            session.refresh(pending)

            return GuardResult(
                decision="ESCALATE",
                status="AWAITING_HUMAN_APPROVAL",
                reason_codes=decision.reason_codes,
                human_message=decision.human_message,
                pending_approval_id=pending.id,
                audit_event_id=audit.id,
                amount_cents=total_cents,
            )

        else:
            # ALLOW: Create PayPal Sandbox order
            paypal_order = await paypal_client.create_order(
                amount_cents=total_cents,
                currency=request.currency,
                description=f"{request.quantity}x {request.item_name} from {request.merchant}",
            )

            order_id = paypal_order["order_id"]
            approve_url = paypal_order["approve_url"]

            audit = AuditEvent(
                id=audit_id,
                timestamp=now,
                mandate_id=mandate.id,
                event_type="PURCHASE_ALLOWED",
                decision="ALLOW",
                reason_codes=decision.reason_codes,
                amount_cents=total_cents,
                merchant=request.merchant,
                category=request.category,
                item_name=request.item_name,
                payload_json=json.dumps(request.model_dump()),
                paypal_order_id=order_id,
            )
            session.add(audit)
            session.commit()

            return GuardResult(
                decision="ALLOW",
                status="AWAITING_PAYPAL_APPROVAL",
                reason_codes=decision.reason_codes,
                human_message=decision.human_message,
                paypal_order_id=order_id,
                approve_url=approve_url,
                audit_event_id=audit.id,
                amount_cents=total_cents,
            )

    finally:
        if owns_session:
            session.close()


async def approve_pending_purchase(approval_id: str, session: Session) -> GuardResult:
    """
    Human Approves an Escalated Purchase:
    1. Loads PendingApproval.
    2. Re-evaluates policy (minus ESCALATE auto-approve rule to prevent loop).
    3. If within caps: creates PayPal Sandbox order and returns approval link.
    """
    pending = session.get(PendingApproval, approval_id)
    if not pending:
        raise ValueError(f"Pending approval {approval_id} not found")
    if pending.status != "pending":
        raise ValueError(f"Pending approval {approval_id} is already {pending.status}")

    mandate = session.get(Mandate, pending.mandate_id)
    if not mandate or mandate.status != "active":
        pending.status = "rejected"
        session.add(pending)
        session.commit()
        raise ValueError("Mandate is no longer active")

    req_dict = json.loads(pending.request_payload_json)
    request = PurchaseRequest(**req_dict)

    now = datetime.now(timezone.utc)
    spent_cents, reserved_cents, recent_timestamps = _get_monthly_spent_and_timestamps(session, mandate.id, now)

    # Check for hard block rules (over transaction cap, over monthly cap, etc.)
    decision = evaluate(
        mandate=mandate,
        request=request,
        spent_this_month_cents=spent_cents,
        recent_purchase_timestamps=recent_timestamps,
        now=now,
        reserved_pending_cents=0,  # This approval is now resolving
    )

    if decision.decision == "BLOCK":
        pending.status = "rejected"
        session.add(pending)
        session.commit()
        raise ValueError(f"Purchase cannot be approved: {decision.human_message}")

    # Create PayPal Order
    paypal_order = await paypal_client.create_order(
        amount_cents=pending.amount_cents,
        currency=request.currency,
        description=f"{request.quantity}x {request.item_name} from {request.merchant} (Human Approved)",
    )

    pending.status = "approved"
    session.add(pending)

    order_id = paypal_order["order_id"]
    approve_url = paypal_order["approve_url"]

    audit = AuditEvent(
        timestamp=now,
        mandate_id=mandate.id,
        event_type="PURCHASE_ALLOWED",
        decision="ALLOW",
        reason_codes=["HUMAN_APPROVED"],
        amount_cents=pending.amount_cents,
        merchant=request.merchant,
        category=request.category,
        item_name=request.item_name,
        payload_json=json.dumps(request.model_dump()),
        paypal_order_id=order_id,
    )
    session.add(audit)
    session.commit()

    return GuardResult(
        decision="ALLOW",
        status="AWAITING_PAYPAL_APPROVAL",
        reason_codes=["HUMAN_APPROVED"],
        human_message=f"Human approved purchase of {request.quantity}x '{request.item_name}'. Ready for PayPal checkout.",
        paypal_order_id=order_id,
        approve_url=approve_url,
        pending_approval_id=pending.id,
        audit_event_id=audit.id,
        amount_cents=pending.amount_cents,
    )


async def reject_pending_purchase(approval_id: str, session: Session) -> Dict[str, Any]:
    """
    Human Rejects an Escalated Purchase.
    """
    pending = session.get(PendingApproval, approval_id)
    if not pending:
        raise ValueError(f"Pending approval {approval_id} not found")
    if pending.status != "pending":
        raise ValueError(f"Pending approval {approval_id} is already {pending.status}")

    pending.status = "rejected"
    session.add(pending)

    audit = AuditEvent(
        timestamp=datetime.now(timezone.utc),
        mandate_id=pending.mandate_id,
        event_type="PURCHASE_BLOCKED",
        decision="BLOCK",
        reason_codes=["HUMAN_REJECTED"],
        amount_cents=pending.amount_cents,
        merchant=pending.merchant,
        item_name=pending.item_name,
        payload_json=pending.request_payload_json,
    )
    session.add(audit)
    session.commit()

    return {
        "success": True,
        "id": pending.id,
        "status": "rejected",
    }


async def finalize_order_capture(order_id: str, session: Session) -> Dict[str, Any]:
    """
    Captures settled order from PayPal Sandbox and records PURCHASE_COMPLETED.
    """
    capture_result = await paypal_client.capture_order(order_id)
    now = datetime.now(timezone.utc)

    # Link to original audit event
    orig_audit = session.exec(
        select(AuditEvent).where(AuditEvent.paypal_order_id == order_id)
    ).first()

    mandate_id = orig_audit.mandate_id if orig_audit else None
    item_name = orig_audit.item_name if orig_audit else "Item"
    merchant = orig_audit.merchant if orig_audit else "Merchant"
    amount_cents = capture_result.get("amount_cents") or (orig_audit.amount_cents if orig_audit else 0)

    completed_audit = AuditEvent(
        timestamp=now,
        mandate_id=mandate_id,
        event_type="PURCHASE_COMPLETED",
        decision="ALLOW",
        reason_codes=["PAYPAL_SETTLED"],
        amount_cents=amount_cents,
        merchant=merchant,
        item_name=item_name,
        paypal_order_id=order_id,
        payload_json=json.dumps(capture_result.get("raw", {})),
    )
    session.add(completed_audit)
    session.commit()

    return {
        "success": True,
        "order_id": order_id,
        "capture_id": capture_result.get("capture_id"),
        "status": capture_result.get("status"),
        "amount_cents": amount_cents,
    }
