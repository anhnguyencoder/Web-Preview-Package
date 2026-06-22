# Web Preview Package

## Generate package links

```powershell
Set-Location "\\oz\PUBLIC_2024\Asset_Unity_3D\Assets\Web Preview Package"
.\scripts\generate-links.ps1
```

## Open web preview

Mở file `index.html` bằng trình duyệt (hoặc chạy local server tĩnh nếu cần).

Trang sẽ đọc dữ liệu từ `data/packages.json`, hiển thị package, mở link bài tốt nhất và cho phép nhúng preview bằng iframe.
