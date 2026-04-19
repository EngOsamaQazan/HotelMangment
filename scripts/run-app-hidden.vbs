' Runs the hotel-app dev server in a fully hidden window.
' Invoked by Task Scheduler at user logon.
Option Explicit

Dim shell, fso, projectRoot, logDir, logFile, cmdLine
Set shell = CreateObject("WScript.Shell")
Set fso   = CreateObject("Scripting.FileSystemObject")

projectRoot = fso.GetParentFolderName(fso.GetParentFolderName(WScript.ScriptFullName))
logDir      = fso.BuildPath(projectRoot, ".pm2-logs")
If Not fso.FolderExists(logDir) Then fso.CreateFolder(logDir)
logFile = fso.BuildPath(logDir, "app.log")

' Use cmd.exe so we can redirect both streams.
cmdLine = "cmd /c cd /d """ & projectRoot & """ && npm run dev >> """ & logFile & """ 2>&1"

' 0 = hidden window, False = do not wait
shell.Run cmdLine, 0, False
