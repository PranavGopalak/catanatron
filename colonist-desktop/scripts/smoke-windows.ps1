param(
  [string]$PackagePath = (Join-Path $PSScriptRoot "..\release\Catanatron Colonist-win32-x64"),
  [int]$TimeoutSeconds = 45
)

$ErrorActionPreference = "Stop"
$resolvedPackage = (Resolve-Path $PackagePath).Path
$executable = Join-Path $resolvedPackage "Catanatron Colonist.exe"
if (-not (Test-Path $executable -PathType Leaf)) {
  throw "Windows executable not found: $executable"
}

$profile = Join-Path ([System.IO.Path]::GetTempPath()) ("catanatron-windows-smoke-" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $profile | Out-Null
$startedAt = Get-Date
$process = $null

try {
  $process = Start-Process -FilePath $executable -ArgumentList ("--user-data-dir=`"" + $profile + "`"") -PassThru
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  $windowTitle = ""
  while ((Get-Date) -lt $deadline) {
    Start-Sleep -Milliseconds 500
    $process.Refresh()
    if ($process.HasExited) {
      throw "Catanatron exited before opening its Windows interface with code $($process.ExitCode)"
    }
    if ($process.MainWindowHandle -ne 0 -and $process.MainWindowTitle -match "Colonist|Catanatron") {
      $windowTitle = $process.MainWindowTitle
      break
    }
  }
  if (-not $windowTitle) {
    throw "Catanatron did not expose a usable Windows window within $TimeoutSeconds seconds"
  }

  $version = (Get-Item $executable).VersionInfo
  if ($version.ProductName -ne "Catanatron Colonist") {
    throw "Unexpected Windows ProductName: $($version.ProductName)"
  }
  if ($version.FileDescription -ne "Secure Colonist browser with local Catanatron intelligence") {
    throw "Unexpected Windows FileDescription: $($version.FileDescription)"
  }

  $proof = [ordered]@{
    executable = $executable
    productName = $version.ProductName
    productVersion = $version.ProductVersion
    windowTitle = $windowTitle
    mainWindowHandle = $process.MainWindowHandle.ToInt64()
    launched = $true
    elapsedSeconds = [math]::Round(((Get-Date) - $startedAt).TotalSeconds, 2)
  }
  $proof | ConvertTo-Json | Set-Content -Path (Join-Path $resolvedPackage "windows-smoke.json") -Encoding UTF8
  $proof | ConvertTo-Json
}
finally {
  if ($process -and -not $process.HasExited) {
    Stop-Process -Id $process.Id -Force
    $process.WaitForExit()
  }
  if (Test-Path $profile) {
    Remove-Item -Path $profile -Recurse -Force
  }
}
