#!/bin/bash

# Get absolute path of workspace
WORKSPACE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "Starting OpsLens Stack..."

# 1. Clean and Start MySQL/MariaDB Database on port 3307
echo "Starting Database on port 3307..."
rm -f "$WORKSPACE_DIR/db_data/mysql.sock" "$WORKSPACE_DIR/db_data/mysql.sock.lock" "$WORKSPACE_DIR/db_data/mysql.pid"
mysqld \
  --datadir="$WORKSPACE_DIR/db_data" \
  --port=3307 \
  --socket="$WORKSPACE_DIR/db_data/mysql.sock" \
  --pid-file="$WORKSPACE_DIR/db_data/mysql.pid" \
  --mysqlx=OFF \
  --log-error="$WORKSPACE_DIR/db_data/server.log" &
DB_PID=$!

# Wait for DB to start
sleep 3

# 2. Start API Server (app)
echo "Starting API Server..."
cd "$WORKSPACE_DIR/api"
bun run dev &
API_PID=$!

# 3. Start Mobile App
echo "Starting Mobile App..."
cd "$WORKSPACE_DIR/mobile"
bun run start &
MOBILE_PID=$!

# Handle shutdown gracefully
trap "echo 'Stopping all services...'; kill $DB_PID $API_PID $MOBILE_PID; exit" INT TERM EXIT

# Keep script running
wait
