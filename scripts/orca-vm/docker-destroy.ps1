#requires -Version 5
$ErrorActionPreference = 'Continue'
$ProgressPreference = 'SilentlyContinue'
. "$PSScriptRoot\common.ps1"

try {
  Assert-Docker
  $payload = Read-LifecyclePayload
  $name = Get-PayloadResourceId $payload
  if (-not $name) { throw 'No resource id or instance id in the lifecycle payload.' }
  $hostKey = [string]$payload.recipeResult.userData.hostKey
  $portValue = $payload.recipeResult.userData.publishedPort
  $port = 0
  if ($portValue) { $port = [int]$portValue }
  $status = Get-ContainerStatus $name
  if ($status -ne 'missing') {
    Remove-Container $name | Out-Null
  }
  if ($hostKey -and $port -gt 0) {
    Remove-KnownHostIfMatch '127.0.0.1' $port $hostKey
  }
  exit 0
} catch {
  Write-Err $_.Exception.Message
  exit 1
}
