@echo off
set CLAUDECODE=
claude -p "Say hello in exactly 5 words" --dangerously-skip-permissions --output-format text --model haiku --max-turns 1
echo.
echo EXIT CODE: %ERRORLEVEL%
pause
