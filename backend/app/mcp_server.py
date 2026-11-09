import json
from datetime import datetime, timezone
from typing import Any, Dict, List
from mcp.server.fastmcp import FastMCP
from sqlmodel import Session, select

from app.database import engine
from app.models.audit import PendingApproval
from app.models.mandate import Mandate
from app.models.purchase import PurchaseRequest
from app.services.guard import _get_monthly_spent_and_timestamps, process_purchase_request

# Initialize FastMCP Server
mcp = FastMCP("Mandate Guard")


@mcp.tool()
async def get_mandate_status() -> Dict[str, Any]:
    """
    Get the currently active spending mandate constraints, monthly budget,
    and remaining balance.
    """
    with Session(engine) as session:
        mandate = session.exec(
            select(Mandate).where(Mandate.status == "active").order_by(Mandate.created_at.desc())
        ).first()

        if not mandate:
            return {
                "active": False,
                "message": "No active spending mandate found. All purchases will be blocked.",
            }

        now = datetime.now(timezone.utc)
        spent, reserved, _ = _get_monthly_spent_and_timestamps(session, mandate.id, now)
        remaining = max(0, mandate.monthly_cap_cents - (spent + reserved))

        return {
            "active": True,
            "mandate_id": mandate.id,
            "rule": mandate.natural_language,
            "monthly_cap_dollars": mandate.monthly_cap_cents / 100,
            "spent_this_month_dollars": spent / 100,
            "reserved_dollars": reserved / 100,
            "remaining_budget_dollars": remaining / 100,
            "auto_approve_under_dollars": mandate.auto_approve_under_cents / 100,
            "per_transaction_cap_dollars": mandate.per_transaction_cap_cents / 100,
            "allowed_merchants": mandate.allowed_merchants,
            "allowed_categories": mandate.allowed_categories,
            "blocked_categories": mandate.blocked_categories,
        }


@mcp.tool()
async def request_purchase(
    item_name: str,
    category: str,
    merchant: str,
    unit_price_cents: int,
    quantity: int = 1,
    currency: str = "USD",
) -> Dict[str, Any]:
    """
    Request authorization to purchase an item.
    Evaluated deterministically by Mandate Guard outside the LLM.
    Returns decision: 'ALLOW', 'ESCALATE' (requires human approval), or 'BLOCK'.
    """
    req = PurchaseRequest(
        item_name=item_name,
        category=category,
        merchant=merchant,
        unit_price_cents=unit_price_cents,
        quantity=quantity,
        currency=currency,
        requested_by_agent="mcp-agent",
        source_context="Requested via Mandate Guard MCP Server",
    )

    result = await process_purchase_request(req)
    return result.model_dump()


@mcp.tool()
async def list_pending_approvals() -> List[Dict[str, Any]]:
    """
    List purchase requests that exceeded auto-approve thresholds and are
    waiting for human authorization.
    """
    with Session(engine) as session:
        pending = session.exec(
            select(PendingApproval).where(PendingApproval.status == "pending")
        ).all()

        return [
            {
                "id": p.id,
                "item_name": p.item_name,
                "merchant": p.merchant,
                "amount_dollars": p.amount_cents / 100,
                "timestamp": p.timestamp.isoformat(),
                "status": p.status,
            }
            for p in pending
        ]


if __name__ == "__main__":
    mcp.run()
