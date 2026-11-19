const ORIGEN = process.env.ORIGEN_PERMITIDO || "*";
const ROLES = Object.freeze({ ADMIN: "admin", ESTUDIANTE: "estudiante" });

class HttpError extends Error {
  constructor(statusCode, mensaje) {
    super(mensaje);
    this.statusCode = statusCode;
  }
}

const respuesta = (statusCode, body) => ({
  statusCode,
  headers: {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": ORIGEN,
  },
  body: JSON.stringify(body),
});

const leerBody = (event) => {
  try {
    const data = JSON.parse(event.body || "");
    if (typeof data === "object" && data !== null && !Array.isArray(data)) return data;
  } catch {
    // se responde abajo
  }
  throw new HttpError(400, "El cuerpo debe ser un objeto JSON válido");
};

const parametro = (event, nombre) => decodeURIComponent(event.pathParameters[nombre]);

const query = (event, nombre) => event.queryStringParameters?.[nombre];

const leerGrupos = (valor) =>
  valor ? String(valor).replace(/^\[|\]$/g, "").split(/[\s,]+/).filter(Boolean) : [];

const obtenerUsuario = (event) => {
  const claims = event.requestContext?.authorizer?.jwt?.claims;
  if (!claims?.sub) throw new HttpError(401, "No autenticado");

  const grupos = leerGrupos(claims["cognito:groups"]);
  let rol = null;
  if (grupos.includes(ROLES.ADMIN)) rol = ROLES.ADMIN;
  else if (grupos.includes(ROLES.ESTUDIANTE)) rol = ROLES.ESTUDIANTE;
  if (!rol) throw new HttpError(403, "El usuario no tiene un rol asignado");

  return {
    id: claims.sub,
    email: claims.email,
    nombre: claims.name || claims.email,
    rol,
    esAdmin: rol === ROLES.ADMIN,
  };
};

const exigirRol = (usuario, rol) => {
  if (usuario.rol !== rol) throw new HttpError(403, "No tienes permisos para realizar esta acción");
};

const validarTexto = (data, campo, { min = 1, max = 500, opcional = false } = {}) => {
  const valor = data[campo];
  if (valor === undefined || valor === null || valor === "") {
    if (opcional) return undefined;
    throw new HttpError(400, `"${campo}" es obligatorio`);
  }
  if (typeof valor !== "string") throw new HttpError(400, `"${campo}" debe ser texto`);
  const limpio = valor.trim();
  if (limpio.length < min || limpio.length > max) {
    throw new HttpError(400, `"${campo}" debe tener entre ${min} y ${max} caracteres`);
  }
  return limpio;
};

const validarOpcion = (data, campo, permitidos) => {
  if (!permitidos.includes(data[campo])) {
    throw new HttpError(400, `"${campo}" debe ser uno de: ${permitidos.join(", ")}`);
  }
  return data[campo];
};

const manejar = (fn) => async (event) => {
  try {
    const usuario = obtenerUsuario(event);
    return await fn(event, usuario);
  } catch (err) {
    if (err instanceof HttpError) return respuesta(err.statusCode, { error: err.message });
    console.error(err);
    return respuesta(500, { error: "Error interno del servidor" }); // sin detalles internos
  }
};

module.exports = {
  ROLES,
  HttpError,
  respuesta,
  leerBody,
  parametro,
  query,
  leerGrupos,
  obtenerUsuario,
  exigirRol,
  validarTexto,
  validarOpcion,
  manejar,
};
