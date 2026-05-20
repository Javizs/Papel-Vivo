param(
  [string]$Source = "public/icon-512.png",
  [string]$ResDir = "android/app/src/main/res"
)

$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Drawing

$sourcePath = Resolve-Path $Source
$resPath = Resolve-Path $ResDir
$sourceImage = [System.Drawing.Image]::FromFile($sourcePath)

$icons = @(
  @{ Dir = "mipmap-mdpi"; Size = 48 },
  @{ Dir = "mipmap-hdpi"; Size = 72 },
  @{ Dir = "mipmap-xhdpi"; Size = 96 },
  @{ Dir = "mipmap-xxhdpi"; Size = 144 },
  @{ Dir = "mipmap-xxxhdpi"; Size = 192 }
)

try {
  foreach ($icon in $icons) {
    $targetDir = Join-Path $resPath $icon.Dir
    if (-not (Test-Path $targetDir)) {
      New-Item -ItemType Directory -Path $targetDir | Out-Null
    }

    foreach ($name in @("ic_launcher.png", "ic_launcher_round.png", "ic_launcher_foreground.png")) {
      $bitmap = New-Object System.Drawing.Bitmap $icon.Size, $icon.Size, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
      $graphics = [System.Drawing.Graphics]::FromImage($bitmap)

      try {
        $graphics.Clear([System.Drawing.Color]::Transparent)
        $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
        $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
        $graphics.DrawImage($sourceImage, 0, 0, $icon.Size, $icon.Size)
        $bitmap.Save((Join-Path $targetDir $name), [System.Drawing.Imaging.ImageFormat]::Png)
      }
      finally {
        $graphics.Dispose()
        $bitmap.Dispose()
      }
    }
  }
}
finally {
  $sourceImage.Dispose()
}

Write-Host "Android launcher icons created in $ResDir from $Source"
