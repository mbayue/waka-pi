# Shared helpers for the Docker SSH recipe. Dot-source only.
# stdout of create/resume is the recipe JSON. Everything else goes to stderr.

$ErrorActionPreference = 'Continue'
$ProgressPreference = 'SilentlyContinue'

function Write-Err([string]$Message) {
  [Console]::Error.WriteLine($Message)
}

function Get-RecipeRoot {
  return $PSScriptRoot
}

function Get-RepoRoot {
  return (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
}

function Read-OrcaState {
  $path = Join-Path (Get-RecipeRoot) 'docker-state.json'
  if (-not (Test-Path $path)) {
    throw "Missing state file: $path"
  }
  return Get-Content -Raw -Path $path | ConvertFrom-Json
}

function Resolve-Setting([string]$Name, $StateValue, [string]$Fallback) {
  $fromEnv = [Environment]::GetEnvironmentVariable($Name)
  if ($fromEnv -and $fromEnv.Trim()) { return $fromEnv.Trim() }
  if ($null -ne $StateValue -and "$StateValue".Trim()) { return "$StateValue".Trim() }
  return $Fallback
}

function ConvertTo-ContainerName([string]$RecipeId, [string]$InstanceId) {
  if (-not $RecipeId -or -not $InstanceId) {
    throw 'Recipe id and instance id are required to name the container.'
  }
  $raw = "orca-$RecipeId-$InstanceId".ToLowerInvariant()
  $clean = [regex]::Replace($raw, '[^a-z0-9._-]', '-')
  $clean = $clean.Trim('-.')
  if ($clean.Length -gt 60) { $clean = $clean.Substring(0, 60).Trim('-.') }
  if (-not $clean) { throw 'Container name is empty.' }
  if ($clean -notmatch '^[a-z0-9]') { $clean = "c$clean" }
  return $clean
}

function Read-LifecyclePayload {
  $reader = New-Object System.IO.StreamReader ([Console]::OpenStandardInput())
  $raw = $reader.ReadToEnd()
  if (-not $raw -or -not $raw.Trim()) {
    throw 'Lifecycle payload is empty.'
  }
  return $raw | ConvertFrom-Json
}

function Get-PayloadResourceId($Payload) {
  $id = $Payload.recipeResult.userData.resourceId
  if ($id) { return [string]$id }
  $instance = [string]$Payload.instanceId
  $recipe = [string]$Payload.recipeId
  if (-not $recipe) { $recipe = 'docker-ssh' }
  if (-not $instance) { return $null }
  return ConvertTo-ContainerName $recipe $instance
}

function Assert-Docker {
  & docker version --format '{{.Server.Version}}' 1>$null 2>$null
  if ($LASTEXITCODE -ne 0) {
    throw 'Docker is not running. Start Docker, then retry the recipe.'
  }
}

function Format-NativeLine($Line) {
  if ($null -eq $Line) { return '' }
  # A blank native stderr line becomes an ErrorRecord whose ToString() is the
  # exception type. Print the message, which is empty for that record.
  if ($Line -is [System.Management.Automation.ErrorRecord]) {
    return ([string]$Line.Exception.Message).TrimEnd()
  }
  return "$Line".TrimEnd()
}

function Write-NativeOutput($Output, [int]$Code, [string]$Failure) {
  foreach ($line in @($Output)) {
    $text = Format-NativeLine $line
    if ($text) { [Console]::Error.WriteLine($text) }
  }
  if ($Code -ne 0) { throw $Failure }
}

function Invoke-Docker([string[]]$DockerArgs) {
  $output = & docker @DockerArgs 2>&1
  $code = $LASTEXITCODE
  Write-NativeOutput $output $code "docker $($DockerArgs -join ' ') failed with exit $code"
}

function Test-DockerImage([string]$Image) {
  $previous = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  & docker image inspect $Image 2>&1 | Out-Null
  $code = $LASTEXITCODE
  $ErrorActionPreference = $previous
  return $code -eq 0
}

function Ensure-BaseImage([string]$Image) {
  if (Test-DockerImage $Image) { return }
  $context = Get-RecipeRoot
  Write-Err "Building $Image"
  $output = & docker build --tag $Image --file (Join-Path $context 'Dockerfile') $context 2>&1
  $code = $LASTEXITCODE
  Write-NativeOutput $output $code "docker build failed for $Image"
}

function Get-ContainerStatus([string]$Name) {
  $previous = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  $status = & docker inspect --format '{{.State.Status}}' $Name 2>&1
  $code = $LASTEXITCODE
  $ErrorActionPreference = $previous
  if ($code -ne 0) { return 'missing' }
  return (($status | Out-String).Trim())
}

function Ensure-SshKey {
  $dir = Join-Path (Get-RecipeRoot) 'keys'
  New-Item -ItemType Directory -Force -Path $dir | Out-Null
  $key = Join-Path $dir 'id_ed25519'
  if (-not (Test-Path $key)) {
    $output = & ssh-keygen -t ed25519 -f $key -N '""' -C 'waka-pi-orca-docker' 2>&1
    $code = $LASTEXITCODE
    Write-NativeOutput $output $code 'ssh-keygen failed'
  }
  return (Resolve-Path $key).Path
}

function Get-PublishedPort([string]$Name) {
  $lines = @(& docker port $Name 22)
  if ($LASTEXITCODE -ne 0) { throw "No published SSH port for $Name" }
  foreach ($line in $lines) {
    $text = "$line".Trim()
    if ($text -match '^127\.0\.0\.1:(\d+)$') {
      return [int]$Matches[1]
    }
  }
  throw "Cannot parse a 127.0.0.1 SSH port for $Name"
}

function Wait-HostKey([string]$Name) {
  for ($i = 0; $i -lt 50; $i++) {
    $line = & docker exec $Name cat /etc/ssh/ssh_host_ed25519_key.pub 2>$null
    if ($LASTEXITCODE -eq 0 -and $line) {
      return ($line | Out-String).Trim()
    }
    Start-Sleep -Milliseconds 200
  }
  throw "Container $Name did not publish an SSH host key."
}

function Update-KnownHost([string]$HostName, [int]$Port, [string]$HostKeyLine) {
  $sshDir = Join-Path $env:USERPROFILE '.ssh'
  New-Item -ItemType Directory -Force -Path $sshDir | Out-Null
  $knownHosts = Join-Path $sshDir 'known_hosts'
  if (-not (Test-Path $knownHosts)) {
    New-Item -ItemType File -Path $knownHosts | Out-Null
  }
  $parts = @($HostKeyLine.Trim() -split '\s+')
  if ($parts.Count -lt 2) { throw 'SSH host key is malformed.' }
  $endpoint = "[${HostName}]:$Port"
  $wanted = "$endpoint $($parts[0]) $($parts[1])"
  $exists = $false
  foreach ($line in @(Get-Content $knownHosts -ErrorAction SilentlyContinue)) {
    if ($line.Trim() -eq $wanted) { $exists = $true }
  }
  if ($exists) { return }
  & cmd.exe /c "ssh-keygen -R `"$endpoint`" -f `"$knownHosts`" >NUL 2>&1"
  Add-Content -Path $knownHosts -Value $wanted -Encoding ascii
}

function Remove-KnownHostIfMatch([string]$HostName, [int]$Port, [string]$HostKeyLine) {
  if (-not $HostKeyLine -or $Port -lt 1) { return }
  $knownHosts = Join-Path $env:USERPROFILE '.ssh\known_hosts'
  if (-not (Test-Path $knownHosts)) { return }
  $parts = @($HostKeyLine.Trim() -split '\s+')
  if ($parts.Count -lt 2) { return }
  $endpoint = "[${HostName}]:$Port"
  $wanted = "$endpoint $($parts[0]) $($parts[1])"
  $matched = $false
  foreach ($line in @(Get-Content $knownHosts)) {
    if ($line.Trim() -eq $wanted) { $matched = $true }
  }
  if (-not $matched) { return }
  & cmd.exe /c "ssh-keygen -R `"$endpoint`" -f `"$knownHosts`" >NUL 2>&1"
}

function Invoke-RemoteBash([string]$Name, [string]$User, [string]$Script, [string[]]$Environment) {
  # PowerShell pipes add CR. Pass the script as base64 so bash sees LF only.
  $lf = $Script -replace "`r", ''
  $encoded = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($lf))
  $dockerArgs = @('exec', '-u', $User, '-e', 'HOME=/home/orca')
  foreach ($item in @($Environment)) {
    if ($item) { $dockerArgs += @('-e', $item) }
  }
  $dockerArgs += @($Name, 'bash', '-lc', "printf '%s' '$encoded' | base64 -d | bash -s")
  $output = & docker @dockerArgs 2>&1
  return @{ Output = $output; Code = $LASTEXITCODE }
}

