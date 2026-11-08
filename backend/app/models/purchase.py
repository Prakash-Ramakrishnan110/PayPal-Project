from typing import Optional
from pydantic import BaseModel, Field


class PurchaseRequest(BaseModel):
    item_name: str = Field(..., description="Name of the product requested")
    category: str = Field(..., description="Category of the product")
    merchant: str = Field(..., description="Merchant name")
    unit_price_cents: int = Field(..., gt=0, description="Price per unit in integer cents")
    quantity: int = Field(default=1, gt=0, description="Quantity of items")
    currency: str = Field(default="USD", description="Currency code (USD)")
    requested_by_agent: str = Field(default="gemini-shopper", description="Agent identifier")
    source_context: Optional[str] = Field(default=None, description="Context or listing notes")

    @property
    def total_price_cents(self) -> int:
        return self.unit_price_cents * self.quantity
