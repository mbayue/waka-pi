FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    git \
    openssh-server \
    unzip \
  && rm -rf /var/lib/apt/lists/* \
  && mkdir -p /run/sshd /etc/ssh/sshd_config.d \
  && rm -f /etc/ssh/ssh_host_* \
  && if ls /etc/ssh/ssh_host_* >/dev/null 2>&1; then echo 'host keys must not be baked into the image' >&2; exit 1; fi

# First matching sshd value wins. Ubuntu includes this directory before the
# packaged defaults, so these lines override them.
RUN printf '%s\n' \
  'PasswordAuthentication no' \
  'KbdInteractiveAuthentication no' \
  'PubkeyAuthentication yes' \
  'PermitRootLogin no' \
  'AllowUsers orca' \
  > /etc/ssh/sshd_config.d/orca.conf

RUN curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
    -o /usr/share/keyrings/githubcli-archive-keyring.gpg \
  && printf 'deb [arch=%s signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main\n' \
    "$(dpkg --print-architecture)" > /etc/apt/sources.list.d/github-cli.list \
  && apt-get update \
  && apt-get install -y --no-install-recommends gh \
  && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL https://bun.sh/install | BUN_INSTALL=/usr/local bash \
  && bun --version

ARG CODEX_VERSION=0.167.2
# Install under /opt/codex. The installer defaults to $HOME/.codex, which is
# /root/.codex during the image build and is not traversable by the orca user.
RUN curl -fsSL "https://github.com/openai/codex/releases/download/rust-v${CODEX_VERSION}/install.sh" -o /tmp/codex-install.sh \
  && CODEX_NON_INTERACTIVE=true CODEX_INSTALL_DIR=/usr/local/bin CODEX_HOME=/opt/codex \
    bash /tmp/codex-install.sh --release "${CODEX_VERSION}" \
  && rm -f /tmp/codex-install.sh \
  && chmod -R a+rX /opt/codex \
  && codex --version

# Headless Orca CLI (orca-ide). On Linux, bare `orca` is the screen reader,
# so the launcher name from the server package is orca-ide. Symlink `orca`
# only inside this image, which does not install the screen reader.
ARG ORCA_VERSION=1.4.257
ARG ORCA_SERVER_SHA256=72f42c1f5e66d828375d70a54fda5a5f910b90471948d93eedbc3a9ed19bc840
RUN curl -fsSL "https://github.com/stablyai/orca/releases/download/v${ORCA_VERSION}/orca-server-linux-x64.tar.gz" -o /tmp/orca-server.tar.gz \
  && echo "${ORCA_SERVER_SHA256}  /tmp/orca-server.tar.gz" | sha256sum -c - \
  && tar -xzf /tmp/orca-server.tar.gz -C /opt \
  && rm -f /tmp/orca-server.tar.gz \
  && ln -sf "/opt/orca-server-${ORCA_VERSION}-linux-x64/bin/orca-ide" /usr/local/bin/orca-ide \
  && ln -sf /usr/local/bin/orca-ide /usr/local/bin/orca \
  && orca-ide --version

RUN useradd --create-home --shell /bin/bash orca \
  && install -d -m 700 -o orca -g orca /home/orca/.ssh \
  && su -s /bin/bash orca -c 'codex --version && orca-ide --version'

COPY entrypoint.sh /usr/local/bin/orca-docker-ssh-entrypoint
RUN chmod 755 /usr/local/bin/orca-docker-ssh-entrypoint

EXPOSE 22
ENTRYPOINT ["/usr/local/bin/orca-docker-ssh-entrypoint"]
