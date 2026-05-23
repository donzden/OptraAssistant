$ROOT = Split-Path -Parent $MyInvocation.MyCommand.Path

function Write-Step($n, $msg) {
    Write-Host ""
    Write-Host "[$n] $msg" -ForegroundColor Cyan
}
function Write-OK($msg)   { Write-Host "    OK  $msg" -ForegroundColor Green }
function Write-Wait($msg) { Write-Host "    ... $msg" -ForegroundColor Yellow }
function Write-Fail($msg) {
    Write-Host ""
    Write-Host "    FAIL  $msg" -ForegroundColor Red
    Write-Host ""
    Read-Host "Press Enter to close"
    exit 1
}

Write-Host ""
Write-Host "==========================================" -ForegroundColor Magenta
Write-Host "  OptraAssistant - Dev Environment" -ForegroundColor Magenta
Write-Host "==========================================" -ForegroundColor Magenta

# -- 1. Free ports 4000 / 8000 / 5173 ----------------------------------------
Write-Step "1/3" "Freeing ports 4000, 8000, 5173"
foreach ($port in @(4000, 8000, 5173)) {
    $pids = (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue).OwningProcess
    foreach ($p in $pids) {
        try { Stop-Process -Id $p -Force -ErrorAction Stop; Write-Wait "Killed PID $p on port $port" } catch {}
    }
}
Write-OK "Ports clear"

# -- 2. Prisma migrate --------------------------------------------------------
Write-Step "2/3" "Applying Prisma migrations"
Set-Location "$ROOT\api"
& node_modules\.bin\prisma migrate dev --name auto 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) { Write-Fail "Prisma migrate failed. Is Postgres running? Check api\.env DATABASE_URL." }
Write-OK "Migrations applied"

# -- 3. Open service windows --------------------------------------------------
Write-Step "3/3" "Opening service terminals"

$api      = "title API      (port 4000) && cd /d `"$ROOT\api`"      && npm run dev"
$engine   = "title Engine   (port 8000) && cd /d `"$ROOT\engine`"   && pip install -r requirements.txt -q && uvicorn app.main:app --reload"
$frontend = "title Frontend (port 5173) && cd /d `"$ROOT\frontend`" && npm run dev"

Start-Process cmd "/k $api"
Start-Process cmd "/k $engine"
Start-Process cmd "/k $frontend"

Write-OK "API, Engine, Frontend windows opened"

Write-Host ""
Write-Host "==========================================" -ForegroundColor Magenta
Write-Host "  Ready - open http://localhost:5173" -ForegroundColor Magenta
Write-Host "==========================================" -ForegroundColor Magenta
Write-Host ""
