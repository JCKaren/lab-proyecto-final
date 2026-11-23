# Despliega la infraestructura en orden (ec2 depende de vpc).
# Uso (desde la raiz del proyecto):  .\infraestructura\desplegar.ps1
$ErrorActionPreference = "Stop"
$region = "us-east-1"

aws cloudformation deploy --region $region --stack-name studyhub-vpc --template-file infraestructura/vpc.yml
aws cloudformation deploy --region $region --stack-name studyhub-ec2 --template-file infraestructura/ec2.yml
