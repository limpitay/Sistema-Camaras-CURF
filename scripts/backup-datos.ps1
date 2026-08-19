# Backup diario de backend/data (camaras.db + fotos subidas) y del .env.
# Pensado para correr desatendido via el Programador de tareas de Windows
# (ver scripts/instalar-backup.ps1). No requiere que Docker este corriendo:
# copia los archivos directamente del disco (bind mount), no via sqlite3/API.
#
# Nota: camaras.db usa modo WAL, asi que se copian tambien camaras.db-wal y
# camaras.db-shm junto con camaras.db en la misma pasada. Copiando los tres
# juntos, SQLite puede reconstruir un estado consistente al abrir la copia
# aunque el WAL no se haya volcado al archivo principal todavia.

$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$origen = Join-Path $repoRoot 'backend\data'
$destinoBase = 'D:\BACKUP Sistema de Camaras CURF'
$retencionDias = 30

$fecha = Get-Date -Format 'yyyy-MM-dd_HHmmss'
$destino = Join-Path $destinoBase $fecha
$logPath = Join-Path $destinoBase 'backup.log'

function Escribir-Log {
    param([string]$mensaje)
    $linea = '[' + (Get-Date -Format 'yyyy-MM-dd HH:mm:ss') + '] ' + $mensaje
    Write-Output $linea
    Add-Content -Path $logPath -Value $linea
}

try {
    if (-not (Test-Path $origen)) {
        throw ('No se encontro ' + $origen + ' - se habra movido el proyecto?')
    }

    New-Item -ItemType Directory -Force -Path $destino | Out-Null

    # /E copia subcarpetas (incluye uploads/camaras), /R:3 /W:5 reintenta si
    # algun archivo esta momentaneamente bloqueado (ej. el .db mientras la
    # API escribe). Los codigos de salida 0-7 de robocopy son exito.
    robocopy $origen $destino /E /R:3 /W:5 /NFL /NDL /NJH /NJS | Out-Null
    if ($LASTEXITCODE -ge 8) {
        throw ('robocopy fallo copiando backend\data (codigo ' + $LASTEXITCODE + ')')
    }

    $envOrigen = Join-Path $repoRoot '.env'
    if (Test-Path $envOrigen) {
        Copy-Item $envOrigen (Join-Path $destino '.env') -Force
    }

    $tamano = (Get-ChildItem $destino -Recurse -File | Measure-Object -Property Length -Sum).Sum
    $tamanoMB = [math]::Round($tamano / 1MB, 1)
    Escribir-Log ('OK: backup en ' + $destino + ' (' + $tamanoMB + ' MB)')

    # Limpieza: borra backups mas viejos que $retencionDias para no llenar el disco.
    $limite = (Get-Date).AddDays(-$retencionDias)
    Get-ChildItem $destinoBase -Directory |
        Where-Object { $_.Name -match '^\d{4}-\d{2}-\d{2}_\d{6}$' -and $_.LastWriteTime -lt $limite } |
        ForEach-Object {
            Remove-Item $_.FullName -Recurse -Force
            Escribir-Log ('Borrado backup viejo: ' + $_.Name)
        }
}
catch {
    Escribir-Log ('ERROR: ' + $_.Exception.Message)
    throw
}
