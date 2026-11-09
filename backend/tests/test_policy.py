import uuid
from datetime import datetime, timedelta, timezone
import pytest

from app.models.mandate import Mandate
from app.models.purchase import PurchaseRequest
from app.services.policy import evaluate
from app.services.signing import sign


@pytest.fixture
def active_mandate() -> Mandate:
    now = datetime.now(timezone.utc)
    mandate = Mandate(
        id=str(uuid.uuid4()),
        user_id="demo-user",
        created_at=now,
        expires_at=now + timedelta(days=30),
        natural_language="Spend up to $150 on running gear, only Nike, Adidas, Decathlon, auto-approve under $60",
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
    return mandate


def test_allow_within_mandate(active_mandate: Mandate):
    request = PurchaseRequest(
        item_name="Trail Running Shoes",
        category="running_gear",
        merchant="Decathlon",
        unit_price_cents=4900,
        quantity=1,
    )
    decision = evaluate(active_mandate, request, spent_this_month_cents=0)
    assert decision.decision == "ALLOW"
    assert "WITHIN_MANDATE" in decision.reason_codes


def test_escalate_above_auto_approve(active_mandate: Mandate):
    request = PurchaseRequest(
        item_name="Marathon Shoes",
        category="running_gear",
        merchant="Nike",
        unit_price_cents=8000,
        quantity=1,
    )
    decision = evaluate(active_mandate, request, spent_this_month_cents=0)
    assert decision.decision == "ESCALATE"
    assert "ABOVE_AUTO_APPROVE" in decision.reason_codes


def test_boundary_exact_auto_approve(active_mandate: Mandate):
    # Exactly $60.00 should be auto-approved (rule is total > auto_approve)
    request = PurchaseRequest(
        item_name="Running Jacket",
        category="running_gear",
        merchant="Adidas",
        unit_price_cents=6000,
        quantity=1,
    )
    decision = evaluate(active_mandate, request, spent_this_month_cents=0)
    assert decision.decision == "ALLOW"
    assert "WITHIN_MANDATE" in decision.reason_codes


def test_boundary_exact_transaction_cap(active_mandate: Mandate):
    # Exactly $100.00 is allowed by per-transaction cap, but escalates since > $60
    request = PurchaseRequest(
        item_name="GPS Running Watch",
        category="running_gear",
        merchant="Decathlon",
        unit_price_cents=10000,
        quantity=1,
    )
    decision = evaluate(active_mandate, request, spent_this_month_cents=0)
    assert decision.decision == "ESCALATE"
    assert "ABOVE_AUTO_APPROVE" in decision.reason_codes


def test_block_over_transaction_cap(active_mandate: Mandate):
    request = PurchaseRequest(
        item_name="Ultra Pro Shoes",
        category="running_gear",
        merchant="Nike",
        unit_price_cents=10001,
        quantity=1,
    )
    decision = evaluate(active_mandate, request, spent_this_month_cents=0)
    assert decision.decision == "BLOCK"
    assert "OVER_TRANSACTION_CAP" in decision.reason_codes


def test_boundary_exact_monthly_cap(active_mandate: Mandate):
    # Spent $100, now buying $50 -> exactly reaches $150 cap
    request = PurchaseRequest(
        item_name="Running Shorts",
        category="running_gear",
        merchant="Adidas",
        unit_price_cents=5000,
        quantity=1,
    )
    decision = evaluate(active_mandate, request, spent_this_month_cents=10000)
    assert decision.decision == "ALLOW"


def test_block_over_monthly_cap(active_mandate: Mandate):
    # Spent $120, buying $40 -> $160 > $150 cap
    request = PurchaseRequest(
        item_name="Running Shorts",
        category="running_gear",
        merchant="Adidas",
        unit_price_cents=4000,
        quantity=1,
    )
    decision = evaluate(active_mandate, request, spent_this_month_cents=12000)
    assert decision.decision == "BLOCK"
    assert "OVER_MONTHLY_CAP" in decision.reason_codes


def test_block_monthly_cap_race_with_reserved_spend(active_mandate: Mandate):
    # User feedback item 5: spent $80 completed + $50 reserved awaiting PayPal = $130.
    # Request of $30 would make it $160 > $150 monthly cap -> must BLOCK!
    request = PurchaseRequest(
        item_name="Running Belt",
        category="running_gear",
        merchant="Decathlon",
        unit_price_cents=3000,
        quantity=1,
    )
    decision = evaluate(
        active_mandate,
        request,
        spent_this_month_cents=8000,
        reserved_pending_cents=5000,
    )
    assert decision.decision == "BLOCK"
    assert "OVER_MONTHLY_CAP" in decision.reason_codes


def test_block_invalid_signature(active_mandate: Mandate):
    # Corrupted signature
    tampered = active_mandate.model_copy(update={"signature": "deadbeef12345678"})
    request = PurchaseRequest(
        item_name="Trail Running Shoes",
        category="running_gear",
        merchant="Decathlon",
        unit_price_cents=4500,
        quantity=1,
    )
    decision = evaluate(tampered, request)
    assert decision.decision == "BLOCK"
    assert "SIGNATURE_INVALID" in decision.reason_codes


def test_block_revoked_mandate(active_mandate: Mandate):
    revoked = active_mandate.model_copy(update={"status": "revoked"})
    request = PurchaseRequest(
        item_name="Trail Running Shoes",
        category="running_gear",
        merchant="Decathlon",
        unit_price_cents=4500,
        quantity=1,
    )
    decision = evaluate(revoked, request)
    assert decision.decision == "BLOCK"
    assert "MANDATE_REVOKED" in decision.reason_codes


def test_block_expired_mandate_by_date(active_mandate: Mandate):
    now = datetime.now(timezone.utc)
    expired = active_mandate.model_copy(update={"expires_at": now - timedelta(days=1)})
    request = PurchaseRequest(
        item_name="Trail Running Shoes",
        category="running_gear",
        merchant="Decathlon",
        unit_price_cents=4500,
        quantity=1,
    )
    decision = evaluate(expired, request, now=now)
    assert decision.decision == "BLOCK"
    assert "MANDATE_EXPIRED" in decision.reason_codes


def test_block_currency_mismatch(active_mandate: Mandate):
    request = PurchaseRequest(
        item_name="Running Shoes",
        category="running_gear",
        merchant="Decathlon",
        unit_price_cents=4500,
        quantity=1,
        currency="EUR",
    )
    decision = evaluate(active_mandate, request)
    assert decision.decision == "BLOCK"
    assert "CURRENCY_MISMATCH" in decision.reason_codes


def test_block_category_blocked(active_mandate: Mandate):
    request = PurchaseRequest(
        item_name="Visa Gift Card $50",
        category="gift_cards",
        merchant="Decathlon",
        unit_price_cents=5000,
        quantity=1,
    )
    decision = evaluate(active_mandate, request)
    assert decision.decision == "BLOCK"
    assert "CATEGORY_BLOCKED" in decision.reason_codes


def test_block_category_not_allowed(active_mandate: Mandate):
    request = PurchaseRequest(
        item_name="Bluetooth Headphones",
        category="electronics",
        merchant="Decathlon",
        unit_price_cents=3500,
        quantity=1,
    )
    decision = evaluate(active_mandate, request)
    assert decision.decision == "BLOCK"
    assert "CATEGORY_NOT_ALLOWED" in decision.reason_codes


def test_block_merchant_not_allowed(active_mandate: Mandate):
    request = PurchaseRequest(
        item_name="Running T-shirt",
        category="running_gear",
        merchant="Zara",
        unit_price_cents=3000,
        quantity=1,
    )
    decision = evaluate(active_mandate, request)
    assert decision.decision == "BLOCK"
    assert "MERCHANT_NOT_ALLOWED" in decision.reason_codes


def test_block_quantity_exceeded(active_mandate: Mandate):
    request = PurchaseRequest(
        item_name="Running Socks",
        category="running_gear",
        merchant="Nike",
        unit_price_cents=1000,
        quantity=5,  # max is 3
    )
    decision = evaluate(active_mandate, request)
    assert decision.decision == "BLOCK"
    assert "QUANTITY_EXCEEDED" in decision.reason_codes


def test_block_velocity_limit(active_mandate: Mandate):
    now = datetime.now(timezone.utc)
    recent_purchases = [
        now - timedelta(seconds=10),
        now - timedelta(seconds=25),
        now - timedelta(seconds=40),
    ]
    request = PurchaseRequest(
        item_name="Energy Gel",
        category="running_gear",
        merchant="Decathlon",
        unit_price_cents=500,
        quantity=1,
    )
    decision = evaluate(
        active_mandate,
        request,
        recent_purchase_timestamps=recent_purchases,
        now=now,
    )
    assert decision.decision == "BLOCK"
    assert "VELOCITY_LIMIT" in decision.reason_codes


def test_prompt_injection_gift_card_multi_violation(active_mandate: Mandate):
    # Prompt injection attack: agent tries to buy 10 x $100 gift cards from QuickCards
    malicious_request = PurchaseRequest(
        item_name="Gift Card $100",
        category="gift_cards",
        merchant="QuickCards",
        unit_price_cents=10000,
        quantity=10,
    )
    decision = evaluate(active_mandate, malicious_request)
    assert decision.decision == "BLOCK"
    # Must collect ALL triggered block reasons
    assert "CATEGORY_BLOCKED" in decision.reason_codes
    assert "OVER_TRANSACTION_CAP" in decision.reason_codes
    assert "QUANTITY_EXCEEDED" in decision.reason_codes
    assert "MERCHANT_NOT_ALLOWED" in decision.reason_codes
    assert "OVER_MONTHLY_CAP" in decision.reason_codes

