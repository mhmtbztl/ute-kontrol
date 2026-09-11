@echo off
title Lexbnb ? Executive Kontrol Merkezi
cd /d "%~dp0"

echo =========================================================
echo   ?? LEXBNB EXECUTIVE CONTROL CENTER
echo =========================================================
echo Sunucu baslatiliyor: http://localhost:3000/
echo Tarayici otomatik aciliyor...
echo.
echo Bu pencereyi ACIK tutun (kapatirsaniz sistem durur).
echo Cikmak icin: Ctrl+C tuslarina basin.
echo =========================================================

start "" http://localhost:3000/
node server.js
