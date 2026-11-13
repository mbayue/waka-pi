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
  if ($status -ne 'running') {
    Invoke-Docker -DockerArgs @('start', $name)
  }

  $state = Read-OrcaState
  $projectRoot = Resolve-Setting 'ORCA_PROJECT_ROOT' $state.projectRoot '/home/orca/waka-pi'
  $username = Resolve-Setting 'ORCA_SSH_USERNAME' $state.username 'orca'
  $label = Resolve-Setting 'ORCA_SSH_LABEL' $state.label 'waka-pi-docker'
  $identity = Ensure-SshKey
  $port = Get-PublishedPort $name
  $hostKey = Wait-HostKey $name
  Update-KnownHost '127.0.0.1' $port $hostKey
  Write-SshResult $label $port $username $identity $projectRoot $name $hostKey
} catch {
  Write-Err $_.Exception.Message
  exit 1
}
