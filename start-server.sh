#!/bin/bash
# Start HTTP server and keep it running
cd /workspaces/Html-Viewer
echo "Starting HTTP server on port 8080..."
exec http-server -p 8080 -a 0.0.0.0 -c-1 --cors
