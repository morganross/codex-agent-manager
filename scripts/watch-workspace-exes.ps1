$ErrorActionPreference = 'Stop'

$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$logDir = Join-Path $env:USERPROFILE '.qexow-cam\logs'
$logFile = Join-Path $logDir 'workspace-exe-watch.log'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null

function Write-WatchLog {
  param([string]$Message)
  Add-Content -LiteralPath $logFile -Value "$(Get-Date -Format o) $Message"
}

function Remove-WorkspaceExes {
  $dist = Join-Path $root 'dist'
  $exeFiles = @(Get-ChildItem -LiteralPath $root -Recurse -Force -File -Filter '*.exe' -ErrorAction SilentlyContinue |
    Where-Object { $_.FullName -notmatch '\\.git\\' })

  if ($exeFiles.Count -eq 0) {
    return
  }

  foreach ($file in $exeFiles) {
    Write-WatchLog "detected-exe path=""$($file.FullName)"""
  }

  if (Test-Path -LiteralPath $dist) {
    Write-WatchLog "removing-dist path=""$dist"""
    try {
      Remove-Item -LiteralPath $dist -Recurse -Force
    } catch {
      Write-WatchLog "remove-dist-failed error=""$($_.Exception.Message)"""
    }
  }

  foreach ($file in $exeFiles) {
    if (Test-Path -LiteralPath $file.FullName) {
      try {
        Remove-Item -LiteralPath $file.FullName -Force
        Write-WatchLog "deleted-exe path=""$($file.FullName)"""
      } catch {
        Write-WatchLog "delete-exe-failed path=""$($file.FullName)"" error=""$($_.Exception.Message)"""
      }
    }
  }
}

Write-WatchLog "watch-start root=""$root"""
while ($true) {
  Remove-WorkspaceExes
  Start-Sleep -Seconds 5
}
