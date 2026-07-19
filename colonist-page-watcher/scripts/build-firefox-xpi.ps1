param(
  [string]$Version = "0.1.8"
)

$ErrorActionPreference = "Stop"
$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
$Dist = Join-Path $Root "dist"
$Package = Join-Path $Dist "colonist-page-watcher-$Version"
$Zip = Join-Path $Dist "colonist-page-watcher-$Version.zip"
$Xpi = Join-Path $Dist "colonist-page-watcher-$Version.xpi"

New-Item -ItemType Directory -Force -Path $Dist | Out-Null
if (Test-Path -LiteralPath $Package) { Remove-Item -LiteralPath $Package -Recurse -Force }
New-Item -ItemType Directory -Force -Path $Package | Out-Null

Copy-Item -LiteralPath (Join-Path $Root "manifest.json") -Destination $Package
Copy-Item -LiteralPath (Join-Path $Root "src") -Destination $Package -Recurse
Copy-Item -LiteralPath (Join-Path $Root "dashboard") -Destination $Package -Recurse
Copy-Item -LiteralPath (Join-Path $Root "assets") -Destination $Package -Recurse

if (Test-Path -LiteralPath $Zip) { Remove-Item -LiteralPath $Zip -Force }
if (Test-Path -LiteralPath $Xpi) { Remove-Item -LiteralPath $Xpi -Force }
Push-Location $Package
try {
  tar.exe -a -c -f $Zip *
  if ($LASTEXITCODE -ne 0) { throw "Failed to build Firefox XPI archive." }
} finally {
  Pop-Location
}
Move-Item -LiteralPath $Zip -Destination $Xpi
Get-Item -LiteralPath $Xpi

