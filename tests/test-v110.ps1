param([string]$Exe)
# v1.1.0: a new tab is ready to type into straight away, however it was opened.
$sp = . "$PSScriptRoot\testdir.ps1"
. "$PSScriptRoot\harness.ps1"
$results = New-Object System.Collections.ArrayList
function T([string]$name, $actual, [bool]$pass) { [void]$results.Add([pscustomobject]@{ Test = $name; Result = $(if ($pass) { 'PASS' } else { 'FAIL' }); Actual = "$actual" }) }
function J([string]$js) { Eval "(async () => { try { $js } catch (e) { return 'EXC ' + e.message; } })()" }
function Click($x, $y, $count = 1) {
    Cdp 'Input.dispatchMouseEvent' @{ type = 'mouseMoved'; x = $x; y = $y } | Out-Null
    for ($c = 1; $c -le $count; $c++) {
        Cdp 'Input.dispatchMouseEvent' @{ type = 'mousePressed'; x = $x; y = $y; button = 'left'; buttons = 1; clickCount = $c } | Out-Null
        Cdp 'Input.dispatchMouseEvent' @{ type = 'mouseReleased'; x = $x; y = $y; button = 'left'; buttons = 0; clickCount = $c } | Out-Null
    }
}
function CtrlN {
    Cdp 'Input.dispatchKeyEvent' @{ type = 'rawKeyDown'; key = 'Control'; code = 'ControlLeft'; windowsVirtualKeyCode = 17; modifiers = 2 } | Out-Null
    Cdp 'Input.dispatchKeyEvent' @{ type = 'rawKeyDown'; key = 'n'; code = 'KeyN'; windowsVirtualKeyCode = 78; modifiers = 2 } | Out-Null
    Cdp 'Input.dispatchKeyEvent' @{ type = 'keyUp'; key = 'n'; code = 'KeyN'; windowsVirtualKeyCode = 78; modifiers = 2 } | Out-Null
    Cdp 'Input.dispatchKeyEvent' @{ type = 'keyUp'; key = 'Control'; code = 'ControlLeft'; windowsVirtualKeyCode = 17; modifiers = 0 } | Out-Null
}

Start-App $Exe $null
Cdp 'Emulation.setDeviceMetricsOverride' @{ width = 1000; height = 650; deviceScaleFactor = 1; mobile = $false } | Out-Null
Cdp 'Emulation.setFocusEmulationEnabled' @{ enabled = $true } | Out-Null

foreach ($view in 'preview-only', 'edit-only', 'split-ep') {
    foreach ($how in '+ tab', 'Ctrl+N', 'File > New', 'double-click the tab bar') {
        # Start typing in an existing tab, as you would before opening a new one.
        J "settings.newTabView = '$view'; const old = docs[0]; setActiveTab(old.id); setLayoutMode('edit-only'); old.content = 'old text'; editor.value = 'old text'; syncFromEditor(); editor.focus(); editor.setSelectionRange(8, 8); window.__old = old.id; window.__n = docs.length; return 1" | Out-Null
        Start-Sleep -Milliseconds 150
        switch ($how) {
            '+ tab' { $p = (J "const b = document.getElementById('tab-new').getBoundingClientRect(); return JSON.stringify({x: b.left + b.width/2, y: b.top + b.height/2})") | ConvertFrom-Json; Click $p.x $p.y }
            'Ctrl+N' { CtrlN }
            'File > New' { J "await window.__TAURI__.event.emit('menu-new'); return 1" | Out-Null }
            'double-click the tab bar' { $p = (J "const wrap = tabbarEl.parentElement.getBoundingClientRect(); const b = document.getElementById('tab-new').getBoundingClientRect(); return JSON.stringify({x: Math.round((b.right + wrap.right) / 2), y: Math.round(wrap.top + wrap.height/2)})") | ConvertFrom-Json; Click $p.x $p.y 2 }
        }
        Start-Sleep -Milliseconds 300
        Cdp 'Input.insertText' @{ text = 'hello' } | Out-Null
        Start-Sleep -Milliseconds 300
        $r = J "const d = getActive(); const old = docs.find(x => x.id === window.__old); return JSON.stringify([docs.length === window.__n + 1, d.id !== window.__old, !d.path, d.layoutMode, (d.content || '').trim(), old.content])"
        T "New tab via $how ($view): typing goes straight into it" $r ($r -eq "[true,true,true,`"$view`",`"hello`",`"old text`"]")
        J "const d = getActive(); d.content = ''; d.savedContent = ''; d.dirty = false; await closeTab(d.id); return 1" | Out-Null
    }
}
J "settings.newTabView = 'preview-only'; applySettings(); return 1" | Out-Null
Stop-App

$results | Format-Table -AutoSize -Wrap | Out-String -Width 220
"PASS: $(@($results | Where-Object Result -eq 'PASS').Count)  FAIL: $(@($results | Where-Object Result -eq 'FAIL').Count)"
