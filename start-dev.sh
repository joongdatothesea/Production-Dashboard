#!/bin/bash
cd "/Users/elvin/Desktop/My Document/ZhongDa/Production dashboard/Production-Dashboard"

# Auto-sync in background
(while true; do git pull origin claude/nifty-cerf-6wxrip --quiet 2>/dev/null; sleep 4; done) &
SYNC_PID=$!

echo "✅ 自动同步已启动 (PID: $SYNC_PID)"
echo "🚀 启动开发服务器..."

# Start dev server (foreground)
npm run dev

# Kill sync when dev server stops
kill $SYNC_PID 2>/dev/null
