# Download the latest Tabman extension release and prepare it for "Load unpacked".
#
# Usage:
#   irm https://raw.githubusercontent.com/Anshulgada/brave-tab-manager/main/scripts/install-extension.ps1 | iex
#
# Environment variables:
#   TABMAN_EXTENSION_ROOT  where the extension is unpacked (default: %LOCALAPPDATA%\Tabman)

$ErrorActionPreference = "Stop"

$Repository = "Anshulgada/brave-tab-manager"
$DestinationRoot = if ($env:TABMAN_EXTENSION_ROOT) {
    $env:TABMAN_EXTENSION_ROOT
} else {
    Join-Path $env:LOCALAPPDATA "Tabman"
}
$Destination = Join-Path $DestinationRoot "extension-latest"
$Archive = Join-Path $env:TEMP "tabman-extension-latest.zip"
$StableUrl = "https://github.com/$Repository/releases/latest/download/tabmanextension-latest-chrome.zip"

Write-Host "Downloading the Tabman extension ..."
$downloaded = $false
try {
    Invoke-WebRequest -Uri $StableUrl -OutFile $Archive
    $downloaded = $true
} catch {
    $headers = @{ "User-Agent" = "tabman-extension-installer" }
    try {
        $release = Invoke-RestMethod `
            -Uri "https://api.github.com/repos/$Repository/releases/latest" `
            -Headers $headers
        $asset = $release.assets |
            Where-Object { $_.name -like "tabmanextension-*-chrome.zip" } |
            Select-Object -First 1
        if (-not $asset) {
            throw "The latest release does not contain a Tabman extension zip."
        }
        Invoke-WebRequest -Uri $asset.browser_download_url -OutFile $Archive
        $downloaded = $true
    } catch {
        Write-Host ""
        Write-Host "The extension archive could not be downloaded yet."
        Write-Host "Get it from https://github.com/$Repository/releases once a release exists."
        exit 1
    }
}

if ($downloaded) {
    if (Test-Path $Destination) {
        Remove-Item -Recurse -Force $Destination
    }
    New-Item -ItemType Directory -Path $Destination | Out-Null
    Expand-Archive -Path $Archive -DestinationPath $Destination -Force
    Remove-Item -Force $Archive -ErrorAction SilentlyContinue
}

Write-Host ""
Write-Host "Extension unpacked at:"
Write-Host "  $Destination"
Write-Host ""
Write-Host "Next steps"
Write-Host "  1. In Brave open brave://extensions and enable Developer mode."
Write-Host "  2. Choose Load unpacked and select the folder above."
Write-Host "  3. Open the browser side panel and pick Tabman."

$braveCandidates = @(
    "$env:ProgramFiles\BraveSoftware\Brave-Browser\Application\brave.exe",
    "${env:ProgramFiles(x86)}\BraveSoftware\Brave-Browser\Application\brave.exe",
    "$env:LOCALAPPDATA\BraveSoftware\Brave-Browser\Application\brave.exe"
)
$brave = $braveCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if ($brave) {
    Start-Process -FilePath $brave -ArgumentList "brave://extensions"
} else {
    Write-Host "Brave was not found automatically; open brave://extensions manually."
}
