param([string[]]$Task = @(':app:assembleRelease'))
$ErrorActionPreference = 'Stop'
$workspace = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$localTools = Join-Path $workspace '.packaging\android-tools'
if (-not $env:JAVA_HOME -or -not (Test-Path -LiteralPath (Join-Path $env:JAVA_HOME 'bin\javac.exe'))) {
    $localJdk = Get-ChildItem -LiteralPath (Join-Path $localTools 'jdk') -Directory -ErrorAction SilentlyContinue | Select-Object -First 1
    if (-not $localJdk) { throw 'JDK 21 non trovato: esegui scripts/setup-android.ps1 oppure imposta JAVA_HOME.' }
    $env:JAVA_HOME = $localJdk.FullName
}
if (-not $env:ANDROID_HOME) { $env:ANDROID_HOME = Join-Path $localTools 'sdk' }
if (-not (Test-Path -LiteralPath (Join-Path $env:ANDROID_HOME 'platforms\android-36\android.jar'))) { throw 'SDK Android 36 mancante. Esegui scripts/setup-android.ps1.' }
$env:ANDROID_SDK_ROOT = $env:ANDROID_HOME
$env:GRADLE_USER_HOME = Join-Path $localTools 'gradle-home'
if (-not $env:RITVIO_BUILD_PYTHON) {
    $buildPython = Join-Path $env:LOCALAPPDATA 'Programs\Python\Python313\python.exe'
    if (-not (Test-Path -LiteralPath $buildPython)) { throw 'Python 3.13 richiesto per la build. Imposta RITVIO_BUILD_PYTHON al suo python.exe.' }
    $env:RITVIO_BUILD_PYTHON = $buildPython
}
& (Join-Path $workspace 'apps\mobile\android\gradlew.bat') '-p' (Join-Path $workspace 'apps\mobile\android') @Task '--console=plain'
exit $LASTEXITCODE
