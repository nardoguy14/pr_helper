import uvicorn
import os
import sys
from app.main import app

def find_free_port(start_port=8000, max_attempts=10):
    """Find a free port starting from start_port"""
    import socket
    
    for port in range(start_port, start_port + max_attempts):
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
                sock.bind(('localhost', port))
                return port
        except OSError:
            continue
    
    raise RuntimeError(f"Could not find a free port in range {start_port}-{start_port + max_attempts}")

if __name__ == "__main__":
    # Determine if we're running in development or production
    is_dev = os.environ.get('ELECTRON_IS_DEV') == '1' or '--dev' in sys.argv
    
    # Find a free port if 8000 is occupied
    try:
        port = 8000
        # Test if port 8000 is free
        import socket
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
            sock.bind(('localhost', port))
    except OSError:
        # Port 8000 is occupied, find another one
        port = find_free_port(8001)
        print(f"Port 8000 is occupied, using port {port} instead")
    
    print(f"Starting PR Monitor backend on http://localhost:{port}")
    print(f"Development mode: {is_dev}")
    
    uvicorn.run(
        app,  # Pass the app directly instead of string when not reloading
        host="0.0.0.0",
        port=port,
        reload=is_dev,  # Only enable reload in development
        log_level="info"
    )