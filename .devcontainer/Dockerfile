{
  "name": "Html-Viewer",
  "image": "mcr.microsoft.com/devcontainers/javascript-node:latest",
  "features": {
    "ghcr.io/devcontainers/features/python:1": {
      "version": "3.11"
    }
  },
  "forwardPorts": [8080],
  "portsAttributes": {
    "8080": {
      "label": "HTML Viewer",
      "onAutoForward": "notify"
    }
  },
  "postCreateCommand": "npm install -g http-server",
  "postStartCommand": "cd /workspaces/Html-Viewer && http-server -p 8080 -a 0.0.0.0 -c-1 --cors > /tmp/server.log 2>&1 &"
}
