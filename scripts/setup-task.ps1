# Mendaftarkan Task Scheduler: jalankan start.bat saat user logon,
# dengan restart otomatis bila gagal.
#
# Pemakaian:
#   powershell -ExecutionPolicy Bypass -File scripts\setup-task.ps1           # daftarkan
#   powershell -ExecutionPolicy Bypass -File scripts\setup-task.ps1 -WhatIf   # lihat rencana saja
#   powershell -ExecutionPolicy Bypass -File scripts\setup-task.ps1 -Remove   # hapus task
#
# Tidak perlu admin: task berjalan sebagai user yang sedang logon.

[CmdletBinding(SupportsShouldProcess = $true)]
param(
    [string]$TaskName = 'LabScanKTM-Server',
    [switch]$Remove
)

$ErrorActionPreference = 'Stop'
$projectDir = Split-Path -Parent $PSScriptRoot
$startBat = Join-Path $projectDir 'start.bat'

if (-not (Test-Path $startBat)) {
    Write-Host "GAGAL: start.bat tidak ditemukan di $startBat" -ForegroundColor Red
    exit 1
}

if ($Remove) {
    $existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    if (-not $existing) {
        Write-Host "Task '$TaskName' tidak ada, tidak ada yang dihapus."
        exit 0
    }
    if ($PSCmdlet.ShouldProcess($TaskName, 'Hapus scheduled task')) {
        Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
        Write-Host "Task '$TaskName' dihapus." -ForegroundColor Yellow
    }
    exit 0
}

$existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($existing) { Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false }

$action = New-ScheduledTaskAction -Execute $startBat -WorkingDirectory $projectDir
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -MultipleInstances IgnoreNew `
    -ExecutionTimeLimit ([TimeSpan]::Zero) `
    -RestartCount 3 `
    -RestartInterval (New-TimeSpan -Minutes 1)

Write-Host "Rencana pendaftaran:"
Write-Host "  Nama     : $TaskName"
Write-Host "  Pemicu   : saat $env:USERNAME logon"
Write-Host "  Aksi     : $startBat"
Write-Host "  Kerja    : $projectDir"
Write-Host "  Gagal    : restart maks 3x, tiap 1 menit"
Write-Host "  Batas waktu berjalan: tanpa batas"

if ($PSCmdlet.ShouldProcess($TaskName, 'Daftarkan scheduled task')) {
    Register-ScheduledTask `
        -TaskName $TaskName `
        -Action $action `
        -Trigger $trigger `
        -Settings $settings `
        -Description 'Lab Scan KTM - jalankan server kiosk saat logon' | Out-Null
    Write-Host "Task '$TaskName' terdaftar." -ForegroundColor Green
    Write-Host 'Cek: taskschd.msc (Task Scheduler) -> Task Scheduler Library'
}
