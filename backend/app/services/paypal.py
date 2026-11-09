import base64
import logging
import time
import uuid
from typing import Any, Dict, Optional
import httpx

from app.config import get_settings

logger = logging.getLogger(__name__)


class PayPalError(Exception):
    def __init__(
        self,
        message: str,
        status_code: int = 500,
        debug_id: Optional[str] = None,
        details: Optional[Any] = None,
    ):
        super().__init__(message)
        self.message = message
        self.status_code = status_code
        self.debug_id = debug_id
        self.details = details

    def to_dict(self) -> Dict[str, Any]:
        return {
            "error": "PayPalError",
            "message": self.message,
            "status_code": self.status_code,
            "debug_id": self.debug_id,
        }


class PayPalClient:
    def __init__(self):
        self.settings = get_settings()
        self.base_url = self.settings.PAYPAL_BASE_URL.rstrip("/")
        self._cached_token: Optional[str] = None
        self._token_expires_at: float = 0

    async def get_access_token(self) -> str:
        """
        Retrieves OAuth2 Bearer token using client_credentials.
        Caches the token until 60 seconds before expiration.
        """
        now = time.time()
        if self._cached_token and now < (self._token_expires_at - 60):
            return self._cached_token

        client_id = self.settings.PAYPAL_CLIENT_ID
        client_secret = self.settings.PAYPAL_CLIENT_SECRET

        if not client_id or not client_secret or client_id == "mock_client_id":
            raise PayPalError(
                message="PayPal credentials not configured. Please set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET in .env",
                status_code=401,
            )

        auth_header = base64.b64encode(f"{client_id}:{client_secret}".encode()).decode()
        headers = {
            "Authorization": f"Basic {auth_header}",
            "Accept": "application/json",
            "Accept-Language": "en_US",
        }
        data = {"grant_type": "client_credentials"}

        url = f"{self.base_url}/v1/oauth2/token"
        async with httpx.AsyncClient(timeout=15.0) as client:
            try:
                response = await client.post(url, headers=headers, data=data)
            except httpx.RequestError as exc:
                raise PayPalError(f"Network error connecting to PayPal token endpoint: {str(exc)}")

        if response.status_code != 200:
            debug_id = response.headers.get("paypal-debug-id")
            raise PayPalError(
                message=f"PayPal OAuth failed with status {response.status_code}: {response.text}",
                status_code=response.status_code,
                debug_id=debug_id,
            )

        token_data = response.json()
        self._cached_token = token_data.get("access_token")
        expires_in = token_data.get("expires_in", 3600)
        self._token_expires_at = now + expires_in
        return self._cached_token

    async def create_order(
        self,
        amount_cents: int,
        currency: str = "USD",
        description: str = "Mandate Guard Purchase",
        reference_id: Optional[str] = None,
        return_url: Optional[str] = None,
        cancel_url: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Creates a PayPal checkout order (v2/checkout/orders) with intent CAPTURE.
        Returns: { order_id, status, approve_url }
        """
        token = await self.get_access_token()
        ref_id = reference_id or str(uuid.uuid4())
        ret_url = return_url or f"{self.settings.FRONTEND_URL}/paypal/return"
        can_url = cancel_url or f"{self.settings.FRONTEND_URL}/paypal/cancel"

        amount_str = f"{amount_cents / 100:.2f}"

        payload = {
            "intent": "CAPTURE",
            "purchase_units": [
                {
                    "reference_id": ref_id,
                    "description": description[:127],
                    "amount": {
                        "currency_code": currency.upper(),
                        "value": amount_str,
                    },
                }
            ],
            "payment_source": {
                "paypal": {
                    "experience_context": {
                        "payment_method_preference": "IMMEDIATE_PAYMENT_REQUIRED",
                        "brand_name": "Mandate Guard",
                        "locale": "en-US",
                        "landing_page": "LOGIN",
                        "user_action": "PAY_NOW",
                        "return_url": ret_url,
                        "cancel_url": can_url,
                    }
                }
            },
        }

        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "PayPal-Request-Id": f"req-{ref_id}",
        }

        url = f"{self.base_url}/v2/checkout/orders"
        async with httpx.AsyncClient(timeout=20.0) as client:
            try:
                response = await client.post(url, headers=headers, json=payload)
            except httpx.RequestError as exc:
                raise PayPalError(f"Network error creating PayPal order: {str(exc)}")

        debug_id = response.headers.get("paypal-debug-id")
        if response.status_code not in (200, 201):
            raise PayPalError(
                message=f"PayPal order creation failed ({response.status_code}): {response.text}",
                status_code=response.status_code,
                debug_id=debug_id,
            )

        data = response.json()
        order_id = data.get("id")
        status = data.get("status")

        # Extract approval URL
        approve_url = None
        for link in data.get("links", []):
            if link.get("rel") in ("payer-action", "approve"):
                approve_url = link.get("href")
                break

        return {
            "order_id": order_id,
            "status": status,
            "approve_url": approve_url,
            "raw": data,
        }

    async def get_order(self, order_id: str) -> Dict[str, Any]:
        """
        Retrieves order details from GET /v2/checkout/orders/{order_id}.
        """
        token = await self.get_access_token()
        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        }
        url = f"{self.base_url}/v2/checkout/orders/{order_id}"

        async with httpx.AsyncClient(timeout=15.0) as client:
            try:
                response = await client.get(url, headers=headers)
            except httpx.RequestError as exc:
                raise PayPalError(f"Network error fetching PayPal order: {str(exc)}")

        debug_id = response.headers.get("paypal-debug-id")
        if response.status_code != 200:
            raise PayPalError(
                message=f"Failed to fetch order ({response.status_code}): {response.text}",
                status_code=response.status_code,
                debug_id=debug_id,
            )

        return response.json()

    async def capture_order(self, order_id: str) -> Dict[str, Any]:
        """
        Captures authorized payment from POST /v2/checkout/orders/{order_id}/capture.
        Returns: { capture_id, status, amount_cents, currency }
        """
        token = await self.get_access_token()
        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "PayPal-Request-Id": f"cap-{order_id}-{uuid.uuid4().hex[:8]}",
        }
        url = f"{self.base_url}/v2/checkout/orders/{order_id}/capture"

        async with httpx.AsyncClient(timeout=20.0) as client:
            try:
                response = await client.post(url, headers=headers, json={})
            except httpx.RequestError as exc:
                raise PayPalError(f"Network error capturing PayPal order: {str(exc)}")

        debug_id = response.headers.get("paypal-debug-id")
        if response.status_code not in (200, 201):
            raise PayPalError(
                message=f"PayPal order capture failed ({response.status_code}): {response.text}",
                status_code=response.status_code,
                debug_id=debug_id,
            )

        data = response.json()
        capture_id = None
        amount_cents = 0
        currency = "USD"

        # Dig into purchase units to locate capture details
        purchase_units = data.get("purchase_units", [])
        if purchase_units:
            captures = purchase_units[0].get("payments", {}).get("captures", [])
            if captures:
                capture = captures[0]
                capture_id = capture.get("id")
                currency = capture.get("amount", {}).get("currency_code", "USD")
                val_str = capture.get("amount", {}).get("value", "0.00")
                amount_cents = int(round(float(val_str) * 100))

        return {
            "capture_id": capture_id or data.get("id"),
            "status": data.get("status"),
            "amount_cents": amount_cents,
            "currency": currency,
            "raw": data,
        }


# Singleton instance
paypal_client = PayPalClient()

