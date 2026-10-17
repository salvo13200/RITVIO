$ErrorActionPreference = 'Stop'
$manager = Get-Command pnpm.cmd -ErrorAction SilentlyContinue
if ($manager) {
    & $manager.Source @args
} else {
    $bundledManager = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\bin\fallback\pnpm.cmd'
    if (-not (Test-Path -LiteralPath $bundledManager)) {
        throw 'pnpm non trovato. Installa Node.js 24 e pnpm, poi riprova.'
    }
    & $bundledManager @args
}
exit $LASTEXITCODE
