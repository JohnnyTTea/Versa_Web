param(
  [string]$ProjectDir = "C:\project\Versa",
  [int]$ServerPort = 3000
)

$ErrorActionPreference = "Stop"

function Step($Message) {
  Write-Host ""
  Write-Host "==> $Message" -ForegroundColor Cyan
}

function Run($Command, $WorkingDirectory) {
  Step "$WorkingDirectory> $Command"
  Push-Location $WorkingDirectory
  try {
    cmd /c $Command
    if ($LASTEXITCODE -ne 0) {
      throw "Command failed with exit code $LASTEXITCODE`: $Command"
    }
  } finally {
    Pop-Location
  }
}

if (-not (Test-Path $ProjectDir)) {
  throw "Project directory not found: $ProjectDir"
}

$webDir = Join-Path $ProjectDir "web"
$serverDir = Join-Path $ProjectDir "server"
$serverLogDir = Join-Path $serverDir "logs"
$serverOutLog = Join-Path $serverLogDir "prod.out.log"
$serverErrLog = Join-Path $serverLogDir "prod.err.log"

if (-not (Test-Path $webDir)) {
  throw "Web directory not found: $webDir"
}

if (-not (Test-Path $serverDir)) {
  throw "Server directory not found: $serverDir"
}

New-Item -ItemType Directory -Force -Path $serverLogDir | Out-Null

Step "Pull latest code"
Run "git pull origin main" $ProjectDir

Step "Build web"
Run "npm run build" $webDir

Step "Build server"
Run "npm run build" $serverDir

Step "Stop old server process on port $ServerPort"
$connections = Get-NetTCPConnection -LocalPort $ServerPort -State Listen -ErrorAction SilentlyContinue
$processIds = @($connections | Select-Object -ExpandProperty OwningProcess -Unique)
foreach ($processId in $processIds) {
  if ($processId -and $processId -ne $PID) {
    Write-Host "Stopping PID $processId"
    Stop-Process -Id $processId -Force
  }
}

Step "Start server"
$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCmd) {
  throw "node was not found on PATH"
}

$proc = Start-Process `
  -FilePath $nodeCmd.Source `
  -ArgumentList @("dist/main") `
  -WorkingDirectory $serverDir `
  -WindowStyle Hidden `
  -RedirectStandardOutput $serverOutLog `
  -RedirectStandardError $serverErrLog `
  -PassThru

Write-Host "Started server PID $($proc.Id) via node dist/main"

$serverRunning = $null
for ($i = 1; $i -le 30; $i++) {
  Start-Sleep -Seconds 1
  $serverRunning = Get-NetTCPConnection -LocalPort $ServerPort -State Listen -ErrorAction SilentlyContinue
  if ($serverRunning) {
    break
  }

  if ($proc.HasExited) {
    break
  }
}

if (-not $serverRunning) {
  Write-Host "Server did not start on port $ServerPort." -ForegroundColor Red
  if ($proc.HasExited) {
    Write-Host "Start process exited with code $($proc.ExitCode)." -ForegroundColor Red
  } else {
    Write-Host "Start process is still running, but port $ServerPort was not detected." -ForegroundColor Red
  }

  if (Test-Path $serverOutLog) {
    Write-Host ""
    Write-Host "Last stdout log:" -ForegroundColor Yellow
    Get-Content $serverOutLog -Tail 80
  }

  if (Test-Path $serverErrLog) {
    Write-Host ""
    Write-Host "Last stderr log:" -ForegroundColor Yellow
    Get-Content $serverErrLog -Tail 80
  }

  throw "Server start failed"
}

Write-Host ""
Write-Host "Production update complete." -ForegroundColor Green
Write-Host "Server stdout: $serverOutLog"
Write-Host "Server stderr: $serverErrLog"
