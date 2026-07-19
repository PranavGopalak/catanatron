param(
  [string]$Version = "0.1.8"
)

$ErrorActionPreference = "Stop"
$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
$Dist = Join-Path $Root "dist"
$Package = Join-Path $Dist "colonist-page-watcher-source-$Version"
$Zip = Join-Path $Dist "colonist-page-watcher-source-$Version.zip"

New-Item -ItemType Directory -Force -Path $Dist | Out-Null
if (Test-Path -LiteralPath $Package) { Remove-Item -LiteralPath $Package -Recurse -Force }
New-Item -ItemType Directory -Force -Path $Package | Out-Null

$items = @(
  "manifest.json",
  "README.md",
  "PRIVACY.md",
  "AMO-SUBMISSION.md",
  "FIREFOX-INSTALL-CHECKLIST.md",
  "PROTOCOL.md",
  "assets",
  "dashboard",
  "src",
  "scripts"
)

foreach ($item in $items) {
  $source = Join-Path $Root $item
  if (Test-Path -LiteralPath $source) {
    Copy-Item -LiteralPath $source -Destination $Package -Recurse
  }
}

if (Test-Path -LiteralPath $Zip) { Remove-Item -LiteralPath $Zip -Force }
Push-Location $Package
try {
  tar.exe -a -c -f $Zip *
  if ($LASTEXITCODE -ne 0) { throw "Failed to build AMO source archive." }
} finally {
  Pop-Location
}
Get-Item -LiteralPath $Zip

