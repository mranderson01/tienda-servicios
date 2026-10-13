# Lee línea por línea el fichero .env y asigna las variables de entorno en la sesión actual
Get-Content .env | ForEach-Object {
    if ($_ -match '^\s*([^#\s][^=]*?)\s*=\s*(.*)\s*$') {
        [Environment]::SetEnvironmentVariable($Matches[1], $Matches[2], [EnvironmentVariableTarget]::Process)
    }
}

Write-Host "Variables de entorno cargadas desde .env correctamente." -ForegroundColor Green

# Arranca Claude Code
claude