# Auto-Backup Script für Factory Island
# Erkennt Änderungen, erstellt Commit und pusht zu GitHub.
#
# Verwendung:
#   .\auto-backup.ps1                  # Standard-Commit-Message
#   .\auto-backup.ps1 "Meine Nachricht"  # Eigene Commit-Message

param(
    [string]$Message = "Auto save $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
)

Set-Location $PSScriptRoot

# Prüfe ob Git-Repo vorhanden
if (-not (Test-Path '.git')) {
    Write-Host "Fehler: Kein Git-Repository gefunden." -ForegroundColor Red
    exit 1
}

# Prüfe ob es Änderungen gibt
$status = git status --porcelain 2>&1
if (-not $status) {
    Write-Host "Keine Änderungen vorhanden." -ForegroundColor Yellow
    exit 0
}

Write-Host "Änderungen erkannt:" -ForegroundColor Cyan
git status --short

# Stage, Commit, Push
git add .
if ($LASTEXITCODE -ne 0) { Write-Host "Fehler bei git add." -ForegroundColor Red; exit 1 }

git commit -m $Message
if ($LASTEXITCODE -ne 0) { Write-Host "Fehler bei git commit." -ForegroundColor Red; exit 1 }

git push
if ($LASTEXITCODE -ne 0) { Write-Host "Fehler bei git push." -ForegroundColor Red; exit 1 }

Write-Host "Backup erfolgreich abgeschlossen!" -ForegroundColor Green
