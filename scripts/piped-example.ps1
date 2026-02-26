param(
    [ValidateSet("sub2api", "relay", "claude-relay-service")]
    [string]$Provider = "sub2api"
)

$ErrorActionPreference = "Stop"

$RootDir = Split-Path -Parent $PSScriptRoot
$DebugEnvFile = if ($env:DEBUG_ENV_FILE) { $env:DEBUG_ENV_FILE } else { Join-Path $RootDir ".agent/debug.env" }
$FixtureFile = if ($env:FIXTURE_FILE) { $env:FIXTURE_FILE } else { Join-Path $RootDir "docs/fixtures/ccstatusline-context.sample.json" }

if (-not (Test-Path $DebugEnvFile)) {
    Write-Error "Missing debug env file: $DebugEnvFile"
}

if (-not (Test-Path $FixtureFile)) {
    Write-Error "Missing fixture file: $FixtureFile"
}

$bunCmd = Get-Command bun -ErrorAction SilentlyContinue
if (-not $bunCmd) {
    Write-Error "bun is required but not found on PATH."
}

Get-Content $DebugEnvFile | ForEach-Object {
    if ($_ -match '^\s*#' -or $_ -match '^\s*$') { return }
    if ($_ -match '^\s*([^=]+?)\s*=\s*"?([^"]*)"?\s*$') {
        $name = $matches[1].Trim()
        $value = $matches[2]
        Set-Item -Path "Env:$name" -Value $value
    }
}

switch ($Provider) {
    "sub2api" {
        $baseUrl = $env:SUB2API_BASE_URL
        $authToken = $env:SUB2API_AUTH_TOKEN
        $providerId = "sub2api"
    }
    "relay" {
        $baseUrl = $env:RELAY_BASE_URL
        $authToken = $env:RELAY_AUTH_TOKEN
        $providerId = "claude-relay-service"
    }
    "claude-relay-service" {
        $baseUrl = $env:RELAY_BASE_URL
        $authToken = $env:RELAY_AUTH_TOKEN
        $providerId = "claude-relay-service"
    }
}

if ([string]::IsNullOrWhiteSpace($baseUrl) -or [string]::IsNullOrWhiteSpace($authToken)) {
    Write-Error "Missing credentials for provider '$Provider' in $DebugEnvFile"
}

$env:ANTHROPIC_BASE_URL = $baseUrl
$env:ANTHROPIC_AUTH_TOKEN = $authToken
$env:CC_STATUSLINE_PROVIDER = $providerId

Get-Content $FixtureFile | & bun run src/main.ts --once
