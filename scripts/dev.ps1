# scripts/dev.ps1 - Start backend and frontend development servers
Write-Host "Starting Mandate Guard development environment..." -ForegroundColor Cyan

# Check if .venv exists
if (-not (Test-Path ".venv")) {
    Write-Host "Creating Python virtual environment (.venv)..." -ForegroundColor Yellow
    py -3.12 -m venv .venv
    .venv\Scripts\pip install -r backend\requirements.txt
}

# Start backend in a new PowerShell window
Write-Host "Launching Backend (FastAPI on http://localhost:8000)..." -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PSScriptRoot\..'; .venv\Scripts\Activate.ps1; uvicorn app.main:app --app-dir backend --reload --port 8000"

# Start frontend in a new PowerShell window
Write-Host "Launching Frontend (Vite on http://localhost:5173)..." -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PSScriptRoot\..\frontend'; npm run dev"

Write-Host "Mandate Guard dev servers launched!" -ForegroundColor Cyan

