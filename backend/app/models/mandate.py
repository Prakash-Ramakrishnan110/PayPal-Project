import uuid
from datetime import datetime, timezone
from typing import List, Optional
from pydantic import BaseModel, Field, model_validator
from sqlalchemy import Column, JSON
from sqlmodel import Field as SQLField, SQLModel


def default_blocked_categories() -> List[str]:
    return ["gift_cards", "cash_equivalents", "crypto"]


def validate_mandate_limits(
    auto_approve_under_cents: int,
    per_transaction_cap_cents: int,
    monthly_cap_cents: int,
) -> None:
    if auto_approve_under_cents <= 0:
        raise ValueError("auto_approve_under_cents must be greater than 0")
    if per_transaction_cap_cents <= 0:
        raise ValueError("per_transaction_cap_cents must be greater than 0")
    if monthly_cap_cents <= 0:
        raise ValueError("monthly_cap_cents must be greater than 0")
    if not (auto_approve_under_cents <= per_transaction_cap_cents <= monthly_cap_cents):
        raise ValueError(
            f"Invalid cap ordering: auto_approve_under_cents ({auto_approve_under_cents}) "
            f"must be <= per_transaction_cap_cents ({per_transaction_cap_cents}) "
            f"must be <= monthly_cap_cents ({monthly_cap_cents})"
        )


class MandateDraft(BaseModel):
    natural_language: str = Field(..., description="Original plain text spending rule")
    currency: str = Field(default="USD", description="Currency code, e.g. USD")
    auto_approve_under_dollars: float = Field(..., description="Auto approval threshold in dollars")
    per_transaction_cap_dollars: float = Field(..., description="Max amount per purchase in dollars")
    monthly_cap_dollars: float = Field(..., description="Max monthly spend in dollars")
    allowed_categories: List[str] = Field(default_factory=list, description="Allowed categories (empty = any non-blocked)")
    allowed_merchants: List[str] = Field(default_factory=list, description="Allowed merchants (empty = any)")
    blocked_categories: List[str] = Field(default_factory=default_blocked_categories, description="Blocked categories")
    max_quantity_per_item: int = Field(default=3, description="Max units allowed per item")
    expires_in_days: int = Field(default=30, description="Mandate validity period in days")
    summary: str = Field(..., description="Plain-English summary of the compiled mandate")
    assumptions: List[str] = Field(default_factory=list, description="Assumptions or defaults applied")

    @model_validator(mode="after")
    def validate_caps(self) -> "MandateDraft":
        if self.auto_approve_under_dollars <= 0:
            raise ValueError("auto_approve_under_dollars must be greater than 0")
        if self.per_transaction_cap_dollars <= 0:
            raise ValueError("per_transaction_cap_dollars must be greater than 0")
        if self.monthly_cap_dollars <= 0:
            raise ValueError("monthly_cap_dollars must be greater than 0")
        if not (self.auto_approve_under_dollars <= self.per_transaction_cap_dollars <= self.monthly_cap_dollars):
            raise ValueError(
                f"Cap ordering violation: auto_approve (${self.auto_approve_under_dollars}) "
                f"<= per_transaction (${self.per_transaction_cap_dollars}) "
                f"<= monthly_cap (${self.monthly_cap_dollars})"
            )
        return self

    def to_cents(self) -> dict:
        return {
            "auto_approve_under_cents": int(round(self.auto_approve_under_dollars * 100)),
            "per_transaction_cap_cents": int(round(self.per_transaction_cap_dollars * 100)),
            "monthly_cap_cents": int(round(self.monthly_cap_dollars * 100)),
        }


class Mandate(SQLModel, table=True):
    __tablename__ = "mandates"

    id: str = SQLField(default_factory=lambda: str(uuid.uuid4()), primary_key=True, index=True)
    user_id: str = SQLField(default="demo-user", index=True)
    created_at: datetime = SQLField(default_factory=lambda: datetime.now(timezone.utc))
    expires_at: datetime = SQLField(index=True)
    natural_language: str = SQLField(...)
    currency: str = SQLField(default="USD")
    auto_approve_under_cents: int = SQLField(...)
    per_transaction_cap_cents: int = SQLField(...)
    monthly_cap_cents: int = SQLField(...)

    # Store list fields as JSON in SQLite
    allowed_categories: List[str] = SQLField(default_factory=list, sa_column=Column(JSON))
    allowed_merchants: List[str] = SQLField(default_factory=list, sa_column=Column(JSON))
    blocked_categories: List[str] = SQLField(default_factory=default_blocked_categories, sa_column=Column(JSON))

    max_quantity_per_item: int = SQLField(default=3)
    status: str = SQLField(default="active", index=True)  # "active" | "revoked" | "expired"
    signature: str = SQLField(...)
