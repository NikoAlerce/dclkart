$ErrorActionPreference = "Stop"

Write-Host "=== INICIANDO PREPARACION DE DEPLOY PARA DECENTRALAND ===" -ForegroundColor Cyan

$src = "C:\niko\escritorio\bakup\mariokart2"
$dest = "C:\niko\escritorio\bakup\mariokart2_deploy"

# 1. Limpiar destino si existe
if (Test-Path $dest) {
    Write-Host "Eliminando carpeta de deploy anterior..." -ForegroundColor Yellow
    Remove-Item -Path $dest -Recurse -Force
}

# 2. Copiar archivos del proyecto (excluyendo git, node_modules y copias de seguridad)
Write-Host "Copiando archivos del proyecto..." -ForegroundColor Gray
robocopy $src $dest /E /XD node_modules .git .texbak /R:1 /W:1 | Out-Null

# 3. Copiar node_modules usando robocopy multihilo para máxima velocidad
Write-Host "Copiando node_modules (esto puede tomar unos segundos)..." -ForegroundColor Gray
robocopy "$src\node_modules" "$dest\node_modules" /E /MT:8 /R:1 /W:1 | Out-Null

# 4. Correr la optimización de GLBs en la carpeta de deploy
Write-Host "Ejecutando optimización de modelos GLB (Texturas 512px + Draco)..." -ForegroundColor Yellow
Push-Location $dest
try {
    node tools/optimize_glbs_deploy.mjs
}
finally {
    Pop-Location
}

Write-Host "=== PROCESO COMPLETADO EXITOSAMENTE ===" -ForegroundColor Green
Write-Host "La carpeta optimizada está lista en: $dest" -ForegroundColor Green
Write-Host "Para desplegar a Decentraland, abre una terminal en esa carpeta y ejecuta:" -ForegroundColor Cyan
Write-Host "npm run deploy" -ForegroundColor Yellow
