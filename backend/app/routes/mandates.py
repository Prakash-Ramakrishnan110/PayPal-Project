import json
from datetime import datetime, timezone
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlmodel import Session, select

from app.agent.compiler import compile_mandate, create_mandate_from_draft
from app.database import get_session
from app.models.audit import AuditEvent
from app.models.mandate import Mandate, MandateDraft

router = APIRouter(prefix="/mandates", tags=["mandates"])


class DraftRequest(BaseModel):
    text: str = Field(..., min_length=3, description="Natural language spending rule")


@router.post("/draft", response_model=MandateDraft)
def create_draft(body: DraftRequest):
    """
    Compiles user's natural language spending rule into a structured draft (NOT saved yet).
    """
    try:
        draft = compile_mandate(body.text)
        return draft
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Gemini compiler error: {str(e)}")


@router.post("", response_model=Mandate)
def activate_mandate(draft: MandateDraft, session: Session = Depends(get_session)):
    """
    Converts draft to cents, validates constraints, cryptographically signs,
    saves to database, and marks as the active mandate.
    Revokes any previous active mandates for this user.
    """
    try:
        # Revoke existing active mandates for this user
        existing_active = session.exec(
            select(Mandate).where(Mandate.status == "active")
        ).all()
        for m in existing_active:
            m.status = "revoked"
            session.add(m)

        # Create, validate, and sign new mandate
        new_mandate = create_mandate_from_draft(draft)
        session.add(new_mandate)

        # Record audit event
        audit = AuditEvent(
            timestamp=datetime.now(timezone.utc),
            mandate_id=new_mandate.id,
            event_type="MANDATE_CREATED",
            decision="ALLOW",
            reason_codes=["MANDATE_ACTIVATED"],
            amount_cents=new_mandate.monthly_cap_cents,
            payload_json=json.dumps(draft.model_dump()),
        )
        session.add(audit)

        session.commit()
        session.refresh(new_mandate)
        return new_mandate

    except ValueError as e:
        session.rollback()
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        session.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to activate mandate: {str(e)}")


@router.get("/active", response_model=Optional[Mandate])
def get_active_mandate(session: Session = Depends(get_session)):
    """
    Returns the currently active mandate, or None if none is active.
    """
    mandate = session.exec(
        select(Mandate).where(Mandate.status == "active").order_by(Mandate.created_at.desc())
    ).first()
    return mandate


@router.get("/{mandate_id}", response_model=Mandate)
def get_mandate_by_id(mandate_id: str, session: Session = Depends(get_session)):
    """
    Returns a specific mandate by ID.
    """
    mandate = session.get(Mandate, mandate_id)
    if not mandate:
        raise HTTPException(status_code=404, detail="Mandate not found")
    return mandate


@router.post("/{mandate_id}/revoke", response_model=Mandate)
def revoke_mandate(mandate_id: str, session: Session = Depends(get_session)):
    """
    Kill Switch: immediately revokes an active mandate and logs an audit event.
    """
    mandate = session.get(Mandate, mandate_id)
    if not mandate:
        raise HTTPException(status_code=404, detail="Mandate not found")

    if mandate.status != "revoked":
        mandate.status = "revoked"
        session.add(mandate)

        audit = AuditEvent(
            timestamp=datetime.now(timezone.utc),
            mandate_id=mandate.id,
            event_type="MANDATE_REVOKED",
            decision="BLOCK",
            reason_codes=["KILL_SWITCH_ACTIVATED"],
            payload_json=json.dumps({"revoked_at": datetime.now(timezone.utc).isoformat()}),
        )
        session.add(audit)

        session.commit()
        session.refresh(mandate)

    return mandate
