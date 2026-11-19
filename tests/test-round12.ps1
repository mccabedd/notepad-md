param([string]$Exe)
$sp = . "$PSScriptRoot\testdir.ps1"
. "$PSScriptRoot\harness.ps1"
Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes
$results = New-Object System.Collections.ArrayList
function T([string]$name, $actual, [bool]$pass) { [void]$results.Add([pscustomobject]@{ Test = $name; Result = $(if ($pass) { 'PASS' } else { 'FAIL' }); Actual = "$actual" }) }
function J([string]$js) { Eval "(async () => { try { $js } catch (e) { return 'EXC ' + e.message; } })()" }
$work = "$sp\work12"; Remove-Item $work -Recurse -ErrorAction SilentlyContinue; New-Item -ItemType Directory $work | Out-Null
$w = $work.Replace('\', '\\')
$AE = [System.Windows.Automation.AutomationElement]
function Find-Dialog {
    for ($i = 0; $i -lt 40; $i++) {
        $c = New-Object System.Windows.Automation.AndCondition (New-Object System.Windows.Automation.PropertyCondition ($AE::ProcessIdProperty, [int]$script:proc.Id)), (New-Object System.Windows.Automation.PropertyCondition ($AE::ClassNameProperty, '#32770'))
        $d = $AE::RootElement.FindFirst([System.Windows.Automation.TreeScope]::Children, $c)
        if (-not $d) { $m = $AE::FromHandle($script:hwnd); $d = $m.FindFirst([System.Windows.Automation.TreeScope]::Children, (New-Object System.Windows.Automation.PropertyCondition ($AE::ClassNameProperty, '#32770'))) }
        if ($d) { return $d }
        Start-Sleep -Milliseconds 250
    }
}
$CT = [System.Windows.Automation.ControlType]
$TypeOf = @{ '1001' = $CT::Edit; '1' = $CT::Button; 'FileTypeControlHost' = $CT::ComboBox }
function ById($root, $id) {
    $c = New-Object System.Windows.Automation.AndCondition (New-Object System.Windows.Automation.PropertyCondition ($AE::AutomationIdProperty, $id)), (New-Object System.Windows.Automation.PropertyCondition ($AE::ControlTypeProperty, $TypeOf[$id]))
    $root.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $c)
}
Add-Type -AssemblyName System.Windows.Forms
function Dialog-Hwnd {
    for ($i = 0; $i -lt 40; $i++) {
        $d = ([KB]::ProcWindows([uint32]$script:proc.Id)) -split ';' | Where-Object { $_ -like '#32770|*' }
        if ($d) {
            $m = $AE::FromHandle($script:hwnd)
            $e = $m.FindFirst([System.Windows.Automation.TreeScope]::Children, (New-Object System.Windows.Automation.PropertyCondition ($AE::ClassNameProperty, '#32770')))
            if ($e) { return [IntPtr]$e.Current.NativeWindowHandle }
        }
        Start-Sleep -Milliseconds 250
    }
    return [IntPtr]::Zero
}
function Drive([bool]$allFiles, [string]$name) {
    $h = Dialog-Hwnd
    if ($h -eq [IntPtr]::Zero) { return $false }
    Start-Sleep -Milliseconds 600
    [KB]::ForceForeground($h) | Out-Null; Start-Sleep -Milliseconds 300
    if ($allFiles) { [System.Windows.Forms.SendKeys]::SendWait('%t'); Start-Sleep -Milliseconds 300; [System.Windows.Forms.SendKeys]::SendWait('%{DOWN}'); Start-Sleep -Milliseconds 400; [System.Windows.Forms.SendKeys]::SendWait('{END}'); Start-Sleep -Milliseconds 200; [System.Windows.Forms.SendKeys]::SendWait('{ENTER}'); Start-Sleep -Milliseconds 300 }
    [System.Windows.Forms.SendKeys]::SendWait('%n'); Start-Sleep -Milliseconds 200
    [System.Windows.Forms.SendKeys]::SendWait('^a'); Start-Sleep -Milliseconds 100
    [System.Windows.Forms.SendKeys]::SendWait(($name -replace '([+^%~(){}\[\]])', '{$1}')); Start-Sleep -Milliseconds 200
    [System.Windows.Forms.SendKeys]::SendWait('{ENTER}'); Start-Sleep -Milliseconds 500
    return $true
}
function SaveAs([string]$lang, [string]$name, [bool]$allFiles) {
    J "window.__r='pending'; const d=getActive(); invoke('cmd_save_dialog',{filters: saveFilters({...d, lang:'$lang'}), defaultPath:'$w\\Untitled'}).then(r=>window.__r=String(r)); return 1" | Out-Null
    if (-not (Drive $allFiles $name)) { return 'no dialog' }
    for ($i = 0; $i -lt 20; $i++) { $r = J "return window.__r"; if ($r -ne 'pending') { return $r }; Start-Sleep -Milliseconds 200 }
    return 'timeout'
}

Start-App $Exe $null
Focus-App | Out-Null
$r = SaveAs 'markdown' 'config.yml' $true
T 'All Files: config.yml stays config.yml' $r ($r -eq "$work\config.yml")
$r = SaveAs 'markdown' 'notes.txt' $true
T 'All Files: notes.txt stays notes.txt' $r ($r -eq "$work\notes.txt")
$r = SaveAs 'markdown' 'README' $true
T 'All Files: a name with no extension stays as typed' $r ($r -eq "$work\README")
$r = SaveAs 'markdown' 'docker-compose.yaml' $false
T 'Markdown type selected: a typed extension is still kept' $r ($r -eq "$work\docker-compose.yaml")
$r = SaveAs 'markdown' 'plan' $false
T 'Markdown type selected: no extension gets .md' $r ($r -eq "$work\plan.md")
J "return 1" | Out-Null
J "const d=getActive(); d.content='key: value\n'; editor.value=d.content; window.__done=null; saveDocGeneric(d, true).then(x=>window.__done=String(x)); return 1" | Out-Null
Drive $true "$work\settings.yml" | Out-Null; Start-Sleep -Milliseconds 1200
$r = J "return window.__done + '|' + getActive().path + '|' + getActive().lang"
$ok = (Test-Path "$work\settings.yml") -and -not (Test-Path "$work\settings.yml.md")
T 'Save As writes settings.yml (not settings.yml.md) and the tab follows it' "$r exists=$ok" ($ok -and $r -like 'true|*settings.yml|yaml')
Stop-App
$results | Format-Table -AutoSize -Wrap | Out-String -Width 200
"PASS: $(@($results | Where-Object Result -eq 'PASS').Count)  FAIL: $(@($results | Where-Object Result -eq 'FAIL').Count)"
