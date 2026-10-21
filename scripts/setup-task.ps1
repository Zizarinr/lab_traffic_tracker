# Mendaftarkan Task Scheduler untuk PC lab (dua task):
#   1. LabScanKTM-Server : jalankan start.bat saat user logon (+restart otomatis bila gagal).
#   2. LabScanKTM-Backup : backup database harian (backup.bat -> scripts/backup.js).
#
# Pemakaian:
#   powershell -ExecutionPolicy Bypass -File scripts\setup-task.ps1            # daftarkan keduanya
#   powershell -ExecutionPolicy Bypass -File scripts\setup-task.ps1 -WhatIf    # lihat rencana saja
#   powershell -ExecutionPolicy Bypass -File scripts\setup-task.ps1 -Remove    # hapus keduanya
#   ... -BackupHour 18 -BackupKeep 60          # jadwal backup & jumlah file yang disimpan
#
# Tidak perlu admin: task berjalan sebagai user yang sedang logon.

[CmdletBinding(SupportsShouldProcess = $true)]
param(
    [string]$TaskName = 'LabScanKTM-Server',
    [string]$BackupTaskName = 'LabScanKTM-Backup',
    [ValidateRange(0, 23)]
    [int]$BackupHour = 17,
    [ValidateRange(1, 365)]
    [int]$BackupKeep = 30,
    [switch]$Remove
)

$ErrorActionPreference = 'Stop'
$projectDir = Split-Path -Parent $PSScriptRoot
$startBat = Join-Path $projectDir 'start.bat'
$backupBat = Join-Path $projectDir 'backup.bat'

foreach ($file in @($startBat, $backupBat)) {
    if (-not (Test-Path $file)) {
        Write-Host "GAGAL: file tidak ditemukan: $file" -ForegroundColor Red
        exit 1
    }
}

if ($Remove) {
    foreach ($name in @($TaskName, $BackupTaskName)) {
        $existing = Get-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue
        if (-not $existing) {
            Write-Host "Task '$name' tidak ada, tidak ada yang dihapus."
            continue
        }
        if ($PSCmdlet.ShouldProcess($name, 'Hapus scheduled task')) {
            Unregister-ScheduledTask -TaskName $name -Confirm:$false
            Write-Host "Task '$name' dihapus." -ForegroundColor Yellow
        }
    }
    exit 0
}

# ---------- Task 1: server saat logon ----------
$serverAction = New-ScheduledTaskAction -Execute $startBat -WorkingDirectory $projectDir
$logonTrigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$serverSettings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -MultipleInstances IgnoreNew `
    -ExecutionTimeLimit ([TimeSpan]::Zero) `
    -RestartCount 3 `
    -RestartInterval (New-TimeSpan -Minutes 1)

# ---------- Task 2: backup harian ----------
$backupAction = New-ScheduledTaskAction -Execute $backupBat -Argument "--keep=$BackupKeep" -WorkingDirectory $projectDir
$backupTrigger = New-ScheduledTaskTrigger -Daily -At ('{0:00}:00' -f $BackupHour)
$backupSettings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -MultipleInstances IgnoreNew `
    -RestartCount 2 `
    -RestartInterval (New-TimeSpan -Minutes 5)

Write-Host 'Rencana pendaftaran:'
Write-Host '  [1] Server'
Write-Host "      Nama     : $TaskName"
Write-Host "      Pemicu   : saat $env:USERNAME logon"
Write-Host "      Aksi     : $startBat"
Write-Host '      Gagal    : restart maks 3x, tiap 1 menit; tanpa batas waktu berjalan'
Write-Host '  [2] Backup'
Write-Host "      Nama     : $BackupTaskName"
Write-Host "      Pemicu   : setiap hari $BackupHour`:00"
Write-Host "      Aksi     : $backupBat --keep=$BackupKeep"
Write-Host "      Hasil     : data\backups\ (disimpan $BackupKeep terakhir, dicatat logs\backup.log)"

if ($PSCmdlet.ShouldProcess($TaskName, 'Daftarkan scheduled task (server)')) {
    if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
        Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
    }
    Register-ScheduledTask `
        -TaskName $TaskName `
        -Action $serverAction `
        -Trigger $logonTrigger `
        -Settings $serverSettings `
        -Description 'Lab Scan KTM - jalankan server kiosk saat logon' | Out-Null
    Write-Host "Task '$TaskName' terdaftar." -ForegroundColor Green
}

if ($PSCmdlet.ShouldProcess($BackupTaskName, 'Daftarkan scheduled task (backup harian)')) {
    if (Get-ScheduledTask -TaskName $BackupTaskName -ErrorAction SilentlyContinue) {
        Unregister-ScheduledTask -TaskName $BackupTaskName -Confirm:$false
    }
    Register-ScheduledTask `
        -TaskName $BackupTaskName `
        -Action $backupAction `
        -Trigger $backupTrigger `
        -Settings $backupSettings `
        -Description "Lab Scan KTM - backup database harian jam $BackupHour`:00" | Out-Null
    Write-Host "Task '$BackupTaskName' terdaftar." -ForegroundColor Green
}

Write-Host 'Cek: taskschd.msc (Task Scheduler) -> Task Scheduler Library'
