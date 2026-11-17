@echo off
REM I See Fish - double-click to start.
REM Uses %USERPROFILE%\Documents\ScryMirror by default. To use another folder:
REM   start.bat --scrymirror "D:\ScryMirror"
cd /d "%~dp0"
if not exist "server.py" (
  echo server.py was not found in: %cd%
  echo Run start.bat from inside the "goldfish" folder, next to server.py and the "static" folder.
  pause
  exit /b 1
)
where py >nul 2>nul && (py -3 server.py %* & goto :end)
where python >nul 2>nul && (python server.py %* & goto :end)
echo Python 3 was not found. Install it from https://www.python.org/downloads/ and tick "Add to PATH".
:end
pause
