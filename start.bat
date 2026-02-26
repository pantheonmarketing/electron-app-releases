@echo off
title AICO Task Manager
echo.
echo  Starting AICO Task Manager...
echo  (Browser will open automatically)
echo.
echo  Press Ctrl+C to stop the server.
echo.
start http://localhost:3456
node server.js
pause
