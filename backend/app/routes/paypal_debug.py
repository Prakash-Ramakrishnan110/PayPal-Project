from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.services.paypal import PayPalError, paypal_client

router = APIRouter(prefix="/dev/paypal", tags=["paypal-debug"])


class TestOrderRequest(BaseModel):
    amount_cents: int = Field(default=100, description="Amount in integer cents (default $1.00 = 100)")
    description: str = Field(default="Mandate Guard Sandbox Test Order", description="Order description")


@router.post("/test-order")
async def create_test_order(body: TestOrderRequest = TestOrderRequest()):
    """
    Development test endpoint: creates a PayPal Sandbox order and returns the approval URL.
    """
    try:
        result = await paypal_client.create_order(
            amount_cents=body.amount_cents,
            description=body.description,
        )
        return {
            "success": True,
            "order_id": result["order_id"],
            "status": result["status"],
            "approve_url": result["approve_url"],
        }
    except PayPalError as exc:
        raise HTTPException(
            status_code=exc.status_code if 400 <= exc.status_code < 600 else 500,
            detail=exc.to_dict(),
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail={"error": str(e)})


@router.post("/capture/{order_id}")
async def capture_test_order(order_id: str):
    """
    Development test endpoint: captures an approved order by ID.
    """
    try:
        result = await paypal_client.capture_order(order_id=order_id)
        return {
            "success": True,
            "order_id": order_id,
            "status": result["status"],
            "capture_id": result["capture_id"],
            "amount_cents": result["amount_cents"],
        }
    except PayPalError as exc:
        raise HTTPException(
            status_code=exc.status_code if 400 <= exc.status_code < 600 else 500,
            detail=exc.to_dict(),
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail={"error": str(e)})
