# Elimina los stacks en orden inverso.
$region = "us-east-1"
foreach ($s in "studyhub-ec2","studyhub-vpc") {
  aws cloudformation delete-stack --region $region --stack-name $s
  aws cloudformation wait stack-delete-complete --region $region --stack-name $s
}
