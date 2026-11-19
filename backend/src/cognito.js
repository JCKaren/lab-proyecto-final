const {
  CognitoIdentityProviderClient,
  AdminAddUserToGroupCommand,
} = require("@aws-sdk/client-cognito-identity-provider");

const cognito = new CognitoIdentityProviderClient();
const GRUPO_POR_DEFECTO = process.env.GRUPO_POR_DEFECTO || "estudiante";

module.exports.postConfirmacion = async (event) => {
  if (event.triggerSource === "PostConfirmation_ConfirmSignUp") {
    await cognito.send(new AdminAddUserToGroupCommand({
      UserPoolId: event.userPoolId,
      Username: event.userName,
      GroupName: GRUPO_POR_DEFECTO,
    }));
    console.log(JSON.stringify({
      mensaje: "Usuario agregado al grupo",
      grupo: GRUPO_POR_DEFECTO,
      sub: event.request?.userAttributes?.sub,
    }));
  }
  return event;
};
