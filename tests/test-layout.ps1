param([string]$Exe)
$sp = Split-Path $MyInvocation.MyCommand.Path
. "$PSScriptRoot\harness.ps1"
Copy-Item "$PSScriptRoot\fixtures\sample.md" "$sp\test.md" -Force
Start-App $Exe "$sp\test.md"
Install-KeyLog
"Focused: $(Focus-App)"
"Start layout: $(Eval 'layoutMode')"
foreach ($combo in 'CTRL+ALT+2','CTRL+ALT+3','CTRL+ALT+4','CTRL+ALT+1','CTRL+ALT+NUM2','CTRL+ALT+NUM4','CTRL+ALT+NUM1') {
    Send-Combo $combo
    "{0,-16} -> layout={1,-14} keys={2}" -f $combo, (Eval 'layoutMode'), (Pop-KeyLog)
}
Stop-App
