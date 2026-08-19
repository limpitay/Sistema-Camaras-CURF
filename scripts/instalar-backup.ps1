# Corre esto UNA sola vez para dejar el backup automatizado via el
# Programador de tareas de Windows. Despues no hace falta tocar nada mas.
#
# Para desinstalar: Unregister-ScheduledTask -TaskName "Backup Sistema Camaras CURF"

$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$scriptBackup = Join-Path $repoRoot 'scripts\backup-datos.ps1'
$nombreTarea = 'Backup Sistema Camaras CURF'

$accion = New-ScheduledTaskAction -Execute 'powershell.exe' `
    -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$scriptBackup`""

$trigger = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Monday, Tuesday, Thursday, Friday -At 7am

$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -DontStopOnIdleEnd -ExecutionTimeLimit (New-TimeSpan -Minutes 30)

Register-ScheduledTask -TaskName $nombreTarea -Action $accion -Trigger $trigger -Settings $settings `
    -Description 'Backup de backend/data (camaras.db + fotos) a D:\BACKUP Sistema de Camaras CURF - lunes/martes/jueves/viernes 7am' `
    -Force | Out-Null

Write-Output ("Tarea '" + $nombreTarea + "' creada: corre lunes, martes, jueves y viernes a las 7:00 am.")
Write-Output ("Para probarla ahora mismo: Start-ScheduledTask -TaskName '" + $nombreTarea + "'")
