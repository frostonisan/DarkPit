$ErrorActionPreference = "Stop"
$node = Get-Command node -ErrorAction Stop
& $node.Source (Join-Path $PSScriptRoot "verify-project.mjs")
exit $LASTEXITCODE
