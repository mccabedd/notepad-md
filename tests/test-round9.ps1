param([string]$Exe)
$sp = . "$PSScriptRoot\testdir.ps1"
. "$PSScriptRoot\harness.ps1"
. "$PSScriptRoot\cdpkeys.ps1"
$results = New-Object System.Collections.ArrayList
function T([string]$name, $actual, [bool]$pass) {
    [void]$results.Add([pscustomobject]@{ Test = $name; Result = $(if ($pass) { 'PASS' } else { 'FAIL' }); Actual = "$actual" })
}
function J([string]$js) { Eval "(async () => { try { $js } catch (e) { return 'EXC ' + e.message + ' @ ' + (e.stack||'').split('\n')[1]; } })()" }
function Mouse([string]$type, [double]$x, [double]$y, [string]$button = 'left', [int]$count = 1) {
    $b = @{ none = 0; left = 1; right = 2 }[$button]
    Cdp 'Input.dispatchMouseEvent' @{ type = $type; x = $x; y = $y; button = $button; buttons = $b; clickCount = $count } | Out-Null
}
function Click([double]$x, [double]$y, [string]$button = 'left') { Mouse 'mouseMoved' $x $y 'none'; Mouse 'mousePressed' $x $y $button; Mouse 'mouseReleased' $x $y $button }
function DblClick([double]$x, [double]$y) { Click $x $y; Mouse 'mousePressed' $x $y 'left' 2; Mouse 'mouseReleased' $x $y 'left' 2 }
function Pt([string]$e) { $r = J "const r=($e); if(!r) return 'none'; return JSON.stringify({x:r.left+Math.min(30,r.width/2),y:r.top+r.height/2})"; if ($r -eq 'none' -or $r -like 'EXC*') { return $null }; return ($r | ConvertFrom-Json) }

Start-App $Exe $null
Focus-App | Out-Null
J "setLayoutMode('edit-only'); editor.value='Ticket: https://example.com/browse/MF-2741 and more text'; editor.dispatchEvent(new Event('input')); window.__opened=null; openUrl=(u)=>{window.__opened=u}; window.__copied=null; clipboard.writeText=async (t)=>{window.__copied=t}; return 1" | Out-Null
Start-Sleep -Milliseconds 300
$p = Pt "editorHighlight.querySelector('.ov-url').getClientRects()[0]"

Click $p.x $p.y 'right'; Start-Sleep -Milliseconds 300
$r = J "return [...ctxMenu.querySelectorAll('.ctx-label')].map(e=>e.textContent).join('|') + '|hidden=' + ctxMenu.classList.contains('hidden')"
T 'Right-click on a link shows the link menu' $r ($r -eq 'Open Link in New Window|Save Link As...|Copy Link|hidden=false')
$q = Pt "[...ctxMenu.querySelectorAll('button')].find(b=>b.textContent.includes('Copy Link')).getBoundingClientRect()"
Click $q.x $q.y; Start-Sleep -Milliseconds 300
$r = J "return String(window.__copied)"
T 'Copy Link copies the whole address' $r ($r -eq 'https://example.com/browse/MF-2741')
Click $p.x $p.y 'right'; Start-Sleep -Milliseconds 300
$q = Pt "[...ctxMenu.querySelectorAll('button')].find(b=>b.textContent.includes('Open Link')).getBoundingClientRect()"
Click $q.x $q.y; Start-Sleep -Milliseconds 300
$r = J "return String(window.__opened)"
T 'Open Link in New Window opens it' $r ($r -eq 'https://example.com/browse/MF-2741')

J "window.__opened=null; return 1" | Out-Null
Click $p.x $p.y; Start-Sleep -Milliseconds 400
$r = J "return String(window.__opened)"
T 'Single click on a link only places the caret' $r ($r -eq 'null')
Start-Sleep -Milliseconds 600
DblClick $p.x $p.y; Start-Sleep -Milliseconds 300
$r = J "return String(window.__opened) + '|' + (editor.selectionStart===editor.selectionEnd)"
T 'Double-click on a link opens it' $r ($r -eq 'https://example.com/browse/MF-2741|true')
J "window.__opened=null; return 1" | Out-Null
$w = Pt "(()=>{const r=document.createRange(); const t=[...editorHighlight.childNodes].find(n=>n.nodeType===3 && n.nodeValue.includes('more')); const i=t.nodeValue.indexOf('more'); r.setStart(t,i); r.setEnd(t,i+4); return r.getClientRects()[0];})()"
DblClick $w.x $w.y; Start-Sleep -Milliseconds 300
$r = J "return String(window.__opened) + '|' + JSON.stringify(editor.value.slice(editor.selectionStart, editor.selectionEnd))"
T 'Double-click on ordinary text still selects the word' $r ($r -eq 'null|"more"')

Click $p.x $p.y 'right'; Start-Sleep -Milliseconds 200
J "document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'})); return 1" | Out-Null
J "editor.value='This is mispeled https://example.com/'; editor.dispatchEvent(new Event('input')); return 1" | Out-Null
Start-Sleep -Milliseconds 1500
$s = Pt "editorHighlight.querySelector('.spell-err').getClientRects()[0]"
Click $s.x $s.y 'right'; Start-Sleep -Milliseconds 1200
$r = J "return [...ctxMenu.querySelectorAll('.ctx-label')].map(e=>e.textContent)[0]"
T 'Spelling menu still shows on a misspelt word' $r ($r -eq 'misspelled')

# Save Link As: the download command (a tiny public page)
$out = "$sp\work8\saved-link.html"; Remove-Item $out -ErrorAction SilentlyContinue
$o = $out.Replace('\', '\\')
$r = J "return String(await invoke('cmd_download_url', { url: 'https://example.com/', path: '$o' }))"
$size = if (Test-Path $out) { (Get-Item $out).Length } else { 0 }
T 'Save Link As downloads the page to the chosen file' "bytes=$r file=$size" ([int]$r -gt 100 -and $size -eq [int]$r -and -not (Test-Path "$out.part"))
$r = J "try { await invoke('cmd_download_url', { url: 'file:///C:/Windows/win.ini', path: '$o' }); return 'allowed'; } catch (e) { return 'refused' }"
T 'Only http(s) links can be saved' $r ($r -eq 'refused')

Stop-App
$results | Format-Table -AutoSize -Wrap | Out-String -Width 220
"PASS: $(@($results | Where-Object Result -eq 'PASS').Count)  FAIL: $(@($results | Where-Object Result -eq 'FAIL').Count)"
