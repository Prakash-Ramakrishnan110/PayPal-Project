from typing import Any, Dict
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.agent.shopper import run_shopping_agent

router = APIRouter(prefix="/agent", tags=["agent"])


class AgentRunRequest(BaseModel):
    task: str = Field(..., min_length=2, description="Shopping objective or instruction for the AI agent")


@router.post("/run")
async def run_agent(body: AgentRunRequest) -> Dict[str, Any]:
    """
    Executes the Gemini shopping assistant.
    The agent searches the catalog and attempts purchases, which are
    deterministically evaluated by Mandate Guard.
    """
    try:
        result = await run_shopping_agent(task=body.task)
        return result
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Shopping agent error: {str(exc)}")
