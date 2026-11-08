import uuid
from datetime import datetime, timezone
from typing import List, Optional
from sqlalchemy import Column, JSON
from sqlmodel import Field as SQLField, SQLModel


class AuditEvent(SQLModel, table=True):
    __tablename__ = "audit_events"

    id: str = SQLField(default_factory=lambda: str(uuid.uuid4()), primary_key=True, index=True)
    timestamp: datetime = SQLField(default_factory=lambda: datetime.now(timezone.utc), index=True)
    mandate_id: Optional[str] = SQLField(default=None, index=True)
    event_type: str = SQLField(index=True)  # "PURCHASE_REQUEST", "PURCHASE_ALLOWED", "PURCHASE_ESCALATED", "PURCHASE_BLOCKED", "PURCHASE_COMPLETED", "MANDATE_CREATED", "MANDATE_REVOKED"
    decision: Optional[str] = SQLField(default=None, index=True)  # "ALLOW" | "ESCALATE" | "BLOCK"
    reason_codes: List[str] = SQLField(default_factory=list, sa_column=Column(JSON))
    amount_cents: Optional[int] = SQLField(default=None)
    merchant: Optional[str] = SQLField(default=None)
    category: Optional[str] = SQLField(default=None)
    item_name: Optional[str] = SQLField(default=None)
    payload_json: Optional[str] = SQLField(default=None)
    paypal_order_id: Optional[str] = SQLField(default=None, index=True)


class PendingApproval(SQLModel, table=True):
    __tablename__ = "pending_approvals"

    id: str = SQLField(default_factory=lambda: str(uuid.uuid4()), primary_key=True, index=True)
    timestamp: datetime = SQLField(default_factory=lambda: datetime.now(timezone.utc), index=True)
    mandate_id: str = SQLField(index=True)
    request_payload_json: str = SQLField(...)
    amount_cents: int = SQLField(...)
    merchant: str = SQLField(...)
    item_name: str = SQLField(...)
    status: str = SQLField(default="pending", index=True)  # "pending" | "approved" | "rejected"
