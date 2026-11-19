# CDP-based key sending (Chromium input pipeline, real KeyboardEvents in the page).
Add-Type -TypeDefinition @"
using System; using System.Runtime.InteropServices;
public static class W32 {
    [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern IntPtr FindWindowEx(IntPtr parent, IntPtr after, string cls, string title);
    [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr h, uint msg, IntPtr w, IntPtr l);
}
"@ -ErrorAction SilentlyContinue

# key spec: modifiers list + key + code + vk
$MOD = @{ ALT = 1; CTRL = 2; META = 4; SHIFT = 8 }

function Send-Key([string[]]$mods, [string]$key, [string]$code, [int]$vk, [string]$text = '') {
    $m = 0; foreach ($x in $mods) { $m = $m -bor $MOD[$x] }
    $down = @{ type = 'rawKeyDown'; modifiers = $m; key = $key; code = $code; windowsVirtualKeyCode = $vk; nativeVirtualKeyCode = $vk }
    $r = Cdp 'Input.dispatchKeyEvent' $down
    if ($text) { Cdp 'Input.dispatchKeyEvent' @{ type = 'char'; modifiers = $m; key = $key; text = $text; unmodifiedText = $text } | Out-Null }
    Cdp 'Input.dispatchKeyEvent' @{ type = 'keyUp'; modifiers = $m; key = $key; code = $code; windowsVirtualKeyCode = $vk; nativeVirtualKeyCode = $vk } | Out-Null
    Start-Sleep -Milliseconds 350   # longer than the 250ms debounce
}

function Close-Dialogs {
    # close native dialogs (#32770) that belong to the app's process only
    $n = 0
    for ($round = 0; $round -lt 4; $round++) {
        $found = $false
        $d = [IntPtr]::Zero
        while ($true) {
            $d = [W32]::FindWindowEx([IntPtr]::Zero, $d, '#32770', $null)
            if ($d -eq [IntPtr]::Zero) { break }
            $pid_ = 0; [void][KB]::GetWindowThreadProcessId($d, [ref]$pid_)
            if ($pid_ -ne $script:proc.Id) { continue }
            [void][W32]::PostMessage($d, 0x0010, [IntPtr]::Zero, [IntPtr]::Zero)  # WM_CLOSE = Cancel
            $found = $true; $n++
        }
        if (-not $found) { break }
        Start-Sleep -Milliseconds 400
    }
    return $n
}

function Has-Dialog { return ((Proc-Windows) -match '#32770') }

Add-Type -TypeDefinition @"
using System; using System.Collections.Generic; using System.Runtime.InteropServices; using System.Text;
public static class DlgFinder {
    delegate bool EnumProc(IntPtr h, IntPtr l);
    [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc cb, IntPtr l);
    [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
    [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern int GetClassName(IntPtr h, StringBuilder sb, int max);
    public static IntPtr[] Dialogs(uint pid) {
        var list = new List<IntPtr>();
        EnumWindows((h, l) => { uint p; GetWindowThreadProcessId(h, out p);
            if (p == pid) { var c = new StringBuilder(64); GetClassName(h, c, 64); if (c.ToString() == "#32770") list.Add(h); }
            return true; }, IntPtr.Zero);
        return list.ToArray();
    }
}
"@ -ErrorAction SilentlyContinue

# Sends a WM_COMMAND button id to the app's dialogs (TaskDialogs ignore WM_CLOSE).
function Press-DialogButton([int]$id) {
    $n = 0
    foreach ($d in [DlgFinder]::Dialogs([uint32]$script:proc.Id)) { [void][W32]::PostMessage($d, 0x0111, [IntPtr]$id, [IntPtr]::Zero); $n++ }
    return $n
}
function Close-PromptCancel { return (Press-DialogButton 2) }

# File dialogs and message boxes accept WM_CLOSE (= Cancel); retry briefly while they appear/close.
function Close-Dialogs {
    $n = 0
    for ($round = 0; $round -lt 4; $round++) {
        $ds = [DlgFinder]::Dialogs([uint32]$script:proc.Id)
        if (-not $ds.Count) { break }
        foreach ($d in $ds) { [void][W32]::PostMessage($d, 0x0010, [IntPtr]::Zero, [IntPtr]::Zero); $n++ }
        Start-Sleep -Milliseconds 400
    }
    return $n
}
