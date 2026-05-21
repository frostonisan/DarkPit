$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$siteRoot = Join-Path $root "dossier"

$nodeCandidates = @(
    "C:\Users\Utilisateur\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe",
    "node"
)

$node = $null
foreach ($candidate in $nodeCandidates) {
    try {
        $resolved = Get-Command $candidate -ErrorAction Stop
        $node = $resolved.Source
        break
    } catch {
        if (Test-Path -LiteralPath $candidate) {
            $node = $candidate
            break
        }
    }
}

if (-not $node) {
    throw "Node.js introuvable. Installe Node.js ou lance la verification depuis Codex."
}

Write-Host "Verification syntaxe JavaScript..."
Get-ChildItem -Path (Join-Path $siteRoot "js") -Filter "*.js" -File | ForEach-Object {
    & $node --check $_.FullName | Out-Null
}

Write-Host "Verification imports et assets statiques..."
& $node (Join-Path $PSScriptRoot "verify-assets.mjs") $siteRoot
if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
}

Write-Host "Verification references HTML..."
$missing = New-Object System.Collections.Generic.List[string]
$linkedCss = New-Object System.Collections.Generic.List[string]
$htmlFiles = Get-ChildItem -Path $siteRoot -Filter "*.html" -File
foreach ($file in $htmlFiles) {
    $content = Get-Content -LiteralPath $file.FullName -Raw
    $matches = [regex]::Matches($content, '(?:src|href)="([^"]+)"')
    foreach ($match in $matches) {
        $ref = $match.Groups[1].Value
        if ($ref -match '^(https?:|data:|#)') { continue }

        $clean = ($ref -split '[?#]')[0]
        if ($clean.StartsWith("/")) {
            $target = Join-Path $siteRoot $clean.TrimStart("/")
        } else {
            $target = Join-Path $file.DirectoryName $clean
        }

        if (-not (Test-Path -LiteralPath $target)) {
            $missing.Add("$($file.Name) -> $ref")
        } elseif ($clean.EndsWith(".css") -and -not $linkedCss.Contains($target)) {
            $linkedCss.Add($target)
        }
    }
}

Write-Host "Verification references CSS..."
foreach ($file in $linkedCss) {
    $content = Get-Content -LiteralPath $file -Raw
    $content = [regex]::Replace($content, '/\*[\s\S]*?\*/', '')
    $matches = [regex]::Matches($content, 'url\((?!["'']?data:)([^)]+)\)')
    foreach ($match in $matches) {
        $ref = $match.Groups[1].Value.Trim().Trim('"').Trim("'")
        if ($ref -match '^(https?:|data:|#)') { continue }

        $clean = ($ref -split '[?#]')[0]
        $baseRel = (Resolve-Path -LiteralPath $file).Path.Substring((Resolve-Path -LiteralPath $siteRoot).Path.Length).TrimStart("\").Replace("\", "/")
        $baseUri = [Uri]"https://local/$baseRel"
        $resolvedUri = [Uri]::new($baseUri, $clean)
        $webPath = $resolvedUri.AbsolutePath.TrimStart("/")
        $target = Join-Path $siteRoot ($webPath -replace '/', '\')

        if (-not (Test-Path -LiteralPath $target)) {
            $svgFallback = "$target.svg"
            if (-not (Test-Path -LiteralPath $svgFallback)) {
                $missing.Add("$((Get-Item $file).Name) -> $ref")
            }
        }
    }
}

if ($missing.Count -gt 0) {
    Write-Host "References manquantes:" -ForegroundColor Yellow
    $missing | ForEach-Object { Write-Host " - $_" -ForegroundColor Yellow }
    exit 1
}

Write-Host "Verification OK."
