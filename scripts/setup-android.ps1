$ErrorActionPreference = 'Stop'
$workspace = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$tools = Join-Path $workspace '.packaging\android-tools'
New-Item -ItemType Directory -Force -Path $tools | Out-Null
function Download-Verified([string]$Url,[string]$Target,[string]$Algorithm,[string]$Hash) {
    if (-not (Test-Path -LiteralPath $Target)) {
        & curl.exe --fail --location --retry 2 --silent --show-error --output $Target $Url
        if ($LASTEXITCODE -ne 0) { throw 'Download Android tools non completato.' }
    }
    if ((Get-FileHash -LiteralPath $Target -Algorithm $Algorithm).Hash.ToLowerInvariant() -ne $Hash.ToLowerInvariant()) { throw ('Checksum non valido: '+$Target) }
}
$jdkArchive = Join-Path $tools 'OpenJDK21U-jdk_x64_windows_hotspot_21.0.12.1_1.zip'
Download-Verified 'https://github.com/adoptium/temurin21-binaries/releases/download/jdk-21.0.12.1%2B1/OpenJDK21U-jdk_x64_windows_hotspot_21.0.12.1_1.zip' $jdkArchive 'SHA256' 'f9d6e191ab098c0d416e7d588a24420a8621cd2f4720dab2459b8b7b2d2d8b4e'
$jdkRoot = Join-Path $tools 'jdk\jdk-21.0.12.1+1'
if (-not (Test-Path -LiteralPath (Join-Path $jdkRoot 'bin\javac.exe'))) { Expand-Archive -LiteralPath $jdkArchive -DestinationPath (Join-Path $tools 'jdk') -Force }
$env:JAVA_HOME = $jdkRoot
$sdk = Join-Path $tools 'sdk'
$androidCli = Join-Path $sdk 'cmdline-tools\latest\bin\android.exe'
if (-not (Test-Path -LiteralPath $androidCli)) {
    [xml]$repository = (Invoke-WebRequest -UseBasicParsing 'https://dl.google.com/android/repository/repository2-3.xml').Content
    $package = $repository.'sdk-repository'.remotePackage | Where-Object path -eq 'cmdline-tools;latest'
    $archive = ($package.archives.archive | Where-Object 'host-os' -eq 'windows').complete
    $zip = Join-Path $tools 'commandlinetools.zip'
    $algorithm = if ($archive.checksum.type) { $archive.checksum.type.Replace('-','').ToUpperInvariant() } else { 'SHA1' }
    $checksum = if ($archive.checksum.'#text') { $archive.checksum.'#text' } else { [string]$archive.checksum }
    Download-Verified ('https://dl.google.com/android/repository/'+$archive.url) $zip $algorithm $checksum
    $bootstrap = Join-Path $tools 'sdk-bootstrap'
    Expand-Archive -LiteralPath $zip -DestinationPath $bootstrap -Force
    $sourceTools = [IO.Path]::GetFullPath((Join-Path $bootstrap 'cmdline-tools'))
    $destTools = [IO.Path]::GetFullPath((Join-Path $sdk 'cmdline-tools\latest'))
    $allowedRoot = $tools + '\'
    if (-not $sourceTools.StartsWith($allowedRoot,[StringComparison]::OrdinalIgnoreCase) -or -not $destTools.StartsWith($allowedRoot,[StringComparison]::OrdinalIgnoreCase)) { throw 'Percorso Android tools non valido.' }
    New-Item -ItemType Directory -Force -Path (Split-Path $destTools) | Out-Null
    Move-Item -LiteralPath $sourceTools -Destination $destTools
}
foreach ($packageName in @('platform-tools','platforms;android-36','build-tools;36.0.0')) {
    & $androidCli "--sdk=$sdk" sdk install $packageName
    if ($LASTEXITCODE -ne 0) { throw ('Installazione SDK fallita: '+$packageName) }
}
Write-Output ('Tool di build locali pronti in '+$tools+'. Python 3.13 richiesto sul PC di sviluppo; i runtime sono inclusi nella APK per il telefono.')
