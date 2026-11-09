from datetime import datetime, timezone
from typing import Any, Dict, List
from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from app.database import get_session
from app.models.audit import AuditEvent, PendingApproval
from app.models.mandate import Mandate
from app.models.purchase import PurchaseRequest
from app.services.guard import (
    GuardResult,
    _get_monthly_spent_and_timestamps,
    approve_pending_purchase,
    finalize_order_capture,
    process_purchase_request,
    reject_pending_purchase,
)

router = APIRouter(tags=["guard"])


@router.post("/guard/request", response_model=GuardResult)
async def request_purchase(request: PurchaseRequest, session: Session = Depends(get_session)):
    """
    Submits a purchase request to Mandate Guard.
    Deterministically returns ALLOW, ESCALATE, or BLOCK.
    """
    try:
        result = await process_purchase_request(request, session=session)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/guard/pending", response_model=List[PendingApproval])
def list_pending_approvals(session: Session = Depends(get_session)):
    """
    Lists all pending purchase requests requiring human approval.
    """
    pending = session.exec(
        select(PendingApproval).where(PendingApproval.status == "pending").order_by(PendingApproval.timestamp.desc())
    ).all()
    return pending


@router.post("/guard/pending/{approval_id}/approve", response_model=GuardResult)
async def approve_pending(approval_id: str, session: Session = Depends(get_session)):
    """
    Human Approves an escalated purchase request. Creates PayPal sandbox order.
    """
    try:
        result = await approve_pending_purchase(approval_id, session=session)
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/guard/pending/{approval_id}/reject")
async def reject_pending(approval_id: str, session: Session = Depends(get_session)):
    """
    Human Rejects an escalated purchase request.
    """
    try:
        result = await reject_pending_purchase(approval_id, session=session)
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/guard/capture/{order_id}")
async def capture_order(order_id: str, session: Session = Depends(get_session)):
    """
    Finalizes captured PayPal order after user completes approval on PayPal's checkout page.
    """
    try:
        result = await finalize_order_capture(order_id, session=session)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/audit", response_model=List[AuditEvent])
def get_audit_log(session: Session = Depends(get_session)):
    """
    Returns the latest 200 audit events.
    """
    events = session.exec(
        select(AuditEvent).order_by(AuditEvent.timestamp.desc()).limit(200)
    ).all()
    return events


@router.get("/stats")
def get_guard_stats(session: Session = Depends(get_session)):
    """
    Returns spending metrics and counts for Allowed, Escalated, and Blocked events.
    """
    now = datetime.now(timezone.utc)
    mandate = session.exec(
        select(Mandate).where(Mandate.status == "active").order_by(Mandate.created_at.desc())
    ).first()

    if not mandate:
        return {
            "has_active_mandate": False,
            "monthly_cap_cents": 0,
            "spent_cents": 0,
            "reserved_cents": 0,
            "remaining_cents": 0,
            "allowed_count": 0,
            "escalated_count": 0,
            "blocked_count": 0,
        }

    spent_cents, reserved_cents, _ = _get_monthly_spent_and_timestamps(session, mandate.id, now)
    monthly_cap = mandate.monthly_cap_cents
    total_committed = spent_cents + reserved_cents
    remaining_cents = max(0, monthly_cap - total_committed)

    # Count events
    allowed_count = len(session.exec(
        select(AuditEvent).where(
            AuditEvent.mandate_id == mandate.id,
            AuditEvent.decision == "ALLOW",
        )
    ).all())

    escalated_count = len(session.exec(
        select(AuditEvent).where(
            AuditEvent.mandate_id == mandate.id,
            AuditEvent.decision == "ESCALATE",
        )
    ).all())

    blocked_count = len(session.exec(
        select(AuditEvent).where(
            AuditEvent.mandate_id == mandate.id,
            AuditEvent.decision == "BLOCK",
        )
    ).all())

    return {
        "has_active_mandate": True,
        "mandate_id": mandate.id,
        "signature": mandate.signature,
        "natural_language": mandate.natural_language,
        "monthly_cap_cents": monthly_cap,
        "auto_approve_under_cents": mandate.auto_approve_under_cents,
        "per_transaction_cap_cents": mandate.per_transaction_cap_cents,
        "spent_cents": spent_cents,
        "reserved_cents": reserved_cents,
        "remaining_cents": remaining_cents,
        "allowed_count": allowed_count,
        "escalated_count": escalated_count,
        "blocked_count": blocked_count,
    }

