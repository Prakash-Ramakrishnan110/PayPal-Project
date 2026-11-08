import uuid
from datetime import datetime, timedelta, timezone
import pytest
from sqlmodel import Session, SQLModel, create_engine, select

from app.models.mandate import Mandate, validate_mandate_limits
from app.services.signing import canonicalize, sign, verify


@pytest.fixture
def sample_mandate() -> Mandate:
    now = datetime.now(timezone.utc)
    mandate = Mandate(
        id=str(uuid.uuid4()),
        user_id="demo-user",
        created_at=now,
        expires_at=now + timedelta(days=30),
        natural_language="Spend up to $150 on running gear, auto-approve under $60",
        currency="USD",
        auto_approve_under_cents=6000,
        per_transaction_cap_cents=10000,
        monthly_cap_cents=15000,
        allowed_categories=["running_gear", "apparel"],
        allowed_merchants=["Nike", "Adidas", "Decathlon"],
        blocked_categories=["gift_cards", "cash_equivalents", "crypto"],
        max_quantity_per_item=3,
        status="active",
        signature="",
    )
    mandate.signature = sign(mandate)
    return mandate


def test_sign_and_verify_roundtrip(sample_mandate: Mandate):
    assert verify(sample_mandate) is True


def test_tampering_fails_verification(sample_mandate: Mandate):
    # Tamper with per_transaction_cap_cents
    tampered_mandate = sample_mandate.model_copy(update={"per_transaction_cap_cents": 20000})
    assert verify(tampered_mandate) is False

    # Tamper with categories
    tampered_cat = sample_mandate.model_copy(update={"allowed_categories": ["gift_cards"]})
    assert verify(tampered_cat) is False

    # Tamper with merchant
    tampered_merchant = sample_mandate.model_copy(update={"allowed_merchants": ["UnknownStore"]})
    assert verify(tampered_merchant) is False

    # Tamper with quantity limit
    tampered_qty = sample_mandate.model_copy(update={"max_quantity_per_item": 10})
    assert verify(tampered_qty) is False


def test_status_change_does_not_break_verification(sample_mandate: Mandate):
    # Revoking or expiring a mandate does not invalidate the cryptographic HMAC
    revoked = sample_mandate.model_copy(update={"status": "revoked"})
    assert verify(revoked) is True

    expired = sample_mandate.model_copy(update={"status": "expired"})
    assert verify(expired) is True


def test_list_ordering_does_not_break_verification(sample_mandate: Mandate):
    # Changing order in allowed categories should produce the same canonical string
    reordered = sample_mandate.model_copy(
        update={"allowed_categories": ["apparel", "running_gear"]}
    )
    assert canonicalize(sample_mandate) == canonicalize(reordered)
    assert verify(reordered) is True


def test_database_persistence_roundtrip(sample_mandate: Mandate):
    # Use in-memory SQLite database
    test_engine = create_engine("sqlite:///:memory:")
    SQLModel.metadata.create_all(test_engine)

    with Session(test_engine) as session:
        session.add(sample_mandate)
        session.commit()

        # Reload from database
        reloaded = session.exec(select(Mandate).where(Mandate.id == sample_mandate.id)).first()
        assert reloaded is not None
        assert reloaded.signature == sample_mandate.signature
        # Crucial check: verify must survive SQLite datetime timezone stripping and JSON reload
        assert verify(reloaded) is True


def test_validate_mandate_limits():
    # Valid ordering
    validate_mandate_limits(5000, 10000, 15000)

    # Invalid ordering: auto_approve > per_transaction
    with pytest.raises(ValueError):
        validate_mandate_limits(12000, 10000, 15000)

    # Invalid ordering: per_transaction > monthly
    with pytest.raises(ValueError):
        validate_mandate_limits(5000, 20000, 15000)

    # Invalid: non-positive amounts
    with pytest.raises(ValueError):
        validate_mandate_limits(0, 1000, 2000)
