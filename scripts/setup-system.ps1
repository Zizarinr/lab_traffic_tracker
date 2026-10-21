# Setelan Windows untuk PC kiosk: layar tidak mati, PC tidak sleep,
# Windows Update tidak reboot sendiri di jam operasional lab.
#
# Pemakaian:
#   powershell -ExecutionPolicy Bypass -File scripts\setup-system.ps1 -Info     # cek setelan sekarang (tanpa admin)
#   powershell -ExecutionPolicy Bypass -File scripts\setup-system.ps1 -WhatIf   # lihat rencana saja
#   powershell -ExecutionPolicy Bypass -File scripts\setup-system.ps1           # terapkan (mintai izin UAC)
#
# Jalankan di PC LAB, bukan di PC pribadi (layar akan menyala terus).

[CmdletBinding(SupportsShouldProcess = $true)]
param(
    [switch]$Info,
    [ValidateRange(0, 23)]
    [int]$ActiveHourStart = 7,
    [ValidateRange(0, 23)]
    [int]$ActiveHourEnd = 21
)

$ErrorActionPreference = 'Stop'

function Test-IsAdmin {
    ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
    ).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

$isAdmin = Test-IsAdmin

if ($Info) {
    Write-Host '=== Cek setelan Windows saat ini ==='
    Write-Host ("Admin   : {0}" -f $(if ($isAdmin) { 'ya' } else { 'tidak' }))

    function Get-PowerValue([string]$Sub, [string]$Setting) {
        $out = & powercfg.exe /query SCHEME_CURRENT $Sub $Setting 2>$null
        $line = $out | Select-String 'Current AC Power Setting Index' | Select-Object -First 1
        if ($line -match '0x([0-9a-fA-F]+)') { return [Convert]::ToInt32($Matches[1], 16) }
        return $null
    }

    foreach ($row in @(
        @{ Nama = 'Sleep (standby) AC    '; Sub = 'SUB_SLEEP'; Set = 'STANDBYIDLE' },
        @{ Nama = 'Hibernasi AC          '; Sub = 'SUB_SLEEP'; Set = 'HIBERNATEIDLE' },
        @{ Nama = 'Layar AC (screen-off) '; Sub = 'SUB_VIDEO'; Set = 'VIDEOIDLE' },
        @{ Nama = 'Disk AC (tidur)       '; Sub = 'SUB_DISK'; Set = 'DISKIDLE' }
    )) {
        $v = Get-PowerValue $row.Sub $row.Set
        $ket = if ($null -eq $v) { 'tak terbaca' }
               elseif ($v -eq 0) { 'TIDAK PERNAH (0)' }
               else { "$v detik" }
        Write-Host ("  {0}: {1}" -f $row.Nama, $ket)
    }

    $au = Get-ItemProperty -Path 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\WindowsUpdate\AU' -ErrorAction SilentlyContinue
    $noReboot = if ($au -and $au.NoAutoRebootWithLoggedOnUsers -eq 1) { 'AKTIF (tidak reboot saat logon)' }
                else { 'belum diatur (reboot boleh terjadi)' }
    Write-Host ("  Larang reboot Update : {0}" -f $noReboot)

    $ux = Get-ItemProperty -Path 'HKLM:\SOFTWARE\Microsoft\WindowsUpdate\UX\Settings' -ErrorAction SilentlyContinue
    if ($ux -and $null -ne $ux.ActiveHoursStart) {
        Write-Host ("  Jam aktif Update     : {0}:00 - {1}:00" -f $ux.ActiveHoursStart, $ux.ActiveHoursEnd)
    } else {
        Write-Host '  Jam aktif Update     : belum diatur (default Windows)'
    }
    exit 0
}

# Mode terapkan: minta UAC bila belum admin.
if (-not $isAdmin -and -not $WhatIfPreference) {
    Write-Host 'Perlu izin admin -> memunculkan UAC...'
    $argList = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', "`"$PSCommandPath`"")
    try {
        Start-Process powershell -Verb RunAs -ArgumentList $argList -Wait
    } catch {
        Write-Host 'UAC ditolak, tidak ada yang diubah.' -ForegroundColor Yellow
        exit 1
    }
    Write-Host 'Selesai. Jalankan lagi dengan -Info untuk memeriksa hasil.'
    exit 0
}

if (-not $isAdmin -and $WhatIfPreference) {
    Write-Host 'Catatan: penerapan nyata butuh Run as administrator (UAC). Rencana di bawah.' -ForegroundColor Yellow
}

Write-Host '=== Rencana setelan ==='

$powerSettings = @(
    @{ Key = 'standby-timeout-ac'; Desc = 'Sleep AC -> tidak pernah (0 menit)' },
    @{ Key = 'hibernate-timeout-ac'; Desc = 'Hibernasi AC -> tidak pernah' },
    @{ Key = 'monitor-timeout-ac'; Desc = 'Screen-off AC -> tidak pernah (layar tetap nyala)' },
    @{ Key = 'disk-timeout-ac'; Desc = 'Disk AC -> tidak pernah tidur' }
)

foreach ($s in $powerSettings) {
    if ($PSCmdlet.ShouldProcess($s.Desc, "powercfg /change $($s.Key) 0")) {
        & powercfg.exe /change $s.Key 0 | Out-Null
        Write-Host "OK : $($s.Desc)" -ForegroundColor Green
    }
}

$regChanges = @(
    @{ Path = 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\WindowsUpdate\AU'
       Name = 'NoAutoRebootWithLoggedOnUsers'; Value = 1
       Desc = 'Windows Update TIDAK boleh reboot selama user logon' },
    @{ Path = 'HKLM:\SOFTWARE\Microsoft\WindowsUpdate\UX\Settings'
       Name = 'SmartActiveHoursState'; Value = 0
       Desc = 'Jam aktif Update: manual (bukan otomatis)' },
    @{ Path = 'HKLM:\SOFTWARE\Microsoft\WindowsUpdate\UX\Settings'
       Name = 'ActiveHoursStart'; Value = $ActiveHourStart
       Desc = "Jam aktif Update mulai ${ActiveHourStart}:00" },
    @{ Path = 'HKLM:\SOFTWARE\Microsoft\WindowsUpdate\UX\Settings'
       Name = 'ActiveHoursEnd'; Value = $ActiveHourEnd
       Desc = "Jam aktif Update selesai ${ActiveHourEnd}:00" }
)

foreach ($r in $regChanges) {
    if ($PSCmdlet.ShouldProcess("$($r.Path)\$($r.Name) = $($r.Value)", 'Tulis registri')) {
        if (-not (Test-Path $r.Path)) { New-Item -Path $r.Path -Force | Out-Null }
        New-ItemProperty -Path $r.Path -Name $r.Name -Value $r.Value -PropertyType DWord -Force | Out-Null
        Write-Host "OK : $($r.Desc)" -ForegroundColor Green
    }
}

if (-not $WhatIfPreference) {
    Write-Host ''
    Write-Host 'Selesai. Verifikasi dengan: -Info' -ForegroundColor Green
    Write-Host 'Catatan: jangan lupa matikan juga update driver otomatis bila PC lab memakai meteran data.'
}
