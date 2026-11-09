import json
from unittest.mock import MagicMock, patch
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine

import app.models.audit  # noqa: F401
import app.models.mandate  # noqa: F401
from app.agent.compiler import compile_mandate, create_mandate_from_draft
from app.database import get_session
from app.main import app as fastapi_app
from app.models.mandate import MandateDraft
from app.services.signing import verify


@pytest.fixture
def mock_gemini_response():
    draft_data = {
        "natural_language": "Spend up to $150 this month on running gear, only from Nike, Adidas and Decathlon, auto-approve under $60",
        "currency": "USD",
        "auto_approve_under_dollars": 60.0,
        "per_transaction_cap_dollars": 100.0,
        "monthly_cap_dollars": 150.0,
        "allowed_categories": ["running_gear"],
        "allowed_merchants": ["Nike", "Adidas", "Decathlon"],
        "blocked_categories": ["gift_cards", "cash_equivalents", "crypto"],
        "max_quantity_per_item": 3,
        "expires_in_days": 30,
        "summary": "Monthly spend up to $150 on running gear from approved athletic brands with $60 auto-approval threshold.",
        "assumptions": ["Defaulted transaction cap to $100 (50% above auto-approve)."],
    }
    mock_resp = MagicMock()
    mock_resp.text = json.dumps(draft_data)
    return mock_resp


def test_compile_mandate_mocked(mock_gemini_response):
    mock_client = MagicMock()
    mock_client.models.generate_content.return_value = mock_gemini_response

    with patch("app.agent.compiler.get_genai_client", return_value=mock_client):
        draft = compile_mandate(
            "Spend up to $150 this month on running gear, only from Nike, Adidas and Decathlon, auto-approve under $60"
        )
        assert isinstance(draft, MandateDraft)
        assert draft.monthly_cap_dollars == 150.0
        assert draft.auto_approve_under_dollars == 60.0
        assert "Nike" in draft.allowed_merchants
        assert "running_gear" in draft.allowed_categories


def test_create_mandate_from_draft_conversion(mock_gemini_response):
    draft_dict = json.loads(mock_gemini_response.text)
    draft = MandateDraft(**draft_dict)

    mandate = create_mandate_from_draft(draft)
    # Check conversion from dollars to integer cents
    assert mandate.auto_approve_under_cents == 6000
    assert mandate.per_transaction_cap_cents == 10000
    assert mandate.monthly_cap_cents == 15000
    assert mandate.status == "active"
    assert bool(mandate.signature)
    # Verify cryptographic signature is valid
    assert verify(mandate) is True


def test_mandate_api_routes(mock_gemini_response):
    # Use isolated in-memory DB with StaticPool for test
    test_engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(test_engine)

    def override_get_session():
        with Session(test_engine) as session:
            yield session

    fastapi_app.dependency_overrides[get_session] = override_get_session
    client = TestClient(fastapi_app)

    try:
        mock_ai_client = MagicMock()
        mock_ai_client.models.generate_content.return_value = mock_gemini_response

        # 1. Draft endpoint
        with patch("app.agent.compiler.get_genai_client", return_value=mock_ai_client):
            resp = client.post("/mandates/draft", json={"text": "Spend up to $150 on running gear"})
            assert resp.status_code == 200
            draft_json = resp.json()
            assert draft_json["monthly_cap_dollars"] == 150.0

        # 2. Activate endpoint
        resp = client.post("/mandates", json=draft_json)
        assert resp.status_code == 200
        mandate_json = resp.json()
        assert mandate_json["status"] == "active"
        mandate_id = mandate_json["id"]
        assert mandate_json["monthly_cap_cents"] == 15000

        # 3. Active mandate check
        resp = client.get("/mandates/active")
        assert resp.status_code == 200
        assert resp.json()["id"] == mandate_id

        # 4. Kill switch / Revoke
        resp = client.post(f"/mandates/{mandate_id}/revoke")
        assert resp.status_code == 200
        assert resp.json()["status"] == "revoked"

        # 5. Active mandate check after revoke
        resp = client.get("/mandates/active")
        assert resp.status_code == 200
        assert resp.json() is None

    finally:
        fastapi_app.dependency_overrides.clear()
