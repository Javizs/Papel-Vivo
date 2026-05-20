param(
  [string]$Source = "public/icon-512.png",
  [string]$Output = "build/icon.ico"
)

$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Drawing

$sourcePath = Resolve-Path $Source
$outputPath = Join-Path (Get-Location) $Output
$outputDir = Split-Path -Parent $outputPath

if (-not (Test-Path $outputDir)) {
  New-Item -ItemType Directory -Path $outputDir | Out-Null
}

$sizes = @(256, 128, 64, 48, 32, 16)
$sourceImage = [System.Drawing.Image]::FromFile($sourcePath)
$entries = @()

try {
  foreach ($size in $sizes) {
    $bitmap = New-Object System.Drawing.Bitmap $size, $size, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $stream = New-Object System.IO.MemoryStream

    try {
      $graphics.Clear([System.Drawing.Color]::Transparent)
      $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
      $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
      $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
      $graphics.DrawImage($sourceImage, 0, 0, $size, $size)
      $bitmap.Save($stream, [System.Drawing.Imaging.ImageFormat]::Png)

      $entries += [PSCustomObject]@{
        Size = $size
        Bytes = $stream.ToArray()
      }
    }
    finally {
      $stream.Dispose()
      $graphics.Dispose()
      $bitmap.Dispose()
    }
  }

  $fileStream = [System.IO.File]::Create($outputPath)
  $writer = New-Object System.IO.BinaryWriter $fileStream

  try {
    $writer.Write([UInt16]0)
    $writer.Write([UInt16]1)
    $writer.Write([UInt16]$entries.Count)

    $offset = 6 + (16 * $entries.Count)
    foreach ($entry in $entries) {
      $dimension = if ($entry.Size -eq 256) { 0 } else { $entry.Size }
      $writer.Write([Byte]$dimension)
      $writer.Write([Byte]$dimension)
      $writer.Write([Byte]0)
      $writer.Write([Byte]0)
      $writer.Write([UInt16]1)
      $writer.Write([UInt16]32)
      $writer.Write([UInt32]$entry.Bytes.Length)
      $writer.Write([UInt32]$offset)
      $offset += $entry.Bytes.Length
    }

    foreach ($entry in $entries) {
      $writer.Write($entry.Bytes)
    }
  }
  finally {
    $writer.Dispose()
    $fileStream.Dispose()
  }
}
finally {
  $sourceImage.Dispose()
}

Write-Host "Windows icon created at $Output from $Source"
