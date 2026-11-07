param(
  [string]$Pythonw = "",
  [string]$ShortcutName = "JHELIX CET-4"
)
$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$app = Join-Path $root 'app.py'
$icon = Join-Path $root 'ui\assets\favicon.ico'

if (-not (Test-Path $app)) { throw "找不到 app.py：$app" }
if (-not (Test-Path $icon)) { throw "找不到图标：$icon" }

if (-not $Pythonw) {
  $launcher = Get-Command py.exe -ErrorAction SilentlyContinue
  if ($launcher) {
    try {
      $exe = & $launcher.Source -3 -c "import sys; print(sys.executable)" 2>$null
      if ($LASTEXITCODE -eq 0 -and $exe) {
        $candidate = Join-Path (Split-Path $exe.Trim() -Parent) 'pythonw.exe'
        if (Test-Path $candidate) { $Pythonw = $candidate }
      }
    } catch {}
  }
}
if (-not $Pythonw) {
  $patterns = @(
    (Join-Path $env:LOCALAPPDATA 'Programs\Python\Python*\pythonw.exe'),
    (Join-Path $env:ProgramFiles 'Python*\pythonw.exe')
  )
  foreach ($pattern in $patterns) {
    $found = Get-ChildItem -Path $pattern -ErrorAction SilentlyContinue |
      Where-Object { $_.FullName -notmatch 'WindowsApps|MCPEnv' } |
      Sort-Object FullName -Descending |
      Select-Object -First 1
    if ($found) { $Pythonw = $found.FullName; break }
  }
}
if (-not $Pythonw) {
  $cmd = Get-Command pythonw.exe -ErrorAction SilentlyContinue
  if ($cmd -and $cmd.Source -notmatch 'WindowsApps|MCPEnv') { $Pythonw = $cmd.Source }
}
if (-not $Pythonw) {
  $cmd = Get-Command python.exe -ErrorAction SilentlyContinue
  if ($cmd -and $cmd.Source -notmatch 'WindowsApps|MCPEnv') {
    $candidate = Join-Path (Split-Path $cmd.Source -Parent) 'pythonw.exe'
    if (Test-Path $candidate) { $Pythonw = $candidate }
  }
}
if (-not $Pythonw -or -not (Test-Path $Pythonw)) {
  throw "找不到 pythonw.exe。请先安装 Python 3.8+，或用 -Pythonw 指定完整路径。"
}

$desktop = [Environment]::GetFolderPath('Desktop')
$lnk = Join-Path $desktop ($ShortcutName + '.lnk')
$WshShell = New-Object -ComObject WScript.Shell
$shortcut = $WshShell.CreateShortcut($lnk)
$shortcut.TargetPath = $Pythonw
$shortcut.Arguments = '"' + $app + '"'
$shortcut.WorkingDirectory = $root
$shortcut.IconLocation = $icon + ',0'
$shortcut.Description = 'JHELIX · 四级高频词汇桌面学习工具'
$shortcut.WindowStyle = 1
$shortcut.Save()

Write-Output $lnk
