@echo off
title Studio - Storie di Scuola
cd /d "%~dp0"
if not exist node_modules (
  echo Prima installazione delle dipendenze...
  call npm install
)
echo.
echo Studio in avvio: si aprira' il browser su http://localhost:3000
echo Per chiudere lo Studio chiudi questa finestra.
echo.
start "" http://localhost:3000
call npm run dev
