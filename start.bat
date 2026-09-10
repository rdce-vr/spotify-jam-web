@echo off
title Spotify Party Jam
echo ===================================================
echo Starting Spotify Party Jam...
echo ===================================================
cd /d "%~dp0\server"
node server.js
pause
