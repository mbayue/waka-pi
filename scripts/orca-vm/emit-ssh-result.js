const [label, port, username, identityFile, projectRoot, resourceId, hostKey] = process.argv.slice(2);

const result = {
  schemaVersion: 1,
  connection: {
    type: "ssh",
    projectRoot,
    target: {
      label,
      host: "127.0.0.1",
      port: Number(port),
      username,
      identityFile,
      identitiesOnly: true,
    },
  },
  userData: {
    provider: "docker",
    resourceId,
    hostKey,
    publishedPort: Number(port),
  },
};

process.stdout.write(`${JSON.stringify(result)}\n`);
