// Configuración del frontend de StudyHub.
// Llena estos valores con los Outputs de `serverless deploy` (carpeta backend/).
//   apiUrl      -> "endpoint" que imprime el deploy (sin "/" al final)
//   userPoolId  -> Output UserPoolId
//   clientId    -> Output UserPoolClientId
window.STUDYHUB_CONFIG = {
  region: "us-east-1",
  apiUrl: "https://XXXXXXXXXX.execute-api.us-east-1.amazonaws.com",
  userPoolId: "us-east-1_XXXXXXXXX",
  clientId: "XXXXXXXXXXXXXXXXXXXXXXXXXX",
};
