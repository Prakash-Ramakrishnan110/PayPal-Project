import json
import uuid
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, patch
import pytest
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine

import app.models.audit  # noqa: F401
import app.models.mandate  # noqa: F401
from app.models.mandate import Mandate
from app.models.purchase import PurchaseRequest
from app.services.guard import (
    approve_pending_purchase,
    process_purchase_request,
    reject_pending_purchase,
)
from app.services.signing import sign


@pytest.fixture
def test_session():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(engine)
    with Session(engine) as session:
        yield session


@pytest.fixture
def active_mandate(test_session: Session) -> Mandate:
    now = datetime.now(timezone.utc)
    mandate = Mandate(
        id=str(uuid.uuid4()),
        user_id="demo-user",
        created_at=now,
        expires_at=now + timedelta(days=30),
        natural_language="Spend up to $150 on running gear, only Nike/Adidas/Decathlon, auto-approve under $60",
        currency="USD",
        auto_approve_under_cents=6000,       # $60.00
        per_transaction_cap_cents=10000,     # $100.00
        monthly_cap_cents=15000,             # $150.00
        allowed_categories=["running_gear"],
        allowed_merchants=["Nike", "Adidas", "Decathlon"],
        blocked_categories=["gift_cards", "cash_equivalents", "crypto"],
        max_quantity_per_item=3,
        status="active",
        signature="",
    )
    mandate.signature = sign(mandate)
    test_session.add(mandate)
    test_session.commit()
    test_session.refresh(mandate)
    return mandate


@pytest.mark.asyncio
async def test_guard_allow_under_threshold(active_mandate: Mandate, test_session: Session):
    # $49 purchase: under $60 auto-approve -> ALLOW -> creates PayPal order
    req = PurchaseRequest(
        item_name="Trail Running Shoes",
        category="running_gear",
        merchant="Decathlon",
        unit_price_cents=4900,
        quantity=1,
    )

    mock_paypal = {
        "order_id": "PP-ORDER-49",
        "status": "CREATED",
        "approve_url": "https://sandbox.paypal.com/checkout?token=49",
    }

    with patch("app.services.guard.paypal_client.create_order", new_callable=AsyncMock, return_value=mock_paypal):
        res = await process_purchase_request(req, session=test_session)
        assert res.decision == "ALLOW"
        assert res.status == "AWAITING_PAYPAL_APPROVAL"
        assert res.paypal_order_id == "PP-ORDER-49"
        assert res.approve_url == "https://sandbox.paypal.com/checkout?token=49"


@pytest.mark.asyncio
async def test_guard_escalate_above_threshold(active_mandate: Mandate, test_session: Session):
    # $79 purchase: above $60 auto-approve, within $100 cap -> ESCALATE -> queues for approval
    req = PurchaseRequest(
        item_name="Marathon Shoes",
        category="running_gear",
        merchant="Nike",
        unit_price_cents=7900,
        quantity=1,
    )

    res = await process_purchase_request(req, session=test_session)
    assert res.decision == "ESCALATE"
    assert res.status == "AWAITING_HUMAN_APPROVAL"
    assert res.pending_approval_id is not None
    assert res.paypal_order_id is None  # No PayPal order created yet!


@pytest.mark.asyncio
async def test_guard_block_over_cap(active_mandate: Mandate, test_session: Session):
    # $120 purchase: exceeds $100 per-transaction cap -> BLOCK -> never calls PayPal
    req = PurchaseRequest(
        item_name="Super Shoes",
        category="running_gear",
        merchant="Nike",
        unit_price_cents=12000,
        quantity=1,
    )

    with patch("app.services.guard.paypal_client.create_order", new_callable=AsyncMock) as mock_pp:
        res = await process_purchase_request(req, session=test_session)
        assert res.decision == "BLOCK"
        assert res.status == "BLOCKED"
        assert "OVER_TRANSACTION_CAP" in res.reason_codes
        mock_pp.assert_not_called()


@pytest.mark.asyncio
async def test_guard_block_when_mandate_revoked(active_mandate: Mandate, test_session: Session):
    active_mandate.status = "revoked"
    test_session.add(active_mandate)
    test_session.commit()

    req = PurchaseRequest(
        item_name="Running Shoes",
        category="running_gear",
        merchant="Decathlon",
        unit_price_cents=4500,
        quantity=1,
    )
    res = await process_purchase_request(req, session=test_session)
    assert res.decision == "BLOCK"


@pytest.mark.asyncio
async def test_escalate_then_approve_creates_one_order(active_mandate: Mandate, test_session: Session):
    # 1. Escalate
    req = PurchaseRequest(
        item_name="Running Watch",
        category="running_gear",
        merchant="Decathlon",
        unit_price_cents=8500,
        quantity=1,
    )
    res = await process_purchase_request(req, session=test_session)
    assert res.decision == "ESCALATE"
    approval_id = res.pending_approval_id

    # 2. Approve
    mock_paypal = {
        "order_id": "PP-HUMAN-APPROVED-85",
        "status": "CREATED",
        "approve_url": "https://sandbox.paypal.com/checkout?token=85",
    }
    with patch("app.services.guard.paypal_client.create_order", new_callable=AsyncMock, return_value=mock_paypal) as mock_create:
        approved_res = await approve_pending_purchase(approval_id, session=test_session)
        assert approved_res.decision == "ALLOW"
        assert approved_res.paypal_order_id == "PP-HUMAN-APPROVED-85"
        mock_create.assert_called_once()

        # 3. Trying to approve again must fail (idempotency check)
        with pytest.raises(ValueError):
            await approve_pending_purchase(approval_id, session=test_session)

