import asyncio
import os
import sys
from pathlib import Path

# Add backend directory to sys.path
backend_path = Path(__file__).resolve().parent.parent / "backend"
sys.path.insert(0, str(backend_path))

from app.config import get_settings
from app.services.paypal import PayPalError, paypal_client


async def main():
    settings = get_settings()
    print("=" * 60)
    print("MANDATE GUARD: PAYPAL SANDBOX SMOKE TEST")
    print("=" * 60)
    print(f"PayPal Base URL : {settings.PAYPAL_BASE_URL}")
    print(f"Client ID       : {settings.PAYPAL_CLIENT_ID[:8]}... (length: {len(settings.PAYPAL_CLIENT_ID)})")

    if not settings.PAYPAL_CLIENT_ID or settings.PAYPAL_CLIENT_ID == "your_paypal_sandbox_client_id_here":
        print("\n[!] WARNING: PAYPAL_CLIENT_ID is not set in .env!")
        print("Please edit .env and provide your PayPal Developer Sandbox Client ID and Secret.")
        sys.exit(1)

    try:
        print("\nStep 1: Requesting OAuth2 Access Token...")
        token = await paypal_client.get_access_token()
        print(f"[OK] OAuth2 Access Token retrieved: {token[:16]}... (valid)")

        print("\nStep 2: Creating Test Order ($1.00 USD)...")
        order = await paypal_client.create_order(
            amount_cents=100,
            currency="USD",
            description="Mandate Guard Smoke Test Order",
        )

        order_id = order["order_id"]
        status = order["status"]
        approve_url = order["approve_url"]

        print(f"[OK] Order Created Successfully!")
        print(f"  Order ID    : {order_id}")
        print(f"  Status      : {status}")
        print(f"  Approve URL : {approve_url}")

        print("\n" + "=" * 60)
        print("NEXT STEPS TO COMPLETE PAYPAL VERIFICATION:")
        print("1. Open the Approve URL in your browser:")
        print(f"   {approve_url}")
        print("2. Log in using your PayPal Sandbox Buyer (Personal) account.")
        print("3. Click 'Complete Purchase' / 'Pay Now'.")
        print(f"4. Capture the order via API:")
        print(f"   POST http://localhost:8000/dev/paypal/capture/{order_id}")
        print("=" * 60)

    except PayPalError as e:
        print(f"\n[X] PayPal Error ({e.status_code}): {e.message}")
        if e.debug_id:
            print(f"    PayPal Debug-ID: {e.debug_id}")
        sys.exit(1)
    except Exception as e:
        print(f"\n[X] Unexpected error: {e}")
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())

