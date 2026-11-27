# Crea (o actualiza) el bucket del frontend con CloudFormation y sube los archivos (Windows / PowerShell).
# Uso:  .\deploy.ps1 [-Bucket nombre-del-bucket]
# Requiere AWS CLI v2 configurado (aws configure) con permisos sobre S3 y CloudFormation.
param([string]$Bucket = "studyhub-frontend-2026-udea")
$ErrorActionPreference = "Stop"

$Region = "us-east-1"
$Stack  = "studyhub-frontend"
$Dir    = $PSScriptRoot

if (Select-String -Path "$Dir\js\config.js" -Pattern "XXXXXXXX" -Quiet) {
  Write-Warning "js/config.js todavía tiene valores de ejemplo. El sitio se sube, pero no podrá iniciar sesión."
}

Write-Host "==> Desplegando stack $Stack (bucket $Bucket) en $Region"
aws cloudformation deploy `
  --region $Region `
  --stack-name $Stack `
  --template-file "$Dir\infra\frontend-bucket.yml" `
  --parameter-overrides "NombreBucket=$Bucket" `
  --no-fail-on-empty-changeset
if ($LASTEXITCODE -ne 0) { throw "Falló el despliegue del stack" }

Write-Host "==> Subiendo archivos"
aws s3 sync $Dir "s3://$Bucket" --region $Region --delete `
  --exclude "*" --include "index.html" --include "css/*" --include "js/*"
if ($LASTEXITCODE -ne 0) { throw "Falló la subida de archivos" }

aws s3 cp "$Dir\js\config.js" "s3://$Bucket/js/config.js" --region $Region `
  --content-type "text/javascript" --cache-control "no-cache"

$Url = aws cloudformation describe-stacks --region $Region --stack-name $Stack `
  --query "Stacks[0].Outputs[?OutputKey=='WebsiteURL'].OutputValue" --output text
Write-Host ""
Write-Host "Listo: $Url"
