#!/usr/bin/env bash
# Crea (o actualiza) el bucket del frontend con CloudFormation y sube los archivos.
# Uso:  ./deploy.sh [nombre-del-bucket]
# Requiere AWS CLI v2 configurado (aws configure) con permisos sobre S3 y CloudFormation.
set -euo pipefail

BUCKET="${1:-studyhub-frontend-2026-udea}"
REGION="us-east-1"
STACK="studyhub-frontend"
DIR="$(cd "$(dirname "$0")" && pwd)"

if grep -q "XXXXXXXX" "$DIR/js/config.js"; then
  echo "AVISO: js/config.js todavía tiene valores de ejemplo. El sitio se sube, pero no podrá iniciar sesión."
fi

echo "==> Desplegando stack $STACK (bucket $BUCKET) en $REGION"
aws cloudformation deploy \
  --region "$REGION" \
  --stack-name "$STACK" \
  --template-file "$DIR/infra/frontend-bucket.yml" \
  --parameter-overrides "NombreBucket=$BUCKET" \
  --no-fail-on-empty-changeset

echo "==> Subiendo archivos"
aws s3 sync "$DIR" "s3://$BUCKET" \
  --region "$REGION" \
  --delete \
  --exclude "*" \
  --include "index.html" --include "css/*" --include "js/*"

# config.js sin caché para que los cambios de configuración se vean de inmediato
aws s3 cp "$DIR/js/config.js" "s3://$BUCKET/js/config.js" \
  --region "$REGION" \
  --content-type "text/javascript" \
  --cache-control "no-cache"

URL=$(aws cloudformation describe-stacks --region "$REGION" --stack-name "$STACK" \
  --query "Stacks[0].Outputs[?OutputKey=='WebsiteURL'].OutputValue" --output text)
echo ""
echo "Listo: $URL"
