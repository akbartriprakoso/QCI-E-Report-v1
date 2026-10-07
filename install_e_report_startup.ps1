[CmdletBinding()]
param([switch]$Elevated)

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path -LiteralPath $PSScriptRoot).Path.TrimEnd('\')
$taskName = 'QCI E-Report'
$firewallName = 'QCI E-Report LAN 8090'
$serverPath = Join-Path $root 'server.js'

function Fail([string]$Message) {
    Write-Host "ERROR: $Message" -ForegroundColor Red
    exit 1
}

try {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($identity)
    if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
        Write-Host 'Memerlukan hak Administrator. Membuka ulang dengan UAC...'
        $args = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ('"{0}"' -f $PSCommandPath), '-Elevated')
        $elevatedProcess = Start-Process -FilePath 'powershell.exe' -Verb RunAs -Wait -PassThru -ArgumentList $args
        if ($null -eq $elevatedProcess) { throw 'Permintaan Administrator dibatalkan.' }
        exit ([int]$elevatedProcess.ExitCode)
    }

    if (-not (Test-Path -LiteralPath $serverPath -PathType Leaf)) { throw 'server.js tidak ditemukan.' }
    if (-not (Test-Path -LiteralPath (Join-Path $root 'node_modules\exceljs\package.json') -PathType Leaf)) {
        throw 'Dependency belum terpasang. Jalankan npm install terlebih dahulu.'
    }

    $nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
    if ($null -eq $nodeCommand) { throw 'Node.js 18 atau lebih baru tidak ditemukan.' }
    $nodePath = $nodeCommand.Source
    $nodeVersion = (& $nodePath --version).Trim()
    $major = [int]($nodeVersion.TrimStart('v').Split('.')[0])
    if ($major -lt 18) { throw "Node.js 18 atau lebih baru diperlukan. Versi terdeteksi: $nodeVersion" }

    $action = New-ScheduledTaskAction -Execute $nodePath `
        -Argument ('"{0}" --lan --port 8090 --data-mode legacy-api --legacy-api-base "http://10.13.5.151:5000/api"' -f $serverPath) `
        -WorkingDirectory $root
    $trigger = New-ScheduledTaskTrigger -AtStartup
    $taskPrincipal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
    $settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries `
        -DontStopIfGoingOnBatteries -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) `
        -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew
    Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger `
        -Principal $taskPrincipal -Settings $settings -Force | Out-Null

    if (Get-Command New-NetFirewallRule -ErrorAction SilentlyContinue) {
        Remove-NetFirewallRule -DisplayName $firewallName -ErrorAction SilentlyContinue
        New-NetFirewallRule -DisplayName $firewallName -Direction Inbound -Action Allow `
            -Protocol TCP -LocalPort 8090 -Profile Domain,Private,Public `
            -RemoteAddress LocalSubnet -Description 'QCI E-Report LAN; limited to the local subnet' | Out-Null
    } else {
        & netsh advfirewall firewall delete rule name=$firewallName | Out-Null
        & netsh advfirewall firewall add rule name=$firewallName dir=in action=allow `
            protocol=TCP localport=8090 profile=any remoteip=localsubnet | Out-Null
        if ($LASTEXITCODE -ne 0) { throw 'Gagal membuat rule Firewall QCI E-Report.' }
    }

    Start-ScheduledTask -TaskName $taskName
    $listening = $false
    for ($i = 0; $i -lt 15; $i++) {
        Start-Sleep -Seconds 1
        $listeners = @(Get-NetTCPConnection -LocalPort 8090 -State Listen -ErrorAction SilentlyContinue)
        foreach ($listener in $listeners) {
            $process = Get-CimInstance Win32_Process -Filter "ProcessId=$($listener.OwningProcess)" -ErrorAction SilentlyContinue
            if ($process -and $process.CommandLine -match [regex]::Escape($root) -and $process.CommandLine -match '(?i)(^|[\\/ ])server\.js([ "\\/]|$)') {
                $listening = $true
                break
            }
        }
        if ($listening) { break }
    }
    if (-not $listening) {
        $info = Get-ScheduledTaskInfo -TaskName $taskName
        throw "Task terdaftar tetapi server belum listen pada port 8090. LastTaskResult=$($info.LastTaskResult)."
    }

    Write-Host ''
    Write-Host 'QCI E-Report aktif otomatis saat Windows mulai dan akan restart jika berhenti.' -ForegroundColor Green
    Write-Host 'URL laptop : http://127.0.0.1:8090'
    $lanIps = @(Get-NetIPAddress -AddressFamily IPv4 -PrefixOrigin Dhcp,Manual -ErrorAction SilentlyContinue |
        Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' } |
        Select-Object -ExpandProperty IPAddress)
    if ($lanIps.Count -gt 0) {
        Write-Host ('URL LAN/HP : ' + (($lanIps | Select-Object -First 3) -join ', '))
    } else {
        Write-Host 'URL LAN/HP : lihat IPv4 Address pada ipconfig'
    }
    Write-Host 'Firewall    : port 8090 dibatasi ke LocalSubnet.'
    Write-Host 'Stop        : jalankan stop_e_report.bat sebagai Administrator.'
    exit 0
} catch {
    Fail $_.Exception.Message
}
