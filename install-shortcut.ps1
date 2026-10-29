[CmdletBinding()]
param(
  [string]$ShortcutName = "DeepSeek Harness (AutoFix)",
  [string]$DshPath = "D:\deepseek\DeepSeek Harness.exe",
  [switch]$StartMenu
)

$ErrorActionPreference = "Stop"
$Root = $PSScriptRoot
$Target = Join-Path $Root "start-dsh.cmd"

if (-not (Test-Path -LiteralPath $Target)) {
  throw "Launcher not found: $Target"
}
if ($ShortcutName -eq "DeepSeek Harness") {
  throw "Refusing to overwrite the original DeepSeek Harness shortcut. Use a different -ShortcutName."
}

$wsh = New-Object -ComObject WScript.Shell

function New-DshShortcut([string]$Path) {
  $shortcut = $wsh.CreateShortcut($Path)
  $shortcut.TargetPath = $Target
  $shortcut.WorkingDirectory = $Root
  $shortcut.IconLocation = "$DshPath,0"
  $shortcut.WindowStyle = 1
  $shortcut.Description = "Generate DSH host shims, then start DeepSeek Harness"
  $shortcut.Save()
  Write-Host "Shortcut created/updated: $Path"
}

$desktop = [Environment]::GetFolderPath("Desktop")
New-DshShortcut (Join-Path $desktop "$ShortcutName.lnk")

if ($StartMenu) {
  $programs = [Environment]::GetFolderPath("Programs")
  New-DshShortcut (Join-Path $programs "$ShortcutName.lnk")
}
