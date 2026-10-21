# Membuat shortcut browser mode kiosk di folder Startup (shell:startup).
#
# Pemakaian:
#   powershell -ExecutionPolicy Bypass -File scripts\setup-shortcut.ps1            # buat shortcut
#   powershell -ExecutionPolicy Bypass -File scripts\setup-shortcut.ps1 -WhatIf    # lihat rencana saja
#   powershell -ExecutionPolicy Bypass -File scripts\setup-shortcut.ps1 -Remove    # hapus shortcut
#   ... -BrowserPath "C:\...\chrome.exe"   # paksa browser tertentu
#
# Catatan: tanpa --incognito supaya izin kamera (Fase 4) tersimpan di profile LabKiosk.

[CmdletBinding(SupportsShouldProcess = $true)]
param(
    [string]$ShortcutName = 'Lab Scan KTM',
    [string]$Url = 'http://localhost:3000',
    [string]$BrowserPath,
    [string]$StartupDir,   # default: folder Startup user (shell:startup)
    [switch]$Remove
)

$ErrorActionPreference = 'Stop'

if (-not $StartupDir) {
    $StartupDir = [Environment]::GetFolderPath('Startup')
}

$shortcutPath = Join-Path $StartupDir "$ShortcutName.lnk"

if ($Remove) {
    if (-not (Test-Path $shortcutPath)) {
        Write-Host "Shortcut tidak ada: $shortcutPath"
        exit 0
    }
    if ($PSCmdlet.ShouldProcess($shortcutPath, 'Hapus shortcut')) {
        Remove-Item $shortcutPath -Force
        Write-Host "Dihapus: $shortcutPath" -ForegroundColor Yellow
    }
    exit 0
}

function Find-Browser {
    # Cari browser Chromium: urutan Chrome -> Brave -> Edge -> Helium.
    $candidates = @(
        # Chrome (per-user dulu, lalu mesin)
        @{ Name = 'Chrome'; Paths = @(
            "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe",
            "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
            "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe") },
        # Brave
        @{ Name = 'Brave'; Paths = @(
            "$env:LOCALAPPDATA\BraveSoftware\Brave-Browser\Application\brave.exe",
            "$env:ProgramFiles\BraveSoftware\Brave-Browser\Application\brave.exe",
            "${env:ProgramFiles(x86)}\BraveSoftware\Brave-Browser\Application\brave.exe") },
        # Edge
        @{ Name = 'Edge'; Paths = @(
            "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
            "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe") },
        # Helium (beberapa versi memakai pola berikut)
        @{ Name = 'Helium'; Paths = @(
            "$env:LOCALAPPDATA\Helium\Application\helium.exe",
            "$env:ProgramFiles\Helium\helium.exe",
            "${env:ProgramFiles(x86)}\Helium\helium.exe") }
    )

    foreach ($candidate in $candidates) {
        foreach ($path in $candidate.Paths) {
            if ($path -and (Test-Path $path)) {
                return @{ Name = $candidate.Name; Path = $path }
            }
        }
    }

    # Fallback: registry App Paths (cara resmi Windows).
    foreach ($app in @('chrome.exe', 'brave.exe', 'msedge.exe')) {
        foreach ($root in @('HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths',
                            'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\App Paths')) {
            $key = Join-Path $root $app
            if (Test-Path $key) {
                $value = (Get-ItemProperty -Path $key).'(default)'
                if ($value -and (Test-Path $value)) {
                    return @{ Name = $app; Path = $value }
                }
            }
        }
    }
    return $null
}

if ($BrowserPath) {
    if (-not (Test-Path $BrowserPath)) {
        Write-Host "GAGAL: -BrowserPath tidak ada: $BrowserPath" -ForegroundColor Red
        exit 1
    }
    $browser = @{ Name = 'manual'; Path = $BrowserPath }
} else {
    $browser = Find-Browser
    if (-not $browser) {
        Write-Host 'GAGAL: tidak menemukan Chrome/Brave/Edge/Helium. Pakai -BrowserPath <path>.' -ForegroundColor Red
        exit 1
    }
}

$arguments = @(
    '--kiosk'
    '--new-window'
    '--no-first-run'
    '--no-default-browser-check'
    '--profile-directory=LabKiosk'
    '--use-fake-ui-for-media-stream'
    '--autoplay-policy=no-user-gesture-required'
    $Url
) -join ' '

Write-Host 'Rencana shortcut:'
Write-Host "  Browser  : $($browser.Name) -> $($browser.Path)"
Write-Host "  Argumen  : $arguments"
Write-Host "  Target   : $shortcutPath"
Write-Host '  Kiosk    : layar penuh, tanpa incognito, profile LabKiosk (izin kamera tersimpan)'

if ($PSCmdlet.ShouldProcess($shortcutPath, 'Buat shortcut kiosk')) {
    if (-not (Test-Path $StartupDir)) {
        New-Item -ItemType Directory -Path $StartupDir -Force | Out-Null
    }
    $shell = New-Object -ComObject WScript.Shell
    $lnk = $shell.CreateShortcut($shortcutPath)
    $lnk.TargetPath = $browser.Path
    $lnk.Arguments = $arguments
    $lnk.WorkingDirectory = Split-Path -Parent $browser.Path
    $lnk.WindowStyle = 1 # normal (kiosk yang menentukan ukurannya)
    $lnk.Description = 'Lab Scan KTM - browser mode kiosk'
    $lnk.Save()

    # Verifikasi isi shortcut.
    $check = $shell.CreateShortcut($shortcutPath)
    Write-Host 'Shortcut dibuat & terverifikasi:' -ForegroundColor Green
    Write-Host "  Target : $($check.TargetPath)"
    Write-Host "  Args   : $($check.Arguments)"
    Write-Host "  Lokasi : $shortcutPath"
}
