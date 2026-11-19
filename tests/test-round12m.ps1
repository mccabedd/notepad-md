param([string]$Exe)
$sp = . "$PSScriptRoot\testdir.ps1"
. "$PSScriptRoot\harness.ps1"; . "$PSScriptRoot\winmsg.ps1"
$results = New-Object System.Collections.ArrayList
function T([string]$name, $actual, [bool]$pass) { [void]$results.Add([pscustomobject]@{ Test = $name; Result = $(if ($pass) { 'PASS' } else { 'FAIL' }); Actual = "$actual" }) }
function J([string]$js) { Eval "(async () => { try { $js } catch (e) { return 'EXC ' + e.message; } })()" }
$work = "$sp\work12"; Remove-Item $work -Recurse -ErrorAction SilentlyContinue; New-Item -ItemType Directory $work | Out-Null
$w = $work.Replace('\', '\')
function SaveAs([string]$lang, [string]$name, [bool]$allFiles) {
    J "window.__r='pending'; const d=getActive(); invoke('cmd_save_dialog',{filters: saveFilters({...d, lang:'$lang'}), defaultPath:'$w\\Untitled'}).then(r=>window.__r=String(r)); return 1" | Out-Null
    if (-not (Save-DialogMsg $script:proc.Id $name $(if ($allFiles) { 1 } else { -1 }))) { return 'no dialog' }
    for ($i = 0; $i -lt 20; $i++) { $r = J "return window.__r"; if ($r -ne 'pending') { return $r }; Start-Sleep -Milliseconds 200 }
    return 'timeout'
}
Start-App $Exe $null
$r = SaveAs 'markdown' 'config.yml' $true
T 'All Files: config.yml stays config.yml' $r ($r -eq "$work\config.yml")
$r = SaveAs 'markdown' 'README' $true
T 'All Files: a name with no extension stays as typed' $r ($r -eq "$work\README")
$r = SaveAs 'markdown' 'docker-compose.yaml' $false
T 'Markdown type selected: a typed extension is still kept' $r ($r -eq "$work\docker-compose.yaml")
$r = SaveAs 'markdown' 'plan' $false
T 'Markdown type selected: no extension gets .md' $r ($r -eq "$work\plan.md")
Stop-App
$results | Format-Table -AutoSize -Wrap | Out-String -Width 200
"PASS: $(@($results | Where-Object Result -eq 'PASS').Count)  FAIL: $(@($results | Where-Object Result -eq 'FAIL').Count)"
