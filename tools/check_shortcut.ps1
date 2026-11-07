param(
  [string]$ShortcutName = "JHELIX CET-4"
)
$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$lnk = Join-Path ([Environment]::GetFolderPath('Desktop')) ($ShortcutName + '.lnk')
if (-not (Test-Path $lnk)) { throw "桌面上没有找到快捷方式：$lnk" }

$s = (New-Object -ComObject WScript.Shell).CreateShortcut($lnk)
$app = $s.Arguments.Trim('"')
$icon = ($s.IconLocation -replace ',\d+$', '')

[PSCustomObject]@{
  Path = $lnk
  Target = $s.TargetPath
  Arguments = $s.Arguments
  WorkingDirectory = $s.WorkingDirectory
  Icon = $s.IconLocation
  TargetExists = (Test-Path $s.TargetPath)
  AppExists = (Test-Path $app)
  IconExists = (Test-Path $icon)
  ProjectRootMatches = ($s.WorkingDirectory -eq $root)
} | ConvertTo-Json -Compress
