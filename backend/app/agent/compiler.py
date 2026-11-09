import json
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional
from google import genai
from google.genai import types

from app.config import get_settings
from app.models.mandate import Mandate, MandateDraft, validate_mandate_limits
from app.services.signing import sign

logger = logging.getLogger(__name__)

COMPILER_SYSTEM_INSTRUCTION = """
You convert a user's spending instruction into a strict spending mandate.
Never invent permissions the user did not state.
If something is not specified, use conservative defaults:
- auto_approve_under: 40% of per_transaction_cap
- per_transaction_cap: 50% of monthly_cap
- If no monthly cap is stated, infer a reasonable conservative cap based on context or default to $150.00
- Always keep gift_cards, cash_equivalents, and crypto in blocked_categories
- max_quantity_per_item: default to 3 unless specified
- expires_in_days: default to 30 unless stated
- currency: default to USD
Ensure auto_approve_under <= per_transaction_cap <= monthly_cap strictly holds!
Return a plain-English summary restatement and a list of assumptions you applied.
"""


def get_genai_client() -> genai.Client:
    settings = get_settings()
    if not settings.GEMINI_API_KEY or settings.GEMINI_API_KEY == "your_gemini_api_key_here":
        raise ValueError("GEMINI_API_KEY is not configured in .env. Please provide a valid Gemini API key.")
    return genai.Client(api_key=settings.GEMINI_API_KEY)


def compile_mandate(text: str) -> MandateDraft:
    """
    Compiles natural language spending rules into a structured MandateDraft using Gemini.
    Retries once on parsing/validation failure.
    """
    settings = get_settings()
    client = get_genai_client()

    prompt = f"Spending instruction from user: \"{text}\"\n\nCompile this into a structured MandateDraft."

    last_error: Optional[Exception] = None
    for attempt in range(2):
        try:
            response = client.models.generate_content(
                model=settings.GEMINI_MODEL,
                contents=prompt,
                config=types.GenerateContentConfig(
                    system_instruction=COMPILER_SYSTEM_INSTRUCTION,
                    response_mime_type="application/json",
                    response_schema=MandateDraft,
                    temperature=0.1,
                ),
            )

            raw_text = response.text
            if not raw_text:
                raise ValueError("Empty response received from Gemini compiler")

            # Parse and validate with Pydantic
            draft = MandateDraft.model_validate_json(raw_text)
            # Ensure natural language input is preserved
            draft.natural_language = text
            return draft

        except Exception as exc:
            logger.warning(f"Mandate compilation attempt {attempt + 1} failed: {exc}")
            last_error = exc

    raise ValueError(f"Failed to compile mandate after retry: {last_error}")


def create_mandate_from_draft(draft: MandateDraft, user_id: str = "demo-user") -> Mandate:
    """
    Converts a validated MandateDraft (with dollar amounts) into an active,
    cryptographically signed Mandate with integer cents.
    """
    cents_dict = draft.to_cents()
    auto_approve_cents = cents_dict["auto_approve_under_cents"]
    per_tx_cents = cents_dict["per_transaction_cap_cents"]
    monthly_cents = cents_dict["monthly_cap_cents"]

    # Validate ordering
    validate_mandate_limits(auto_approve_cents, per_tx_cents, monthly_cents)

    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(days=draft.expires_in_days)

    mandate = Mandate(
        user_id=user_id,
        created_at=now,
        expires_at=expires_at,
        natural_language=draft.natural_language,
        currency=draft.currency.upper(),
        auto_approve_under_cents=auto_approve_cents,
        per_transaction_cap_cents=per_tx_cents,
        monthly_cap_cents=monthly_cents,
        allowed_categories=draft.allowed_categories,
        allowed_merchants=draft.allowed_merchants,
        blocked_categories=draft.blocked_categories,
        max_quantity_per_item=draft.max_quantity_per_item,
        status="active",
        signature="",
    )

    # Sign the mandate deterministically
    mandate.signature = sign(mandate)
    return mandate