function Sync-WorkspaceRepo([string]$Name, [string]$User, [string]$RepoUrl, [string]$RepoRef, [string]$ProjectRoot) {
  $script = @'
set -euo pipefail
export GIT_TERMINAL_PROMPT=0
if [ ! -d "$ORCA_PROJECT_ROOT/.git" ]; then
  git clone "$ORCA_REPO_URL" "$ORCA_PROJECT_ROOT"
fi
cd "$ORCA_PROJECT_ROOT"
git fetch origin "$ORCA_REPO_REF"
git checkout -B "$ORCA_REPO_REF" FETCH_HEAD
bun install
bun run build
'@
  $result = Invoke-RemoteBash $Name $User $script @(
    "ORCA_REPO_URL=$RepoUrl",
    "ORCA_REPO_REF=$RepoRef",
    "ORCA_PROJECT_ROOT=$ProjectRoot"
  )
  Write-NativeOutput $result.Output $result.Code 'Repo sync inside the container failed.'
}

function Set-ContainerGitHubAuth([string]$Name, [string]$User) {
  $token = Resolve-Setting 'GH_TOKEN' $null ''
  if (-not $token) { $token = Resolve-Setting 'GITHUB_TOKEN' $null '' }
  if (-not $token) {
    $previous = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    $raw = & gh auth token 2>$null
    $code = $LASTEXITCODE
    $ErrorActionPreference = $previous
    if ($code -eq 0 -and $raw) { $token = ($raw | Out-String).Trim() }
  }
  if (-not $token) {
    Write-Err 'No GH_TOKEN, GITHUB_TOKEN, or gh auth token. Public fetch works. Push from the container stays unauthorized until GitHub auth is configured.'
    return
  }
  $script = @'
set -euo pipefail
printf '%s\n' "$ORCA_GIT_TOKEN" | gh auth login --hostname github.com --git-protocol https --with-token >/dev/null
gh auth setup-git >/dev/null
unset ORCA_GIT_TOKEN
'@
  $result = Invoke-RemoteBash $Name $User $script @("ORCA_GIT_TOKEN=$token")
  if ($result.Code -ne 0) {
    Write-NativeOutput $result.Output $result.Code 'GitHub auth inside the container failed. The token was not written to the repo.'
  }
}

function Write-SshResult(
  [string]$Label,
  [int]$Port,
  [string]$Username,
  [string]$IdentityFile,
  [string]$ProjectRoot,
  [string]$ResourceId,
  [string]$HostKey
) {
  $emitter = Join-Path (Get-RecipeRoot) 'emit-ssh-result.js'
  & node $emitter $Label "$Port" $Username $IdentityFile $ProjectRoot $ResourceId $HostKey
  if ($LASTEXITCODE -ne 0) { throw 'Failed to write the recipe JSON.' }
}

function Remove-Container([string]$Name) {
  $output = & docker rm -f $Name 2>&1
  $code = $LASTEXITCODE
  Write-NativeOutput $output $code "docker rm failed for $Name"
}
