# Mandate Guard

> A deterministic spending-control and consent layer for AI shopping agents. Built for the PayPal AI Hackathon.

## Core Principle
Enforcement is deterministic Python code **outside** the LLM. The LLM can never override the policy engine, providing guaranteed defense against indirect prompt injections.

## Tech Stack
- **Backend**: Python 3.12, FastAPI, Pydantic v2, SQLModel, SQLite, httpx, google-genai
- **Frontend**: React, Vite, TypeScript, AG Grid Community
- **Payments**: PayPal Sandbox (Orders v2 REST API)
- **AI**: Gemini API (`gemini-2.5-flash`) structured compiler & shopping agent

## Getting Started

### 1. Setup Environment
```powershell
# Copy environment file
cp .env.example .env

# Create virtual environment
py -3.12 -m venv .venv
.venv\Scripts\Activate.ps1

# Install backend dependencies
pip install -r backend/requirements.txt
```

### 2. Run Backend & Frontend
```powershell
.\scripts\dev.ps1
```
