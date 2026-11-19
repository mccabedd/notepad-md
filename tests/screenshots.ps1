param([string]$Exe, [string]$OutDir, [double]$Scale = 1, [int]$Width = 1100, [int]$Height = 700)
# Captures the app's window content in a few standard scenes (light and dark) for visual review.
$sp = . "$PSScriptRoot\testdir.ps1"
. "$PSScriptRoot\harness.ps1"
function J([string]$js) { Eval "(async () => { try { $js } catch (e) { return 'EXC ' + e.message; } })()" }
New-Item -ItemType Directory -Force $OutDir | Out-Null
$doc = "$sp\shots"; New-Item -ItemType Directory -Force $doc | Out-Null
Copy-Item "$PSScriptRoot\fixtures\sample.md" "$doc\sample.md" -Force
$w = $doc.Replace('\', '/')
function Shot([string]$name) {
    Start-Sleep -Milliseconds 400
    $r = Cdp 'Page.captureScreenshot' @{ format = 'png' }
    [IO.File]::WriteAllBytes("$OutDir\$name.png", [Convert]::FromBase64String($r.result.data))
}
Start-App $Exe $null
Cdp 'Emulation.setDeviceMetricsOverride' @{ width = $Width; height = $Height; deviceScaleFactor = $Scale; mobile = $false } | Out-Null
Cdp 'Emulation.setFocusEmulationEnabled' @{ enabled = $true } | Out-Null
J "await openPath('$w/sample.md'); setLayoutMode('split-ep'); editor.focus(); editor.setSelectionRange(0,0); editor.scrollTop = 0; return 1" | Out-Null
foreach ($theme in 'light', 'dark') {
    J "themeOverride = '$theme'; applyTheme(); hideContextMenu(); return 1" | Out-Null
    Shot "$theme-main"
    # Right-click menu on the tab
    $p = (J "const r = document.querySelector('.tab.active').getBoundingClientRect(); return JSON.stringify({x: r.left + 30, y: r.top + r.height / 2})") | ConvertFrom-Json
    Cdp 'Input.dispatchMouseEvent' @{ type = 'mousePressed'; x = $p.x; y = $p.y; button = 'right'; buttons = 2; clickCount = 1 } | Out-Null
    Cdp 'Input.dispatchMouseEvent' @{ type = 'mouseReleased'; x = $p.x; y = $p.y; button = 'right'; buttons = 0; clickCount = 1 } | Out-Null
    Start-Sleep -Milliseconds 300
    $m = (J "const b = ctxMenu.querySelectorAll('button')[1]; if (!b) return 'null'; const r = b.getBoundingClientRect(); return JSON.stringify({x: r.left + 40, y: r.top + r.height / 2})") | ConvertFrom-Json
    if ($m) { Cdp 'Input.dispatchMouseEvent' @{ type = 'mouseMoved'; x = $m.x; y = $m.y } | Out-Null }
    Shot "$theme-menu"
    J "hideContextMenu(); openSettings(); return 1" | Out-Null
    # Tab twice so a checkbox shows the keyboard focus ring
    foreach ($i in 1, 2) { Cdp 'Input.dispatchKeyEvent' @{ type = 'keyDown'; key = 'Tab'; code = 'Tab'; windowsVirtualKeyCode = 9 } | Out-Null; Cdp 'Input.dispatchKeyEvent' @{ type = 'keyUp'; key = 'Tab'; code = 'Tab'; windowsVirtualKeyCode = 9 } | Out-Null }
    Shot "$theme-settings"
    J "closeSettings(true); return 1" | Out-Null
}
Stop-App
