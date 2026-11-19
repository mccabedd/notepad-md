# Folder the tests work in (session, WebView2 profile, sample files, the exe copy under test).
# Set NOTEPADMD_TEST_DIR to choose it; the default is %TEMP%\notepadmd-tests.
$d = if ($env:NOTEPADMD_TEST_DIR) { $env:NOTEPADMD_TEST_DIR } else { Join-Path $env:TEMP 'notepadmd-tests' }
New-Item -ItemType Directory -Force $d | Out-Null
(Resolve-Path $d).Path
