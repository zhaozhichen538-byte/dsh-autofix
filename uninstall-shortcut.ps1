[CmdletBinding()]
param(
  [string]$ShortcutName = "DeepSeek Harness (AutoFix)",
  [switch]$StartMenu
)

$targets = @()
$desktop = [Environment]::GetFolderPath("Desktop")
$targets += Join-Path $desktop "$ShortcutName.lnk"

if ($StartMenu) {
  $programs = [Environment]::GetFolderPath("Programs")
  $targets += Join-Path $programs "$ShortcutName.lnk"
}

$removed = 0
foreach ($path in $targets) {
  if (Test-Path -LiteralPath $path) {
    Remove-Item -LiteralPath $path -Force
    Write-Host "Removed: $path"
    $removed++
  }
}

if ($removed -eq 0) {
  Write-Host "No matching shortcuts found."
}
