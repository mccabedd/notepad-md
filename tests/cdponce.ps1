function CdpCall([string]$wsUrl, [string]$method, $params) {
    $ws2 = New-Object System.Net.WebSockets.ClientWebSocket
    $ws2.ConnectAsync([Uri]$wsUrl, [Threading.CancellationToken]::None).Wait()
    $msg = @{ id = 1; method = $method; params = $params } | ConvertTo-Json -Depth 10 -Compress
    $ws2.SendAsync([ArraySegment[byte]][Text.Encoding]::UTF8.GetBytes($msg), 'Text', $true, [Threading.CancellationToken]::None).Wait()
    $buf = New-Object byte[] 262144
    $out = ''
    for ($k = 0; $k -lt 5; $k++) {
        $t = $ws2.ReceiveAsync([ArraySegment[byte]]$buf, [Threading.CancellationToken]::None)
        if (-not $t.Wait(3000)) { break }
        $s = [Text.Encoding]::UTF8.GetString($buf, 0, $t.Result.Count); if ($s -match '"id":1') { $out = $s; break }
    }
    $ws2.Dispose(); return $out
}
