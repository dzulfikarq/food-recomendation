$ErrorActionPreference = "Stop"

if (-not $env:FOODREC_WORKER_SECRET) {
  throw "Set FOODREC_WORKER_SECRET before starting the worker."
}

$repoRoot = Split-Path -Parent $PSScriptRoot
$worker = Join-Path $repoRoot "services/recommender/src/worker.py"
$venvPython = Join-Path $repoRoot ".venv/Scripts/python.exe"

if (Test-Path $venvPython) {
  & $venvPython $worker
} else {
  $python = Get-Command py -ErrorAction SilentlyContinue
  if ($python) {
    & $python.Source -3 $worker
  } else {
    & python $worker
  }
}

exit $LASTEXITCODE
