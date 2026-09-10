#!/bin/bash

# Simple HTTP server in pure bash using socat
PORT=8080
DOCROOT="/workspaces/Html-Viewer"

echo "Starting HTTP server on port $PORT"

# Function to handle HTTP requests
handle_http() {
    local request=""
    while IFS= read -r -t 0.1 line; do
        request="$request$line"$'\n'
        [[ "$line" == $'\r' ]] && break
    done
    
    # Extract the path from the request
    local path=$(echo "$request" | head -1 | awk '{print $2}')
    [[ -z "$path" ]] && path="/"
    
    # Default to index.html for root
    [[ "$path" == "/" ]] && path="/index.html"
    
    # Remove leading slash and construct file path
    local file="${DOCROOT}${path}"
    
    if [[ -f "$file" ]]; then
        local size=$(stat --printf=%s "$file" 2>/dev/null || echo 0)
        echo -ne "HTTP/1.1 200 OK\r\nContent-Type: text/html\r\nContent-Length: $size\r\nConnection: close\r\n\r\n"
        cat "$file"
    else
        echo -ne "HTTP/1.1 404 Not Found\r\nContent-Type: text/plain\r\nContent-Length: 13\r\nConnection: close\r\n\r\n404 Not Found"
    fi
}

export -f handle_http
export DOCROOT

# Start server
socat -v TCP-LISTEN:$PORT,reuseaddr,fork EXEC:"bash -c 'handle_http'"
