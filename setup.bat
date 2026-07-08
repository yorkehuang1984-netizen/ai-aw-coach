@echo off
title AW-AI Coach Setup
echo.
echo   ========================================
echo     AW-AI Coach - Setup
echo   ========================================
echo.

:: 1. Install npm dependencies
echo   [1/3] Installing dependencies...
call npm install
if errorlevel 1 (
    echo   [FAIL] npm install failed
    pause
    exit /b 1
)
echo         Done.

:: 2. Find C# compiler and build launcher
echo   [2/3] Building launcher...
set CSC=
for %%v in (v4.0.30319 v3.5) do (
    if exist "%SystemRoot%\Microsoft.NET\Framework\%%v\csc.exe" (
        set CSC=%SystemRoot%\Microsoft.NET\Framework\%%v\csc.exe
    )
)
if "%CSC%"=="" (
    echo         .NET Framework compiler not found.
    echo         Install .NET Framework SDK or run manually:
    echo           npm start
    echo         Skipping exe build...
    goto skip_exe
)
"%CSC%" -nologo -target:winexe -reference:System.Windows.Forms.dll -out:"AW-AI-Coach.exe" "launcher.cs" >nul 2>&1
if errorlevel 1 (
    echo         Compilation failed. You can still use: npm start
    goto skip_exe
)
echo         Done ^(AW-AI-Coach.exe^).

:: 3. Create desktop shortcut
echo   [3/3] Creating desktop shortcut...
powershell -NoProfile -Command "$ws=New-Object -ComObject WScript.Shell;$sc=$ws.CreateShortcut([Environment]::GetFolderPath('Desktop')+'\AW-AI-Coach.lnk');$sc.TargetPath=Resolve-Path 'AW-AI-Coach.exe';$sc.WorkingDirectory=(Get-Location).Path;$sc.IconLocation=(Join-Path (Get-Location).Path 'icon.ico')+',0';$sc.Save()" 2>nul
if errorlevel 1 (
    echo         Shortcut creation failed. You can create it manually.
    goto done
)
echo         Done.
goto done

:skip_exe
echo.
echo   ========================================
echo     Setup complete (without desktop launcher).
echo     Start with: npm start
echo   ========================================
pause
exit /b 0

:done
echo.
echo   ========================================
echo     Setup complete!
echo     Desktop shortcut created.
echo     Double-click AW-AI-Coach on desktop.
echo   ========================================
pause
