import json
import os
import sys
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

# Add backend directory to sys.path
backend_path = Path(__file__).resolve().parent.parent / "backend"
sys.path.insert(0, str(backend_path))

from sqlmodel import Session, SQLModel, create_engine, select
from app.config import get_settings
from app.database import engine, init_db
from app.models.audit import AuditEvent, PendingApproval
from app.models.mandate import Mandate
from app.services.signing import sign


def seed_demo_environment():
    settings = get_settings()
    print("=" * 65)
    print("MANDATE GUARD: SEEDING DEMO ENVIRONMENT")
    print("=" * 65)

    # 1. Reset database tables
    print("\nStep 1: Re-initializing SQLite tables...")
    SQLModel.metadata.drop_all(engine)
    SQLModel.metadata.create_all(engine)
    print("[OK] Database tables refreshed cleanly.")

    # 2. Create the demo mandate
    print("\nStep 2: Creating and signing standard demo mandate...")
    now = datetime.now(timezone.utc)
    demo_mandate = Mandate(
        id=str(uuid.uuid4()),
        user_id="demo-user",
        created_at=now,
        expires_at=now + timedelta(days=30),
        natural_language="Spend up to $150 this month on running gear, only from Nike, Adidas and Decathlon, auto-approve under $60",
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
    demo_mandate.signature = sign(demo_mandate)

    with Session(engine) as session:
        session.add(demo_mandate)

        # Record mandate created audit event
        audit_mandate = AuditEvent(
            timestamp=now,
            mandate_id=demo_mandate.id,
            event_type="MANDATE_CREATED",
            decision="ALLOW",
            reason_codes=["MANDATE_ACTIVATED"],
            amount_cents=15000,
            payload_json=json.dumps({"seeded": True, "rule": demo_mandate.natural_language}),
        )
        session.add(audit_mandate)
        session.commit()
        session.refresh(demo_mandate)

    print(f"[OK] Demo Mandate Activated:")
    print(f"  Mandate ID  : {demo_mandate.id}")
    print(f"  Monthly Cap : $150.00 USD")
    print(f"  Auto-Approve: < $60.00 USD")
    print(f"  HMAC Sign   : {demo_mandate.signature[:16]}... (valid)")

    print("\n" + "=" * 65)
    print("READY FOR DEMO / VIDEO RECORDING!")
    print("1. Start both servers:   powershell -File scripts/dev.ps1")
    print("2. Open Frontend     :   http://localhost:5173")
    print("3. Shopping Agent    :   http://localhost:5173/agent")
    print("4. Red Team Attack   :   Click '🚨 Red Team: Poisoned Socks Listing'")
    print("   Watch Mandate Guard deterministically BLOCK the $1,000 gift card attack!")
    print("=" * 65)


if __name__ == "__main__":
    seed_demo_environment()
