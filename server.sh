#!/bin/bash

# Simple HTTP server using socat and bash
PORT=8080
DOCROOT="/workspaces/Html-Viewer"

serve_file() {
    local requested_path="${1:-/}"
    
    # Default to index.html for root
    if [ "$requested_path" = "/" ]; then
        requested_path="/index.html"
    fi
    
    local file="$DOCROOT$requested_path"
    
    # Security: prevent directory traversal
    local realpath=$(cd "$DOCROOT" && pwd)
    local filereal=$(cd "$(dirname "$file")" 2>/dev/null && pwd)/$(basename "$file")
    
    if [[ ! "$filereal" =~ ^"$realpath" ]]; then
        echo -ne "HTTP/1.1 403 Forbidden\r\nContent-Type: text/plain\r\nConnection: close\r\n\r\n403 Forbidden"
        return
    fi
    
    if [ -f "$file" ]; then
        local size=$(stat --printf=%s "$file" 2>/dev/null)
        local content_type="text/html; charset=utf-8"
        
        if [[ "$file" == *.css ]]; then
            content_type="text/css; charset=utf-8"
        elif [[ "$file" == *.js ]]; then
            content_type="application/javascript; charset=utf-8"
        elif [[ "$file" == *.json ]]; then
            content_type="application/json; charset=utf-8"
        elif [[ "$file" == *.png ]]; then
            content_type="image/png"
        elif [[ "$file" == *.jpg ]]; then
            content_type="image/jpeg"
        elif [[ "$file" == *.svg ]]; then
            content_type="image/svg+xml"
        fi
        
        echo -ne "HTTP/1.1 200 OK\r\nContent-Type: $content_type\r\nContent-Length: $size\r\nAccess-Control-Allow-Origin: *\r\nConnection: close\r\n\r\n"
        cat "$file"
    else
        echo -ne "HTTP/1.1 404 Not Found\r\nContent-Type: text/plain\r\nContent-Length: 13\r\nConnection: close\r\n\r\n404 Not Found"
    fi
}

# Handler for each connection
handler() {
    read -r request_line
    [[ "$request_line" =~ ^([A-Z]+)\ ([^\ ]+)\ HTTP ]]
    local method="${BASH_REMATCH[1]}"
    local path="${BASH_REMATCH[2]}"
    
    # Read headers until blank line
    while read -r line; do
        [[ -z "${line%$'\r'}" ]] && break
    done
    
    serve_file "$path"
}

export -f serve_file
export DOCROOT

echo "Starting HTTP server on port $PORT (serving $DOCROOT)"
socat TCP-LISTEN:$PORT,reuseaddr,fork EXEC:"bash -c 'read -r request_line; (echo \"\$request_line\" | grep -oP \"(?<=\ )[^ ]+(?= HTTP)\" > /tmp/path.txt); while read -r line; do [[ -z \"\${line%$'\''\\r'\''}\" ]] && break; done; serve_file \"\$(cat /tmp/path.txt)\"'"
