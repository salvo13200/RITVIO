param([string]$NodePath,[switch]$Stop,[switch]$Restart)
$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path $PSScriptRoot -Parent
$taskState = Join-Path $taskRoot '.local\ios12\pc-helper'
New-Item -ItemType Directory -Path $taskState -Force | Out-Null
$taskRecord = Join-Path $taskState 'process.json'
$taskOwned = $null
if (Test-Path -LiteralPath $taskRecord) {
    try {
        $taskSaved = Get-Content -LiteralPath $taskRecord -Raw | ConvertFrom-Json
        $taskProcess = Get-Process -Id $taskSaved.pid -ErrorAction Stop
        if ($taskProcess.StartTime.ToUniversalTime().ToString('o') -eq $taskSaved.started -and $taskProcess.Path -eq $taskSaved.executable) { $taskOwned = $taskProcess }
    } catch { $taskOwned = $null }
}
if ($Stop -or $Restart) {
    if ($taskOwned) { $taskOwned.Kill(); $taskOwned.WaitForExit(5000) | Out-Null; $taskOwned = $null }
    if ($Stop) { Write-Output 'Owned RITVIO PC helper stopped. Other apps were not touched.'; exit 0 }
}
if (-not $taskOwned) {
    if (-not $NodePath) { $NodePath = (Get-Command node -ErrorAction Stop).Source }
    $NodePath = (Resolve-Path -LiteralPath $NodePath).Path
    if ((& $NodePath -p 'Number(process.versions.node.split(".")[0])') -lt 24) { throw 'Node 24 or newer is required.' }
    $taskOwned = Start-Process -FilePath $NodePath -ArgumentList @('--import','tsx','apps/ios12-test/server/main.ts') -WorkingDirectory $taskRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $taskState 'stdout.log') -RedirectStandardError (Join-Path $taskState 'stderr.log') -PassThru
    @{pid=$taskOwned.Id;started=$taskOwned.StartTime.ToUniversalTime().ToString('o');executable=$NodePath} | ConvertTo-Json | Set-Content -LiteralPath $taskRecord -Encoding utf8
}
for ($taskAttempt=0; $taskAttempt -lt 30; $taskAttempt++) {
    if ($taskOwned.HasExited) { throw 'PC helper stopped. Inspect .local/ios12/pc-helper/stderr.log.' }
    try {
        $taskResponse = Invoke-WebRequest -Uri 'http://127.0.0.1:59212/setup' -UseBasicParsing -TimeoutSec 2
        if ($taskResponse.StatusCode -eq 200 -and $taskResponse.Content.Contains('RITVIO PC test')) {
            Write-Output 'RITVIO helper ready: http://127.0.0.1:59212/setup'
            Write-Output 'Open that page on the PC for the private address and one-time code. Keep this PC awake.'
            exit 0
        }
    } catch { Start-Sleep -Milliseconds 200 }
}
throw 'PC helper did not become ready. No firewall setting was changed.'
