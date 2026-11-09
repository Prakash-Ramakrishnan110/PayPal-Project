import json
import logging
from typing import Any, Dict, List, Optional
from google import genai
from google.genai import types

from app.agent.catalog import get_product, search_products
from app.config import get_settings
from app.models.purchase import PurchaseRequest
from app.services.guard import GuardResult, process_purchase_request

logger = logging.getLogger(__name__)

SHOPPER_SYSTEM_INSTRUCTION = """
You are a helpful, efficient personal shopping assistant acting on behalf of the user.
Your role:
1. Search the product catalog to find items that match the user's request.
2. Inspect product details to select the best option.
3. Request purchase of the chosen item with appropriate quantity.
Never fabricate products or prices; always use the search and detail tools.
When you want to buy an item, call request_purchase. You do not have direct payment access.
"""


def _search_products_tool(query: str) -> List[Dict[str, Any]]:
    """Search for products in the store catalog by keyword, name, merchant, or category."""
    return search_products(query)


def _get_product_details_tool(product_id: str) -> Dict[str, Any]:
    """Retrieve full specifications and description for a specific product ID."""
    prod = get_product(product_id)
    if not prod:
        return {"error": f"Product with ID '{product_id}' was not found in the catalog."}
    return prod


def _request_purchase_tool(product_id: str, quantity: int = 1) -> Dict[str, Any]:
    """Request purchase authorization from Mandate Guard for a specific product and quantity."""
    # Dummy signature for tool declaration; actual execution is handled in run_shopping_agent
    return {}


async def run_shopping_agent(task: str, max_iterations: int = 6) -> Dict[str, Any]:
    """
    Executes the Gemini shopping assistant with manual tool-calling loop.
    All purchase requests are intercepted and evaluated by Mandate Guard.
    Returns full execution transcript and list of purchase attempts.
    """
    settings = get_settings()
    client = genai.Client(api_key=settings.GEMINI_API_KEY)

    # Exposed tools
    tools = [_search_products_tool, _get_product_details_tool, _request_purchase_tool]

    config = types.GenerateContentConfig(
        system_instruction=SHOPPER_SYSTEM_INSTRUCTION,
        tools=tools,
        automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=True),
        temperature=0.2,
    )

    transcript: List[Dict[str, Any]] = [
        {"type": "user", "text": task}
    ]
    purchases: List[Dict[str, Any]] = []

    contents = [
        types.Content(
            role="user",
            parts=[types.Part.from_text(text=task)],
        )
    ]

    for iteration in range(1, max_iterations + 1):
        try:
            response = client.models.generate_content(
                model=settings.GEMINI_MODEL,
                contents=contents,
                config=config,
            )
        except Exception as exc:
            logger.error(f"Gemini agent iteration {iteration} error: {exc}")
            transcript.append({
                "type": "error",
                "text": f"Agent communication error: {str(exc)}",
            })
            break

        if not response.candidates:
            break

        candidate_content = response.candidates[0].content
        contents.append(candidate_content)

        # Record model text if any
        if response.text and response.text.strip():
            transcript.append({
                "type": "thought",
                "text": response.text.strip(),
            })

        # Check if the model requested function calls
        function_calls = response.function_calls
        if not function_calls:
            # Model finished turn without tool calls
            transcript.append({
                "type": "agent_response",
                "text": response.text.strip() if response.text else "Task completed.",
            })
            break

        # Execute each requested function call manually
        for call in function_calls:
            func_name = call.name
            func_args = call.args or {}

            transcript.append({
                "type": "tool_call",
                "tool_name": func_name,
                "arguments": func_args,
            })

            tool_result: Any = None

            if func_name in ("_search_products_tool", "search_products"):
                query = func_args.get("query", "")
                tool_result = search_products(query)

            elif func_name in ("_get_product_details_tool", "get_product_details"):
                prod_id = func_args.get("product_id", "")
                tool_result = get_product(prod_id) or {"error": f"Product '{prod_id}' not found"}

            elif func_name in ("_request_purchase_tool", "request_purchase"):
                prod_id = func_args.get("product_id", "")
                quantity = int(func_args.get("quantity", 1))

                prod = get_product(prod_id)
                if not prod:
                    tool_result = {"error": f"Product '{prod_id}' not found in catalog"}
                else:
                    purchase_req = PurchaseRequest(
                        item_name=prod["name"],
                        category=prod["category"],
                        merchant=prod["merchant"],
                        unit_price_cents=prod["price_cents"],
                        quantity=quantity,
                        currency="USD",
                        requested_by_agent="gemini-shopper",
                        source_context=f"Agent selected {prod_id} from catalog",
                    )

                    # Intercept via Mandate Guard
                    guard_result: GuardResult = await process_purchase_request(purchase_req)
                    tool_result = guard_result.model_dump()
                    purchases.append(tool_result)

                    transcript.append({
                        "type": "guard_verdict",
                        "product_name": prod["name"],
                        "merchant": prod["merchant"],
                        "amount_cents": guard_result.amount_cents,
                        "decision": guard_result.decision,
                        "status": guard_result.status,
                        "reason_codes": guard_result.reason_codes,
                        "human_message": guard_result.human_message,
                        "paypal_order_id": guard_result.paypal_order_id,
                        "approve_url": guard_result.approve_url,
                    })

            else:
                tool_result = {"error": f"Unknown tool '{func_name}'"}

            transcript.append({
                "type": "tool_result",
                "tool_name": func_name,
                "result": tool_result,
            })

            # Send function response back to Gemini for next step
            contents.append(
                types.Content(
                    role="user",
                    parts=[
                        types.Part.from_function_response(
                            name=func_name,
                            response={"result": tool_result},
                        )
                    ],
                )
            )

    return {
        "task": task,
        "transcript": transcript,
        "purchases": purchases,
        "success": True,
    }
