#requires -Version 5
$ErrorActionPreference = 'Continue'
$ProgressPreference = 'SilentlyContinue'
. "$PSScriptRoot\common.ps1"

try {
  Assert-Docker
  $payload = Read-LifecyclePayload
  $name = Get-PayloadResourceId $payload
  if (-not $name) { throw 'No resource id in the lifecycle payload.' }
  $status = Get-ContainerStatus $name
  if ($status -eq 'missing') { throw "Container $name does not exist." }
  if ($status -eq 'running') {
    Invoke-Docker -DockerArgs @('stop', $name)
  }
  exit 0
} catch {
  Write-Err $_.Exception.Message
  exit 1
}
