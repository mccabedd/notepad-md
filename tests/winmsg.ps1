Add-Type -TypeDefinition @"
using System; using System.Collections.Generic; using System.Text; using System.Runtime.InteropServices;
public static class WM {
    delegate bool EnumProc(IntPtr h, IntPtr l);
    [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc cb, IntPtr l);
    [DllImport("user32.dll")] static extern bool EnumChildWindows(IntPtr p, EnumProc cb, IntPtr l);
    [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
    [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern int GetClassName(IntPtr h, StringBuilder sb, int max);
    [DllImport("user32.dll")] public static extern IntPtr GetParent(IntPtr h);
    [DllImport("user32.dll")] public static extern int GetDlgCtrlID(IntPtr h);
    [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
    [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern IntPtr SendMessage(IntPtr h, uint msg, IntPtr w, string l);
    [DllImport("user32.dll")] public static extern IntPtr SendMessage(IntPtr h, uint msg, IntPtr w, IntPtr l);
    [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr h, uint msg, IntPtr w, IntPtr l);
    public static string Cls(IntPtr h) { var sb = new StringBuilder(256); GetClassName(h, sb, 256); return sb.ToString(); }
    public static IntPtr Dialog(uint pid) {
        IntPtr found = IntPtr.Zero;
        EnumWindows((h, l) => { uint p; GetWindowThreadProcessId(h, out p); if (p == pid && Cls(h) == "#32770" && IsWindowVisible(h)) { found = h; return false; } return true; }, IntPtr.Zero);
        return found;
    }
    public static List<IntPtr> Children(IntPtr p) { var list = new List<IntPtr>(); EnumChildWindows(p, (h, l) => { list.Add(h); return true; }, IntPtr.Zero); return list; }
    public static string Dump(IntPtr d) { var sb = new StringBuilder(); foreach (var h in Children(d)) sb.Append(Cls(h) + "#" + GetDlgCtrlID(h) + "<" + Cls(GetParent(h)) + "; "); return sb.ToString(); }
    // File name box: the Edit inside the ComboBox with id 1001 (or the first Edit).
    public static IntPtr NameEdit(IntPtr d) {
        IntPtr first = IntPtr.Zero;
        foreach (var h in Children(d)) { if (Cls(h) != "Edit") continue; if (first == IntPtr.Zero) first = h; var p = GetParent(h); if (Cls(p) == "ComboBox" && GetDlgCtrlID(p) == 1001) return h; }
        return first;
    }
    public static IntPtr TypeCombo(IntPtr d) { foreach (var h in Children(d)) { if (Cls(h) != "ComboBox") continue; bool hasEdit = false; foreach (var c in Children(h)) if (Cls(c) == "Edit") hasEdit = true; if (!hasEdit) return h; } return IntPtr.Zero; }
}
"@ -ErrorAction SilentlyContinue
function Wait-Dialog([int]$procId) { for ($i = 0; $i -lt 40; $i++) { $d = [WM]::Dialog([uint32]$procId); if ($d -ne [IntPtr]::Zero) { return $d }; Start-Sleep -Milliseconds 250 }; return [IntPtr]::Zero }
# Types a full path into the Save dialog and presses Save, using window messages (works on a locked PC).
function Save-DialogMsg([int]$procId, [string]$full, [int]$typeIndex = -1) {
    $d = Wait-Dialog $procId; if ($d -eq [IntPtr]::Zero) { return $false }
    Start-Sleep -Milliseconds 700
    if ($typeIndex -ge 0) {
        $cb = [WM]::TypeCombo($d)
        if ($cb -ne [IntPtr]::Zero) {
            [WM]::SendMessage($cb, 0x014E, [IntPtr]$typeIndex, [IntPtr]::Zero) | Out-Null  # CB_SETCURSEL
            $wp = [IntPtr](([int][WM]::GetDlgCtrlID($cb)) -bor (1 -shl 16))                  # CBN_SELCHANGE
            [WM]::SendMessage([WM]::GetParent($cb), 0x0111, $wp, $cb) | Out-Null
            Start-Sleep -Milliseconds 300
        }
    }
    $e = [WM]::NameEdit($d); if ($e -eq [IntPtr]::Zero) { return $false }
    [WM]::SendMessage($e, 0x000C, [IntPtr]::Zero, $full) | Out-Null                         # WM_SETTEXT
    Start-Sleep -Milliseconds 200
    [WM]::PostMessage($d, 0x0111, [IntPtr]1, [IntPtr]::Zero) | Out-Null                     # WM_COMMAND IDOK
    Start-Sleep -Milliseconds 600
    return $true
}
