param(
  [string]$Version = "0.1.8"
)

$ErrorActionPreference = "Stop"
$Root = Resolve-Path (Join-Path $PSScriptRoot "..")

Push-Location $Root
try {
  powershell -ExecutionPolicy Bypass -File scripts\build-firefox-xpi.ps1 -Version $Version
  if ($LASTEXITCODE -ne 0) { throw "Firefox XPI build failed." }
  powershell -ExecutionPolicy Bypass -File scripts\build-amo-source.ps1 -Version $Version
  if ($LASTEXITCODE -ne 0) { throw "AMO source build failed." }
  node scripts\write-release-metadata.cjs
  if ($LASTEXITCODE -ne 0) { throw "Release metadata generation failed." }
  node scripts\validate-all.cjs
  if ($LASTEXITCODE -ne 0) { throw "Release validation failed." }
  node scripts\release-metadata-smoke-test.cjs
  if ($LASTEXITCODE -ne 0) { throw "Release metadata verification failed." }
} finally {
  Pop-Location
}

Get-Content -LiteralPath (Join-Path $Root "dist\release-metadata.json")