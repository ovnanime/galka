# Готовит скриншоты для карточки магазина.
#
# 1. Срезает системную панель сверху: часы, значки связи, заряд.
#    Граница ищется по левому краю — у панели он чёрный, у приложения
#    тёмно-серый, поэтому переход виден по яркости. Режутся все снимки
#    по одной границе: сжатие JPEG сдвигает её на пиксель, и набор
#    иначе разъезжается по размерам.
#
# 2. Дорисовывает поля по бокам до пропорции 9:16, которую требует RuStore.
#    Экран телефона обычно 9:20, и магазин обрезал бы ему пятую часть высоты.
#    Растягивать нельзя — поплывут пропорции.
#    Цвет поля берётся из более тёмного края строки: фон приложения темнее
#    содержимого, поэтому если карточка упирается в один край, чистый фон
#    даёт второй. Продолжать просто крайний пиксель нельзя — цвет содержимого
#    растянется полосой на всё поле.
#
# Запуск: powershell -File store\pad916.ps1
Add-Type -AssemblyName System.Drawing

$src = Join-Path $PSScriptRoot 'screenshots'
$dst = Join-Path $PSScriptRoot 'screenshots-916'
if (-not (Test-Path $src)) { Write-Host "нет папки $src"; exit 1 }
if (-not (Test-Path $dst)) { New-Item -ItemType Directory -Path $dst | Out-Null }

$codec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
$ep = New-Object System.Drawing.Imaging.EncoderParameters(1)
$ep.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, [int64]95)

# Ниже этой суммы каналов пиксель считается чёрным фоном системной панели
$dark = 12

$files = Get-ChildItem $src -File | Sort-Object Name
if (-not $files) { Write-Host "в $src нет файлов"; exit 1 }

# Первый проход: где у каждого снимка кончается панель
$cut = 0
foreach ($f in $files) {
    $b = [System.Drawing.Bitmap]::FromFile($f.FullName)
    $limit = [int]($b.Height / 6)
    for ($y = 0; $y -lt $limit; $y++) {
        $p = $b.GetPixel(3, $y)
        if (($p.R + $p.G + $p.B) -gt $dark) {
            $ok = $true
            for ($k = 1; $k -le 5; $k++) {
                $q = $b.GetPixel(3, $y + $k)
                if (($q.R + $q.G + $q.B) -le $dark) { $ok = $false; break }
            }
            if ($ok) { if ($y -gt $cut) { $cut = $y }; break }
        }
    }
    $b.Dispose()
}
Write-Host "панель занимает $cut px, режем все снимки по этой границе"

foreach ($f in $files) {
    $b = [System.Drawing.Bitmap]::FromFile($f.FullName)
    $ch = $b.Height - $cut
    $cw = [int][math]::Round($ch * 9.0 / 16.0)
    if ($cw -lt $b.Width) { Write-Host "$($f.Name): кадр шире 9:16, пропускаю"; $b.Dispose(); continue }
    $pad = [int][math]::Floor(($cw - $b.Width) / 2)

    $out = New-Object System.Drawing.Bitmap($cw, $ch)
    $g = [System.Drawing.Graphics]::FromImage($out)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::Half

    # Столбец цвета фона: для каждой строки берём более тёмный из двух краёв
    $bg = New-Object System.Drawing.Bitmap(1, $ch)
    for ($y = 0; $y -lt $ch; $y++) {
        $l = $b.GetPixel(0, ($cut + $y))
        $r = $b.GetPixel(($b.Width - 1), ($cut + $y))
        if (($l.R + $l.G + $l.B) -le ($r.R + $r.G + $r.B)) { $bg.SetPixel(0, $y, $l) }
        else { $bg.SetPixel(0, $y, $r) }
    }

    $g.DrawImage($bg, (New-Object System.Drawing.Rectangle(0, 0, $pad, $ch)),
                      0, 0, 1, $ch, [System.Drawing.GraphicsUnit]::Pixel)
    $g.DrawImage($bg, (New-Object System.Drawing.Rectangle(($pad + $b.Width), 0, ($cw - $pad - $b.Width), $ch)),
                      0, 0, 1, $ch, [System.Drawing.GraphicsUnit]::Pixel)
    $bg.Dispose()

    # Сам кадр по центру, пиксель в пиксель
    $g.DrawImage($b, (New-Object System.Drawing.Rectangle($pad, 0, $b.Width, $ch)),
                     0, $cut, $b.Width, $ch, [System.Drawing.GraphicsUnit]::Pixel)

    $path = Join-Path $dst $f.Name
    $out.Save($path, $codec, $ep)
    $g.Dispose(); $out.Dispose(); $b.Dispose()

    $kb = [math]::Round((Get-Item $path).Length / 1KB)
    Write-Host ("{0,-32} {1}x{2}  поля по {3} px  {4} KB" -f $f.Name, $cw, $ch, $pad, $kb)
}
