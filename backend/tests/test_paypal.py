from unittest.mock import AsyncMock, MagicMock, patch
import pytest

from app.services.paypal import PayPalClient, PayPalError


@pytest.fixture
def client():
    c = PayPalClient()
    c.settings.PAYPAL_CLIENT_ID = "test_client_id"
    c.settings.PAYPAL_CLIENT_SECRET = "test_client_secret"
    return c


@pytest.mark.asyncio
async def test_get_access_token(client):
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {
        "access_token": "mock_access_token_12345",
        "expires_in": 3600,
    }

    with patch("httpx.AsyncClient.post", new_callable=AsyncMock, return_value=mock_resp):
        token = await client.get_access_token()
        assert token == "mock_access_token_12345"
        # Second call should use cache
        token2 = await client.get_access_token()
        assert token2 == "mock_access_token_12345"


@pytest.mark.asyncio
async def test_create_order(client):
    client._cached_token = "valid_token"
    client._token_expires_at = 9999999999.0

    mock_resp = MagicMock()
    mock_resp.status_code = 201
    mock_resp.headers = {"paypal-debug-id": "dbg-1234"}
    mock_resp.json.return_value = {
        "id": "ORDER-987654",
        "status": "CREATED",
        "links": [
            {"rel": "self", "href": "https://api.sandbox.paypal.com/v2/checkout/orders/ORDER-987654"},
            {"rel": "payer-action", "href": "https://www.sandbox.paypal.com/checkoutnow?token=ORDER-987654"},
        ],
    }

    with patch("httpx.AsyncClient.post", new_callable=AsyncMock, return_value=mock_resp) as mock_post:
        result = await client.create_order(
            amount_cents=5900,
            currency="USD",
            description="Trail Running Shoes",
        )
        assert result["order_id"] == "ORDER-987654"
        assert result["status"] == "CREATED"
        assert result["approve_url"] == "https://www.sandbox.paypal.com/checkoutnow?token=ORDER-987654"

        # Check payload sent
        call_kwargs = mock_post.call_args.kwargs
        payload = call_kwargs["json"]
        assert payload["purchase_units"][0]["amount"]["value"] == "59.00"
        assert "payment_source" in payload


@pytest.mark.asyncio
async def test_capture_order(client):
    client._cached_token = "valid_token"
    client._token_expires_at = 9999999999.0

    mock_resp = MagicMock()
    mock_resp.status_code = 201
    mock_resp.headers = {"paypal-debug-id": "dbg-cap-5678"}
    mock_resp.json.return_value = {
        "id": "ORDER-987654",
        "status": "COMPLETED",
        "purchase_units": [
            {
                "payments": {
                    "captures": [
                        {
                            "id": "CAP-112233",
                            "status": "COMPLETED",
                            "amount": {"currency_code": "USD", "value": "59.00"},
                        }
                    ]
                }
            }
        ],
    }

    with patch("httpx.AsyncClient.post", new_callable=AsyncMock, return_value=mock_resp):
        result = await client.capture_order("ORDER-987654")
        assert result["capture_id"] == "CAP-112233"
        assert result["status"] == "COMPLETED"
        assert result["amount_cents"] == 5900


@pytest.mark.asyncio
async def test_paypal_error_handling(client):
    client._cached_token = "valid_token"
    client._token_expires_at = 9999999999.0

    mock_resp = MagicMock()
    mock_resp.status_code = 400
    mock_resp.text = '{"name":"INVALID_REQUEST","message":"Invalid currency"}'
    mock_resp.headers = {"paypal-debug-id": "dbg-error-99"}

    with patch("httpx.AsyncClient.post", new_callable=AsyncMock, return_value=mock_resp):
        with pytest.raises(PayPalError) as exc_info:
            await client.create_order(amount_cents=100)
        assert exc_info.value.status_code == 400
        assert exc_info.value.debug_id == "dbg-error-99"
