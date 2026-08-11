param(
  [string]$InstallerPath = (Join-Path $PSScriptRoot "..\release\installer\Catanatron-Colonist-0.7.1-Windows-x64-Setup.exe"),
  [int]$TimeoutSeconds = 60
)

$ErrorActionPreference = "Stop"
$resolvedInstaller = (Resolve-Path $InstallerPath).Path
$manifestPath = Join-Path $PSScriptRoot "..\package.json"
$manifest = Get-Content $manifestPath -Raw | ConvertFrom-Json
$packageName = [string]$manifest.name
$productName = [string]$manifest.build.productName
$installDirectory = Join-Path $env:LOCALAPPDATA ("Programs\" + $packageName)
$installedExecutable = Join-Path $installDirectory ($productName + ".exe")
$uninstaller = Join-Path $installDirectory ("Uninstall " + $productName + ".exe")
$proofPath = Join-Path (Split-Path $resolvedInstaller -Parent) "windows-installer-smoke.json"

if (Test-Path $installDirectory) {
  throw "Installer smoke test requires a clean install directory: $installDirectory"
}

$installation = Start-Process -FilePath $resolvedInstaller -ArgumentList "/S" -PassThru -Wait
if ($installation.ExitCode -ne 0) {
  throw "Installer exited with code $($installation.ExitCode)"
}

$deadline = (Get-Date).AddSeconds($TimeoutSeconds)
while ((Get-Date) -lt $deadline -and -not (Test-Path $installedExecutable -PathType Leaf)) {
  Start-Sleep -Milliseconds 500
}
if (-not (Test-Path $installedExecutable -PathType Leaf)) {
  throw "Installed application was not found: $installedExecutable"
}
if (-not (Test-Path $uninstaller -PathType Leaf)) {
  throw "Uninstaller was not created: $uninstaller"
}

& (Join-Path $PSScriptRoot "smoke-windows.ps1") -PackagePath $installDirectory -ProofPath $proofPath -TimeoutSeconds $TimeoutSeconds | Out-Null

$desktopShortcut = Join-Path ([Environment]::GetFolderPath("Desktop")) ($productName + ".lnk")
$startMenuShortcut = Join-Path $env:APPDATA ("Microsoft\Windows\Start Menu\Programs\" + $productName + ".lnk")
$proof = [ordered]@{
  installer = $resolvedInstaller
  installedExecutable = $installedExecutable
  installerExitCode = $installation.ExitCode
  desktopShortcut = Test-Path $desktopShortcut -PathType Leaf
  startMenuShortcut = Test-Path $startMenuShortcut -PathType Leaf
  launched = $true
  uninstallEntry = Test-Path $uninstaller -PathType Leaf
}
if (-not $proof.desktopShortcut -or -not $proof.startMenuShortcut) {
  throw "Installer did not create the expected desktop and Start Menu shortcuts"
}
$proof | ConvertTo-Json | Set-Content -Path $proofPath -Encoding UTF8
$proof | ConvertTo-Json

$uninstall = Start-Process -FilePath $uninstaller -ArgumentList "/S" -PassThru -Wait
if ($uninstall.ExitCode -ne 0) {
  throw "Uninstaller exited with code $($uninstall.ExitCode)"
}
