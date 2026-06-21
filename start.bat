@echo off
rem ============================================================
rem  Slot starten: Server hochfahren + Browser oeffnen
rem  Doppelklick auf diese Datei genuegt.
rem ============================================================
cd /d "%~dp0"
start "" http://localhost:8080
node server.js
