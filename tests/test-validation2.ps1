param([string]$Exe)
# Phase 2 and 3 checks (JavaScript, Python, shell, PowerShell, CSS, NGINX, HCL, Apache, .env, systemd,
# INI, desktop entries, Dockerfile, Docker Compose structure) and BBCode editing (preview, toolbar).
$sp = . "$PSScriptRoot\testdir.ps1"
. "$PSScriptRoot\harness.ps1"
$results = New-Object System.Collections.ArrayList
function T([string]$name, $actual, [bool]$pass) { [void]$results.Add([pscustomobject]@{ Test = $name; Result = $(if ($pass) { 'PASS' } else { 'FAIL' }); Actual = "$actual" }) }
function J([string]$js) { Eval "(async () => { try { $js } catch (e) { return 'EXC ' + e.message; } })()" }
function Lit([string]$s) { return ($s.Replace("`r`n", "`n") | ConvertTo-Json -Compress) }
function L([string]$s, [string]$pat) { return $s -like $pat.Replace('[', '`[').Replace(']', '`]') }
# Text as language $lang (optionally with a file path), checked now; returns [[line, col, severity, message], ...] or null.
function Check([string]$lang, [string]$text, [string]$path = '', [string]$eol = 'lf') {
    $t = Lit $text
    $p = $path.Replace('\', '\\')
    J "const d = getActive(); d.path = '$p' || null; d.eol = '$eol'; setDocLanguage('$lang'); editor.value = $t; syncFromEditor(); d.diag = null; runValidation(d); for (let i = 0; i < 150 && !(d.diag && d.diag.text === d.content); i++) await new Promise(r => setTimeout(r, 30)); return JSON.stringify(d.diag && d.diag.list.map(x => [x.line + 1, x.col + 1, x.severity, x.message]))"
}
function OK([string]$name, [string]$lang, [string]$text, [string]$path = '') { $r = Check $lang $text $path; T "$name (valid: no problems)" $r ($r -eq '[]') }
function Bad([string]$name, [string]$lang, [string]$text, [string]$pat, [string]$path = '', [string]$eol = 'lf') { $r = Check $lang $text $path $eol; T $name $r (L $r $pat) }

Start-App $Exe $null
Cdp 'Emulation.setDeviceMetricsOverride' @{ width = 1100; height = 700; deviceScaleFactor = 1; mobile = $false } | Out-Null
Cdp 'Emulation.setFocusEmulationEnabled' @{ enabled = $true } | Out-Null
J "addDocAndActivate(newUntitledDoc()); setLayoutMode('edit-only'); return 1" | Out-Null

# --- JavaScript (acorn) ---
OK 'JavaScript' 'javascript' @'
import { a } from './a.js';
export const f = async (x = 1, ...rest) => { const { y, ...z } = x ?? {}; return `${y} ${z?.q}`; };
class K extends Base { #p = 1; static s() { return /re[gx]/g.test('x'); } }
for await (const v of gen()) console.log(v);
'@
Bad 'JavaScript: unclosed string' 'javascript' "const s = 'abc;`nconsole.log(s);" '[[1,11,"error","This string is not closed*'
Bad 'JavaScript: missing bracket' 'javascript' "function f() {`n  if (x {`n    return 1;`n  }`n}" '[[2,9,"error","Unexpected character here*'
Bad 'JavaScript: let declared twice' 'javascript' "let a = 1;`nlet a = 2;" '[[2,*declared twice*'

# --- Python (structure) ---
OK 'Python' 'python' @'
import os

def f(a, b=[1, 2], *args, **kw):
    """Doc "string" with 'quotes'
    over lines."""
    s = f"{a!r} {kw['k']} {{literal}}"
    t = rb'\d+' + r"\\"
    if a:  # comment with ( and "
        return (b +
                [3])
    elif b:
        pass
    else:
        x = {
            'k': [1, 2],
        }
    return x

class C:
    def m(self): return 1
'@
Bad 'Python: unmatched bracket' 'python' "x = (1, 2`ny = 3" '[[1,5,"error","The ( on line 1 is never closed.*'
Bad 'Python: wrong closing bracket' 'python' "x = [1, 2)" '[[1,10,"error","Expected ] to close*'
Bad 'Python: unexpected indent' 'python' "x = 1`n    y = 2" '[[2,*Unexpected indent*'
Bad 'Python: block missing after :' 'python' "if x:`nprint(1)" '[[2,1,"error","Expected an indented block*'
Bad 'Python: dedent to no outer level' 'python' "if x:`n    a = 1`n  b = 2" '[[3,*does not match any outer block*'
Bad 'Python: unclosed string' 'python' "s = 'abc`nt = 1" '[[1,5,"error","This string is not closed*'
Bad 'Python: unclosed triple-quoted string' 'python' "s = '''abc`nmore" '*triple-quoted string is never closed*'

# --- Shell (structure) ---
OK 'Bash' 'bash' @'
#!/bin/bash
set -euo pipefail
# comment with ( and "
name="${1:-world}"   # default
arr=(one "two three" 'four')
echo "Hello $name, ${#arr[@]} items, $((1 + 2)) and $(date +%Y '(x)')"
if [[ -n "$name" && $name != "#" ]]; then
  for i in "${arr[@]}"; do
    echo "$i" | sed 's/#/x/'
  done
elif [ -z "$name" ]; then echo none; else
  while read -r line; do echo "$line"; done < file.txt
fi
case "$1" in
  start|run) echo go ;;
  (stop) echo stop;;
  *) echo "usage" ;;
