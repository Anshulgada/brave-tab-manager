# Install the Tabman CLI with uv and, optionally, the browser extension.
#
# Usage:
#   irm https://raw.githubusercontent.com/Anshulgada/brave-tab-manager/feat/rebuild/scripts/install.ps1 | iex
#   $env:TABMAN_VERSION = "0.3.14"; irm ... | iex
#
# Environment variables:
#   TABMAN_VERSION         pin a released version (default: latest)
#   TABMAN_ASSUME_YES      set to 1 to accept the extension prompt
#   TABMAN_SKIP_EXTENSION  set to 1 to skip the extension download
#   TABMAN_EXTENSION_ROOT  where the extension is unpacked (default: %LOCALAPPDATA%\Tabman)

$ErrorActionPreference = "Stop"

$Repository = "Anshulgada/brave-tab-manager"
# TODO: switch back to "main" once the rebuild branch is merged.
$Branch = "feat/rebuild"
$MinimumVersion = [version]"0.3.0"
$Version = if ($env:TABMAN_VERSION) { $env:TABMAN_VERSION } else { "latest" }

function Ensure-Uv {
    if (Get-Command uv -ErrorAction SilentlyContinue) {
        return
    }
    Write-Host "uv was not found; installing it first..."
    Invoke-RestMethod -Uri "https://astral.sh/uv/install.ps1" | Invoke-Expression
    $uvBin = Join-Path $env:USERPROFILE ".local\bin"
    if (Test-Path $uvBin) {
        $env:Path = "$uvBin;$env:Path"
    }
    if (-not (Get-Command uv -ErrorAction SilentlyContinue)) {
        throw "uv is still not on PATH. Open a new terminal and run this script again."
    }
}

function Get-TabmanVersion {
    $command = Get-Command tabman -ErrorAction SilentlyContinue
    if (-not $command) {
        return $null
    }
    $raw = & $command.Source --version 2>$null
    if (-not $raw) {
        return $null
    }
    try {
        return [version]($raw.Trim())
    } catch {
        return $null
    }
}

function Install-TabmanCli {
    $spec = if ($Version -eq "latest") { "tabman" } else { "tabman==$Version" }
    Write-Host "Installing $spec ..."
    & uv tool install --force $spec
    if ($LASTEXITCODE -ne 0) {
        Write-Host "The published package could not be installed; using the Git branch."
    }
    $uvBin = Join-Path $env:USERPROFILE ".local\bin"
    if (Test-Path $uvBin) {
        $env:Path = "$uvBin;$env:Path"
    }
    $installed = Get-TabmanVersion
    if ($installed -and $installed -ge $MinimumVersion) {
        return
    }
    $gitSpec = "git+https://github.com/$Repository.git@$Branch"
    Write-Host "Installing $gitSpec (current development build) ..."
    & uv tool install --force $gitSpec
    if ($LASTEXITCODE -ne 0) {
        throw "Tabman could not be installed. Check your network connection and retry."
    }
    $uvBin = Join-Path $env:USERPROFILE ".local\bin"
    if (Test-Path $uvBin) {
        $env:Path = "$uvBin;$env:Path"
    }
    $installed = Get-TabmanVersion
    if (-not $installed) {
        throw "Tabman was installed but `tabman --version` failed. Open a new terminal and retry."
    }
}

function Install-TabmanExtension {
    $destinationRoot = if ($env:TABMAN_EXTENSION_ROOT) {
        $env:TABMAN_EXTENSION_ROOT
    } else {
        Join-Path $env:LOCALAPPDATA "Tabman"
    }
    $destination = Join-Path $destinationRoot "extension-latest"
    $archive = Join-Path $env:TEMP "tabman-extension-latest.zip"
    $url = "https://github.com/$Repository/releases/latest/download/tabmanextension-latest-chrome.zip"

    Write-Host "Downloading the Tabman extension ..."
    try {
        Invoke-WebRequest -Uri $url -OutFile $archive
    } catch {
        Write-Host ""
        Write-Host "The extension archive could not be downloaded yet."
        Write-Host "Get it from https://github.com/$Repository/releases once a release exists."
        return $false
    }

    if (Test-Path $destination) {
        Remove-Item -Recurse -Force $destination
    }
    New-Item -ItemType Directory -Path $destination | Out-Null
    Expand-Archive -Path $archive -DestinationPath $destination -Force
    Remove-Item -Force $archive

    Write-Host ""
    Write-Host "Extension unpacked at:"
    Write-Host "  $destination"
    return $true
}

function Show-NextSteps {
    $extensionPath = Join-Path $env:LOCALAPPDATA "Tabman\extension-latest"
    Write-Host ""
    Write-Host "Next steps"
    Write-Host "  1. tabman --help              show every command"
    Write-Host "  2. tabman config show         check the vault and provider settings"
    Write-Host "  3. tabman import <export>     import a Tabman export into the vault"
    Write-Host "  4. tabman search <text>       search the vault"
    Write-Host "  5. uvx tabman --help          run the CLI without installing it"
    Write-Host ""
    Write-Host "Browser extension"
    Write-Host "  In Brave open brave://extensions, enable Developer mode,"
    Write-Host "  choose Load unpacked, and select:"
    Write-Host "    $extensionPath"
    Write-Host ""
    Write-Host "Docs: https://github.com/$Repository"
}

Ensure-Uv
Install-TabmanCli

$extensionReady = $false
if ($env:TABMAN_SKIP_EXTENSION -ne "1") {
    $answer = "n"
    if ($env:TABMAN_ASSUME_YES -eq "1") {
        $answer = "y"
    } else {
        $answer = Read-Host "Download the Tabman browser extension too? [y/N]"
    }
    if ($answer -match "^(y|yes)$") {
        $extensionReady = Install-TabmanExtension
    }
}

Write-Host ""
Write-Host "Tabman is installed. If 'tabman' is not found, open a new terminal."
$tabman = Get-Command tabman -ErrorAction SilentlyContinue
if ($tabman) {
    & $tabman.Source --version
}
Show-NextSteps
if (-not $extensionReady) {
    Write-Host "  (the extension was not downloaded; run scripts/install-extension.ps1 later)"
}
