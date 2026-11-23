@echo off
setlocal
cd /d "%~dp0" || goto failed

where py >nul 2>&1
if errorlevel 1 goto try_python
py -3 -c "import sys;sys.exit(sys.version_info < (3,8))" >nul 2>&1
if errorlevel 1 goto try_python
py -3 "%~dp0run-local.py"
if errorlevel 1 goto failed
exit /b 0

:try_python
where python >nul 2>&1
if errorlevel 1 goto no_python
python -c "import sys;sys.exit(sys.version_info < (3,8))" >nul 2>&1
if errorlevel 1 goto no_python
python "%~dp0run-local.py"
if errorlevel 1 goto failed
exit /b 0

:no_python
echo Python 3.8 or later is required on this computer.

:failed
echo The local demo could not start. Check the message above.
pause
exit /b 1
