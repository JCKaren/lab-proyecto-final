// Autenticación con Amazon Cognito usando su API HTTP directamente (sin SDK).
// El cliente web del User Pool tiene habilitado ALLOW_USER_PASSWORD_AUTH y no tiene secreto.
(function () {
  const cfg = window.STUDYHUB_CONFIG;
  const ENDPOINT = cfg.cognitoEndpoint || `https://cognito-idp.${cfg.region}.amazonaws.com/`;
  const CLAVE_SESION = "studyhub.sesion";

  const MENSAJES = {
    UserNotConfirmedException: "Tu cuenta aún no está confirmada. Ingresa el código que llegó a tu correo.",
    NotAuthorizedException: "Correo o contraseña incorrectos.",
    UserNotFoundException: "Correo o contraseña incorrectos.",
    UsernameExistsException: "Ya existe una cuenta con ese correo.",
    CodeMismatchException: "El código no es correcto.",
    ExpiredCodeException: "El código expiró. Solicita uno nuevo.",
    InvalidPasswordException:
      "La contraseña debe tener mínimo 8 caracteres, con mayúsculas, minúsculas y números.",
    InvalidParameterException: "Revisa los datos ingresados.",
    LimitExceededException: "Demasiados intentos. Espera unos minutos e inténtalo de nuevo.",
    TooManyRequestsException: "Demasiadas solicitudes. Espera un momento.",
  };

  async function llamar(operacion, cuerpo) {
    let res;
    try {
      res = await fetch(ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-amz-json-1.1",
          "X-Amz-Target": `AWSCognitoIdentityProviderService.${operacion}`,
        },
        body: JSON.stringify(cuerpo),
      });
    } catch {
      throw new Error("No se pudo conectar con el servicio de autenticación.");
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const tipo = String(data.__type || "").split("#").pop();
      const error = new Error(MENSAJES[tipo] || data.message || "Error de autenticación.");
      error.tipo = tipo;
      throw error;
    }
    return data;
  }

  function decodificarJwt(token) {
    const base64 = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const json = decodeURIComponent(
      atob(base64)
        .split("")
        .map((c) => "%" + c.charCodeAt(0).toString(16).padStart(2, "0"))
        .join("")
    );
    return JSON.parse(json);
  }

  function guardar(resultado, refreshAnterior) {
    const sesion = {
      idToken: resultado.IdToken,
      refreshToken: resultado.RefreshToken || refreshAnterior,
      expira: Date.now() + (resultado.ExpiresIn || 3600) * 1000,
    };
    sessionStorage.setItem(CLAVE_SESION, JSON.stringify(sesion));
    return sesion;
  }

  function leer() {
    try {
      return JSON.parse(sessionStorage.getItem(CLAVE_SESION));
    } catch {
      return null;
    }
  }

  const Auth = {
    async registrar(nombre, email, password) {
      return llamar("SignUp", {
        ClientId: cfg.clientId,
        Username: email,
        Password: password,
        UserAttributes: [
          { Name: "email", Value: email },
          { Name: "name", Value: nombre },
        ],
      });
    },

    async confirmar(email, codigo) {
      return llamar("ConfirmSignUp", {
        ClientId: cfg.clientId,
        Username: email,
        ConfirmationCode: codigo,
      });
    },

    async reenviarCodigo(email) {
      return llamar("ResendConfirmationCode", { ClientId: cfg.clientId, Username: email });
    },

    async iniciarSesion(email, password) {
      const data = await llamar("InitiateAuth", {
        AuthFlow: "USER_PASSWORD_AUTH",
        ClientId: cfg.clientId,
        AuthParameters: { USERNAME: email, PASSWORD: password },
      });
      if (!data.AuthenticationResult) {
        throw new Error("Se requiere un paso adicional de autenticación no soportado.");
      }
      return guardar(data.AuthenticationResult);
    },

    async refrescar() {
      const sesion = leer();
      if (!sesion?.refreshToken) throw new Error("Sesión expirada.");
      const data = await llamar("InitiateAuth", {
        AuthFlow: "REFRESH_TOKEN_AUTH",
        ClientId: cfg.clientId,
        AuthParameters: { REFRESH_TOKEN: sesion.refreshToken },
      });
      return guardar(data.AuthenticationResult, sesion.refreshToken);
    },

    // Devuelve el ID token vigente (lo refresca si está por vencer).
    async token() {
      let sesion = leer();
      if (!sesion) return null;
      if (Date.now() > sesion.expira - 60 * 1000) sesion = await Auth.refrescar();
      return sesion.idToken;
    },

    usuario() {
      const sesion = leer();
      if (!sesion?.idToken) return null;
      const claims = decodificarJwt(sesion.idToken);
      const grupos = claims["cognito:groups"] || [];
      const rol = grupos.includes("admin") ? "admin" : grupos.includes("estudiante") ? "estudiante" : null;
      return { id: claims.sub, email: claims.email, nombre: claims.name || claims.email, rol };
    },

    cerrarSesion() {
      sessionStorage.removeItem(CLAVE_SESION);
    },
  };

  window.Auth = Auth;
})();
