#requires -Version 5
$ErrorActionPreference = 'Continue'
$ProgressPreference = 'SilentlyContinue'
. "$PSScriptRoot\common.ps1"

$created = $false
$name = $null
try {
  Assert-Docker
  $instance = [Environment]::GetEnvironmentVariable('ORCA_VM_INSTANCE_ID')
  if (-not $instance) {
    throw 'ORCA_VM_INSTANCE_ID is not set. Destroy finds the container from this id.'
  }
  $recipe = Resolve-Setting 'ORCA_RECIPE_ID' $null 'docker-ssh'
  $name = ConvertTo-ContainerName $recipe $instance

  $state = Read-OrcaState
  $baseImage = Resolve-Setting 'ORCA_DOCKER_IMAGE' $state.baseImage 'waka-pi-orca-ssh:base'
  $authImage = Resolve-Setting 'ORCA_DOCKER_AUTH_IMAGE' $state.authImage ''
  $image = $baseImage
  if ($authImage) {
    if (-not (Test-DockerImage $authImage)) {
      throw "Auth image '$authImage' is set but not present. Build it with docker-auth.ps1, or clear authImage."
    }
    $image = $authImage
  } else {
    Ensure-BaseImage $baseImage
    Write-Err 'Booting the base image. Codex is installed and not signed in. Run scripts/orca-vm/docker-auth.ps1 after device login before expecting a signed-in agent.'
  }

  $repoUrl = Resolve-Setting 'ORCA_REPO_URL' $state.repoUrl 'https://github.com/mbayue/waka-pi.git'
  $repoRef = Resolve-Setting 'ORCA_REPO_REF' $state.repoRef 'main'
  $projectRoot = Resolve-Setting 'ORCA_PROJECT_ROOT' $state.projectRoot '/home/orca/waka-pi'
  $username = Resolve-Setting 'ORCA_SSH_USERNAME' $state.username 'orca'
  $label = Resolve-Setting 'ORCA_SSH_LABEL' $state.label 'waka-pi-docker'
  $identity = Ensure-SshKey
  $publicKey = (Get-Content -Raw (Join-Path (Split-Path $identity) 'id_ed25519.pub')).Trim()

  $status = Get-ContainerStatus $name
  if ($status -eq 'missing') {
    $created = $true
    Invoke-Docker -DockerArgs @('run', '-d', '--name', $name, '-p', '127.0.0.1::22', '-e', "ORCA_SSH_PUBLIC_KEY=$publicKey", $image)
  } elseif ($status -ne 'running') {
    Invoke-Docker -DockerArgs @('start', $name)
  }

  $port = Get-PublishedPort $name
  $hostKey = Wait-HostKey $name
  Update-KnownHost '127.0.0.1' $port $hostKey
  Sync-WorkspaceRepo $name $username $repoUrl $repoRef $projectRoot
  Set-ContainerGitHubAuth $name $username
  Write-SshResult $label $port $username $identity $projectRoot $name $hostKey
} catch {
  Write-Err $_.Exception.Message
  if ($created -and $name) {
    try { Remove-Container $name } catch { Write-Err $_.Exception.Message }
  }
  exit 1
}