esac
f() { local x=1; echo $x; }
cat <<EOF
Here doc with ' and " and $(not closed
EOF
cat <<-'END'
	tabbed ( "
	END
echo done # end
'@
Bad 'Shell: missing fi' 'bash' "if true; then`n  echo hi`n" '*The if on line 1 is never closed with fi*'
Bad 'Shell: unclosed double quote' 'bash' "echo `"hello`necho bye" '[[1,6,"error","This double quote on line 1 is never closed*'
Bad 'Shell: done without do' 'bash' "echo a`ndone" '*“done” without a matching do*'
Bad 'Shell: heredoc never ends' 'bash' "cat <<EOF`ntext" '*here-document*never ends*'
Bad 'Shell: unclosed $(' 'bash' 'x=$(ls -l' '*$( on line 1 is never closed*'

# --- PowerShell (structure) ---
OK 'PowerShell' 'powershell' @'
<# block
   comment ( #>
param([string]$Path = "C:\temp")
$h = @{ a = 1; 'b' = "x $($Path.Length) y" }
$s = @"
Here-string with "quotes" and ( brackets
"@
if ($h.a -eq 1) { Write-Host "ok `"quoted`"" } else { Write-Host 'it''s' }
'@
Bad 'PowerShell: missing }' 'powershell' "function f {`n  if (`$a) {`n    1`n}" '*never closed*'
Bad 'PowerShell: unclosed string' 'powershell' "Write-Host `"abc`n`$x = 1" '*double-quoted string on line 1 is never closed*'
Bad 'PowerShell: unclosed here-string' 'powershell' "`$s = @`"`ntext`n" '*here-string*never closed*'

# --- CSS (structure) ---
OK 'CSS' 'css' @'
@import url("a.css");
:root { --gap: 4px; }
/* comment { */
a:hover, .b > c[data-x="}"] { color: red; background: url(x.png) no-repeat; }
@media (max-width: 600px) { .x { margin: 0 } }
.n { & .child { color: blue; } }
'@
Bad 'CSS: missing }' 'css' ".a { color: red;`n.b { color: blue; }" '*{ on line 1 is never closed*'
Bad 'CSS: missing semicolon (warning, with fix)' 'css' ".a {`n  color: red`n  background: blue;`n}" '[[2,13,"warning","A semicolon seems to be missing*'
Bad 'CSS: unclosed comment' 'css' "/* abc`n.a {}" '*comment on line 1 is never closed*'

# --- NGINX (structure) ---
OK 'NGINX' 'nginx' @'
user www-data;
events { worker_connections 1024; }
http {
  # comment ;
  server {
    listen 80;
    server_name example.com "*.example.com";
    location ~ "^/api/(\d{3})$" {
      proxy_pass http://127.0.0.1:8080;
      add_header X-Test "a;b";
    }
    if ($request_method = POST) { return 405; }
  }
}
'@
Bad 'NGINX: missing ;' 'nginx' "server {`n  listen 80`n  server_name x;`n}" '[[2,12,"error","The directive “listen” (line 2) does not end with ;*'
Bad 'NGINX: missing }' 'nginx' "http {`n  server {`n    listen 80;`n}" '*never closed*'

# --- HCL / Terraform (structure) ---
OK 'HCL' 'hcl' @'
# comment
resource "aws_instance" "web" {
  ami           = "ami-123"
  tags = { Name = "web-${var.env}", Other = "%{ if true }x%{ endif }" }
  user_data = <<-EOT
    #!/bin/bash { (
  EOT
  list = [1, 2, [3]]
}
'@
Bad 'HCL: missing }' 'hcl' "resource `"a`" `"b`" {`n  x = 1`n" '*{ on line 1 is never closed*'
Bad 'HCL: unclosed string' 'hcl' "x = `"abc`ny = 1" '*string on line 1 is not closed*'

# --- Apache (structure) ---
OK '.htaccess' 'apache' @'
RewriteEngine On
<IfModule mod_rewrite.c>
  RewriteCond %{HTTPS} off
  RewriteRule ^(.*)$ https://%{HTTP_HOST}/$1 [R=301,L]
  <Files "x.txt">
    Require all denied
  </Files>
</IfModule>
'@
Bad '.htaccess: section not closed' 'apache' "<IfModule x>`n  Require all denied" '*<IfModule> on line 1 is never closed*'
Bad '.htaccess: wrong closing tag' 'apache' "<IfModule x>`n</Files>" '*</Files> does not match the open <IfModule>*'

# --- .env ---
OK '.env' 'env' "# comment`nexport A=1`nB=`"two words`"`nC='x'`nD=`n" 'C:\x\.env'
Bad '.env: trailing spaces in a value (fix offered)' 'env' "API_KEY=abc123   `nB=2" '[[1,15,"warning","Spaces at the end of this value*'
Bad '.env: invisible character' 'env' ("API_KEY=abc" + [char]0x200B + "`n")'*invisible character (U+200B)*'
Bad '.env: line without =' 'env' "API_KEY abc" '[[1,1,"error","Each line must be NAME=value*'
Bad '.env: CRLF line endings' 'env' "A=1`nB=2" '*CRLF*' 'C:\x\.env' 'crlf'
Bad '.env: spaces around =' 'env' "A = 1" '*Spaces around =*'

# --- systemd, INI, desktop ---
OK 'systemd unit' 'systemd' "[Unit]`nDescription=App`n`n[Service]`nExecStart=/usr/bin/app \`n  --flag`nRestart=always`n`n[Install]`nWantedBy=multi-user.target" 'C:\x\app.service'
Bad 'systemd: key before any section' 'systemd' "Description=x`n[Unit]" '[[1,1,"error","Settings must come after a section*' 'C:\x\a.service'
Bad 'systemd: wrong section name' 'systemd' "[unit]`nDescription=x" '*not a systemd section name*' 'C:\x\a.service'
OK 'INI' 'ini' "; c`n[a]`nk = v`nk2: v2`n[b]`nx=1" 'C:\x\a.ini'
OK '.properties (key value form allowed)' 'ini' "a = 1`nb: 2`nc 3" 'C:\x\a.properties'
Bad 'INI: unclosed section header' 'ini' "[abc`nk=v" '*not closed with ]*' 'C:\x\a.ini'
OK 'Desktop entry' 'desktop' "[Desktop Entry]`nName=App`nName[de]=App`nExec=app %U`nType=Application" 'C:\x\a.desktop'
Bad 'Desktop entry: wrong first group' 'desktop' "[Foo]`nName=x" '*must be [Desktop Entry]*' 'C:\x\a.desktop'

# --- Dockerfile ---
OK 'Dockerfile' 'dockerfile' @'
# syntax=docker/dockerfile:1
ARG BASE=alpine
FROM ${BASE}:3.20 AS build
RUN apk add --no-cache curl \
    # a comment inside
    && echo ok
RUN <<EOF
echo hi
EOF
COPY --from=build /a /b
CMD ["sh", "-c", "echo hi"]
'@ 'C:\x\Dockerfile'
Bad 'Dockerfile: unknown instruction (typo fix)' 'dockerfile' "FROM alpine`nRUM echo hi" '[[2,1,"error","“RUM” is not a Dockerfile instruction*'
$r = J "return getActive().diag.list[0].fix && getActive().diag.list[0].fix.label"
T 'Dockerfile: the fix suggests RUN' $r ($r -eq 'Change it to RUN')
Bad 'Dockerfile: must start with FROM' 'dockerfile' "RUN echo hi`nFROM alpine" '[[1,1,"error","A Dockerfile must start with FROM*'
Bad 'Dockerfile: exec form with single quotes' 'dockerfile' "FROM alpine`nCMD ['npm', 'start']" '*will run it as a shell command*'

# --- Docker Compose structure ---
$compose = @'
services:
  web:
    image: nginx:1.27
    ports:
      - "8080:80"
      - "127.0.0.1:8443:443/tcp"
    environment:
      TZ: Europe/London
    depends_on:
      - db
    volumes:
      - ./html:/usr/share/nginx/html:ro
      - data:/data
    networks: [front]
    restart: unless-stopped
  db:
    image: postgres:16
volumes:
  data:
networks:
  front:
'@
OK 'Docker Compose structure' 'compose' $compose 'C:\x\compose.yaml'
Bad 'Compose: unknown setting with a suggestion' 'compose' ($compose -replace 'restart: unless-stopped', 'restar: unless-stopped') '[[15,5,"warning","“restar” is not a Compose service setting. Did you mean “restart”?*'
Bad 'Compose: bad port mapping' 'compose' ($compose -replace '"8080:80"', '"8080:80:90"') '[[5,9,"error","Port mapping “8080:80:90” is not valid*'
Bad 'Compose: depends on a missing service' 'compose' ($compose -replace '- db', '- database') '*depends_on refers to “database”*'
Bad 'Compose: undefined named volume' 'compose' ($compose -replace '- data:/data', '- cache:/data') '*named volume “cache” is not defined*'
Bad 'Compose: undefined network' 'compose' ($compose -replace 'networks: \[front\]', 'networks: [back]') '*network “back” is not defined*'
Bad 'Compose: bad restart value' 'compose' ($compose -replace 'unless-stopped', 'sometimes') '*restart must be*'
$r = Check 'compose' "services:`n  web:`n    image: x`n     restart: no`n" 'C:\x\compose.yaml'
T 'Compose: YAML errors are reported as YAML (not as Compose structure)' $r (L $r '*The indentation of this line*')
$r = J "return getActive().diag.list.map(d => d.title).join('|')"
T 'Compose: the YAML error has the YAML title' $r ($r -eq 'YAML syntax error')

# --- languages without a check ---
$r = J "const d = getActive(); d.path = null; setDocLanguage('sql'); editor.value = 'SELECT 1'; syncFromEditor(); updateStatusBar(); return JSON.stringify([validationMode(d), document.getElementById('status-diag').textContent])"
T 'SQL: not checked, and the status bar says so' $r ($r -eq '[null,"No syntax check"]')

# --- BBCode: the preview takes typing; the toolbar writes BBCode ---
J "const d = getActive(); d.content = ''; d.savedContent = ''; d.dirty = false; await closeTab(d.id); addDocAndActivate(newUntitledDoc()); setLayoutMode('edit-only'); setDocLanguage('bbcode'); return 1" | Out-Null
$p = (J "const b = document.querySelector('.sidebar [data-layout=`"preview-only`"]') || document.querySelector('[data-layout=`"preview-only`"]'); const r = b.getBoundingClientRect(); return JSON.stringify({x: r.left + r.width/2, y: r.top + r.height/2})") | ConvertFrom-Json
Cdp 'Input.dispatchMouseEvent' @{ type = 'mousePressed'; x = $p.x; y = $p.y; button = 'left'; buttons = 1; clickCount = 1 } | Out-Null
Cdp 'Input.dispatchMouseEvent' @{ type = 'mouseReleased'; x = $p.x; y = $p.y; button = 'left'; buttons = 0; clickCount = 1 } | Out-Null
Start-Sleep -Milliseconds 400
Cdp 'Input.insertText' @{ text = 'hello' } | Out-Null
Start-Sleep -Milliseconds 300
$r = J "return JSON.stringify([layoutMode, preview.getAttribute('contenteditable'), document.activeElement === preview, getActive().content])"
T 'BBCode: switching to Preview puts the caret there, ready to type' $r ($r -eq '["preview-only","true",true,"hello"]')
$r = J "const sel = getSelection(); const r = document.createRange(); r.selectNodeContents(preview); sel.removeAllRanges(); sel.addRange(r); lastFocused = 'preview'; runToolbarCommand('bold'); await new Promise(r => setTimeout(r, 100)); return JSON.stringify(getActive().content)"
T 'BBCode preview: Bold writes [b]...[/b] in the source' $r ($r -eq '"[b]hello[/b]"')
$src = '[b]bold[/b] and [i]it[/i] [u]u[/u] [s]s[/s]\n[url=https://example.com]link[/url] [url]https://x.org[/url]\n[quote=Ann]said[/quote]\n[list]\n[*]one\n[*]two\n[/list]\n[center]mid[/center]\n[color=#ff0000]red[/color] [size=5]big[/size]\n[code]x = 1[/code]\nend'
$r = J "const d = getActive(); setLayoutMode('preview-only'); editor.value = '$src'; syncFromEditor(); renderPreview(d); return JSON.stringify([htmlToBBCode(preview) === d.content, htmlToBBCode(preview)])"
T 'BBCode preview: the HTML turns back into the same BBCode' $r (L $r '[true,*')
$r = J "setLayoutMode('edit-only'); editor.value = 'word'; syncFromEditor(); editor.focus(); editor.setSelectionRange(0, 4); lastFocused = 'editor'; runToolbarCommand('bold'); const a = editor.value; runToolbarCommand('bold'); const b = editor.value; editor.setSelectionRange(0, 4); runToolbarCommand('bullet-list'); const c = editor.value; editor.value = 'Title'; syncFromEditor(); editor.setSelectionRange(0, 0); applyHeading(2); const h = editor.value; return JSON.stringify([a, b, c, h])"
T 'BBCode editor: Bold on/off, bullet list, heading' $r ($r -eq '["[b]word[/b]","word","[list]\n[*]word\n[/list]","[h2]Title[/h2]"]')
$r = J "editor.value = 'x'; syncFromEditor(); editor.setSelectionRange(0, 1); runToolbarCommand('table'); const t = editor.value; editor.value = 'x'; syncFromEditor(); editor.setSelectionRange(1, 1); runToolbarCommand('image'); return JSON.stringify([t.includes('[table]') && t.includes('[td]'), editor.value])"
T 'BBCode editor: table and image tags' $r ($r -eq '[true,"x[img]https://[/img]"]')
$r = J "const b = document.querySelector('#toolbar [data-cmd=bold]'); const c = document.querySelector('#toolbar [data-cmd=checklist]'); const h4 = document.querySelector('#toolbar [data-heading=`"4`"]'); const x = [b.title, c.disabled, h4.disabled]; setDocLanguage('markdown'); updateStatusBar(); return JSON.stringify([...x, b.title, c.disabled])"
T 'Toolbar tooltips show BBCode on BBCode tabs, Markdown again elsewhere' $r ($r -eq '["Bold  [b]...[/b]",true,true,"Bold",false]')
J "const d = getActive(); d.content = ''; d.savedContent = ''; d.dirty = false; await closeTab(d.id); return 1" | Out-Null

Stop-App
$results | Format-Table -AutoSize -Wrap | Out-String -Width 220
"PASS: $(@($results | Where-Object Result -eq 'PASS').Count)  FAIL: $(@($results | Where-Object Result -eq 'FAIL').Count)"
