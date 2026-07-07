$ErrorActionPreference = "Stop"

$sourceDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$installDir = Join-Path $env:LOCALAPPDATA "AUTBUS Scanner"
$shortcutPath = Join-Path ([Environment]::GetFolderPath("Desktop")) "AUTBUS Scanner.lnk"

Write-Host "Installing AUTBUS Scanner to:"
Write-Host "  $installDir"
Write-Host ""

$sourceFull = [IO.Path]::GetFullPath($sourceDir).TrimEnd('\')
$installFull = [IO.Path]::GetFullPath($installDir).TrimEnd('\')

if ($sourceFull -ieq $installFull) {
  Write-Host "Source directory is already the install directory. Skipping file copy."
} else {
  New-Item -ItemType Directory -Path $installDir -Force | Out-Null

  Write-Host "Copying files..."
  & robocopy $sourceFull $installFull /E /NFL /NDL /NJH /NJS /NP
  $copyExit = $LASTEXITCODE

  if ($copyExit -ge 8) {
    throw "File copy failed. Robocopy exit code: $copyExit"
  }
}

$startCmd = Join-Path $installDir "start.cmd"
$nodeExe = Join-Path $installDir "runtime\node.exe"

if (!(Test-Path $startCmd)) {
  throw "Start script not found: $startCmd"
}

if (!(Test-Path $nodeExe)) {
  throw "Node runtime not found: $nodeExe"
}

Write-Host "Creating desktop shortcut..."
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $startCmd
$shortcut.WorkingDirectory = $installDir
$shortcut.IconLocation = $nodeExe
$shortcut.Save()

Write-Host ""
Write-Host "Installation complete."
Write-Host "Desktop shortcut: $shortcutPath"
Write-Host ""

$answer = Read-Host "Start AUTBUS Scanner now? [Y/N]"
if ($answer -match "^[Yy]") {
  & $startCmd
}
