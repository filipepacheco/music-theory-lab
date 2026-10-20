Add-Type -AssemblyName System.Drawing
$iconDirectory = Join-Path $PSScriptRoot '../public/icons'
New-Item -ItemType Directory -Force -Path $iconDirectory | Out-Null
foreach ($size in @(180, 192, 512)) {
  $bitmap = [System.Drawing.Bitmap]::new($size, $size)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.Clear([System.Drawing.ColorTranslator]::FromHtml('#4f6ef7'))
  $graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
  $font = [System.Drawing.Font]::new('Consolas', ($size * 0.56), [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
  $format = [System.Drawing.StringFormat]::new()
  $format.Alignment = [System.Drawing.StringAlignment]::Center
  $format.LineAlignment = [System.Drawing.StringAlignment]::Center
  $graphics.DrawString('M', $font, [System.Drawing.Brushes]::White, [System.Drawing.RectangleF]::new(0, 0, $size, $size), $format)
  $bitmap.Save((Join-Path $iconDirectory "app-$size.png"), [System.Drawing.Imaging.ImageFormat]::Png)
  $format.Dispose()
  $font.Dispose()
  $graphics.Dispose()
  $bitmap.Dispose()
}
