# Hand-run after the user finishes Codex device login in a container.
# This script does not start the login. It refuses to commit an image that is
# not signed in, then commits with the sshd entrypoint restored.
#requires -Version 5
$ErrorActionPreference = 'Continue'
$ProgressPreference = 'SilentlyContinue'
. "$PSScriptRoot\common.ps1"

$container = Resolve-Setting 'ORCA_AUTH_CONTAINER' $null ''
if (-not $container) {
  Write-Err 'Set ORCA_AUTH_CONTAINER to the running base container name.'
  Write-Err 'In that container the user runs: codex login --device-auth'
  exit 2
}

Assert-Docker
$status = Get-ContainerStatus $container
if ($status -ne 'running') {
  Write-Err "Container $container is $status. It must be running."
  exit 2
}

$loginOutput = & docker exec -u orca -e HOME=/home/orca $container codex login status 2>&1
$loginCode = $LASTEXITCODE
foreach ($line in @($loginOutput)) {
  $text = Format-NativeLine $line
  if ($text) { [Console]::Error.WriteLine($text) }
}
if ($loginCode -ne 0) {
  Write-Err 'Codex is not signed in. Not committing an image.'
  Write-Err "Have the user run: docker exec -it -u orca -e HOME=/home/orca $container codex login --device-auth"
  exit 2
}

$statePath = Join-Path $PSScriptRoot 'docker-state.json'
$state = Read-OrcaState
$authImage = Resolve-Setting 'ORCA_DOCKER_AUTH_IMAGE' $null 'waka-pi-orca-ssh:auth'
$commitOutput = & docker commit --change 'ENTRYPOINT ["/usr/local/bin/orca-docker-ssh-entrypoint"]' $container $authImage 2>&1
$commitCode = $LASTEXITCODE
foreach ($line in @($commitOutput)) {
  $text = Format-NativeLine $line
  if ($text) { [Console]::Error.WriteLine($text) }
}
if ($commitCode -ne 0) { throw 'docker commit failed' }

$state.authImage = $authImage
$state | ConvertTo-Json -Depth 6 | Set-Content -Path $statePath -Encoding ascii
Write-Err "Committed $authImage and recorded authImage in docker-state.json."
Write-Err 'Remove the auth container when you are done with it. Do not leave it running.'
