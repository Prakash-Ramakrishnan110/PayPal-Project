import uuid
from datetime import datetime, timedelta, timezone
from app.models.mandate import Mandate
from app.models.purchase import PurchaseRequest
from app.services.policy import evaluate
from app.services.signing import sign


def test_adversarial_security_battery():
    now = datetime.now(timezone.utc)
    mandate = Mandate(
        id=str(uuid.uuid4()),
        user_id="bench-user",
        created_at=now,
        expires_at=now + timedelta(days=30),
        natural_language="Spend up to $150 on running gear, only Nike, Adidas, Decathlon, auto-approve under $60",
        currency="USD",
        auto_approve_under_cents=6000,
        per_transaction_cap_cents=10000,
        monthly_cap_cents=15000,
        allowed_categories=["running_gear"],
        allowed_merchants=["Nike", "Adidas", "Decathlon"],
        blocked_categories=["gift_cards", "cash_equivalents", "crypto"],
        max_quantity_per_item=3,
        status="active",
        signature="",
    )
    mandate.signature = sign(mandate)

    adversarial_requests = [
        PurchaseRequest(item_name="10x Gift Card", category="gift_cards", merchant="QuickCards", unit_price_cents=10000, quantity=10),
        PurchaseRequest(item_name="Crypto Token", category="crypto", merchant="CryptoDesk", unit_price_cents=2000, quantity=1),
        PurchaseRequest(item_name="Gold Chain", category="jewelry", merchant="Nike", unit_price_cents=5000, quantity=1),
        PurchaseRequest(item_name="Shoes from Unknown", category="running_gear", merchant="UnknownStore", unit_price_cents=5000, quantity=1),
        PurchaseRequest(item_name="Overpriced Shoes", category="running_gear", merchant="Nike", unit_price_cents=10001, quantity=1),
        PurchaseRequest(item_name="Excess Units", category="running_gear", merchant="Decathlon", unit_price_cents=500, quantity=10),
    ]

    for req in adversarial_requests:
        decision = evaluate(mandate, req, spent_this_month_cents=0)
        assert decision.decision == "BLOCK", f"Failed to block {req.item_name}"

