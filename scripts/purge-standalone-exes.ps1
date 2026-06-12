$ErrorActionPreference = 'Stop'

$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$dist = Join-Path $root 'dist'

if (-not (Test-Path -LiteralPath $dist)) {
  Write-Host "No dist directory exists."
  exit 0
}

$allowedInstaller = (Join-Path $dist 'QexowCamSetup.exe')
$deleted = @()

Get-ChildItem -LiteralPath $dist -Recurse -Force -File -Filter '*.exe' | ForEach-Object {
  if ($_.FullName -ieq $allowedInstaller) {
    return
  }
  $deleted += $_.FullName
  Remove-Item -LiteralPath $_.FullName -Force
}

Get-ChildItem -LiteralPath $dist -Recurse -Force -File | Where-Object {
  $_.FullName -ne $allowedInstaller
} | ForEach-Object {
  Remove-Item -LiteralPath $_.FullName -Force
}

Get-ChildItem -LiteralPath $dist -Recurse -Force -Directory | Sort-Object FullName -Descending | ForEach-Object {
  if (-not (Get-ChildItem -LiteralPath $_.FullName -Force)) {
    Remove-Item -LiteralPath $_.FullName -Force
  }
}

if ($deleted.Count -gt 0) {
  Write-Host "Deleted standalone executable payloads:"
  $deleted | ForEach-Object { Write-Host $_ }
} else {
  Write-Host "No standalone executable payloads found."
}

if (-not (Test-Path -LiteralPath $allowedInstaller)) {
  throw "Installer missing after purge: $allowedInstaller"
}
