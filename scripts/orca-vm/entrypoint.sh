#!/bin/bash
set -euo pipefail

mkdir -p /run/sshd

# One host key per container lifetime. The image ships with none.
if ! compgen -G '/etc/ssh/ssh_host_*_key' > /dev/null; then
  ssh-keygen -A
fi

install -d -m 700 -o orca -g orca /home/orca/.ssh
if [ -n "${ORCA_SSH_PUBLIC_KEY:-}" ]; then
  printf '%s\n' "$ORCA_SSH_PUBLIC_KEY" > /home/orca/.ssh/authorized_keys
  chown orca:orca /home/orca/.ssh/authorized_keys
  chmod 600 /home/orca/.ssh/authorized_keys
fi

exec /usr/sbin/sshd -D -e
