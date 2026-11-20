param([string]$Exe, [int]$Keys = 40)
# Typing speed in JSON files of 100 KB and 1 MB (where syntax checks run), how long a check takes,
# and JavaScript memory. Run once with the old exe and once with the new one to compare.
$sp = . "$PSScriptRoot\testdir.ps1"
. "$PSScriptRoot\harness.ps1"
function J([string]$js) { Eval "(async () => { try { $js } catch (e) { return 'EXC ' + e.message; } })()" }
function Med($a) { $s = @($a | Sort-Object); $s[[int][Math]::Floor($s.Count / 2)] }
$work = "$sp\workbench"; New-Item -ItemType Directory $work -Force | Out-Null
foreach ($size in 100, 1000) {
    $sb = New-Object Text.StringBuilder
    [void]$sb.Append("[`n")
    $i = 0
    while ($sb.Length -lt $size * 1024) { [void]$sb.Append("  {`"id`": $i, `"name`": `"item $i`", `"tags`": [`"a`", `"b`"], `"ok`": true},`n"); $i++ }
    [void]$sb.Append("  {`"id`": -1}`n]`n")
    [IO.File]::WriteAllText("$work\bench$size.json", $sb.ToString(), (New-Object Text.UTF8Encoding $false))
}
$w = $work.Replace('\', '/')
Start-App $Exe $null
Cdp 'Emulation.setDeviceMetricsOverride' @{ width = 1200; height = 800; deviceScaleFactor = 1; mobile = $false } | Out-Null
Cdp 'Emulation.setFocusEmulationEnabled' @{ enabled = $true } | Out-Null
foreach ($size in 100, 1000) {
    J "const d = await openPath('$w/bench$size.json'); setLayoutMode('edit-only'); if (!lineNumbersVisible) toggleLineNumbers(); await new Promise(r => setTimeout(r, 1500)); editor.focus(); editor.setSelectionRange(20, 20); return 1" | Out-Null
    $times = @()
    for ($k = 0; $k -lt $Keys; $k++) {
        $t = J "const t0 = performance.now(); document.execCommand('insertText', false, 'x'); await new Promise(r => requestAnimationFrame(() => setTimeout(r, 0))); return performance.now() - t0"
        $times += [double]$t
    }
    "Typing in a $size KB JSON file (ms per key incl. paint, median of $Keys): $([Math]::Round((Med $times), 1))"
    $v = J "const d = getActive(); if (typeof runValidation !== 'function') return 'n/a'; await new Promise(r => setTimeout(r, 1500)); const t0 = performance.now(); d.diag = null; runValidation(d); for (let i = 0; i < 500 && !(d.diag && d.diag.text === d.content); i++) await new Promise(r => setTimeout(r, 5)); return Math.round(performance.now() - t0) + ' ms, ' + d.diag.list.length + ' problem(s)'"
    "  check of the whole $size KB file: $v"
    J "const d = getActive(); d.content = d.savedContent; d.dirty = false; await closeTab(d.id); return 1" | Out-Null
}
$mem = J "return performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : 'n/a'"
"JavaScript memory after the runs: $mem MB"
Stop-App
