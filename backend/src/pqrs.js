const { PutCommand, GetCommand, ScanCommand, UpdateCommand } = require("@aws-sdk/lib-dynamodb");
const { randomUUID } = require("crypto");
const { db, config, esFalloCondicional } = require("./lib/aws");
const {
  ROLES,
  HttpError,
  respuesta,
  leerBody,
  parametro,
  query,
  exigirRol,
  validarTexto,
  validarOpcion,
  manejar,
} = require("./lib/http");

const TIPOS_PQRS = ["PETICION", "QUEJA", "RECLAMO", "SUGERENCIA"];
const ESTADOS_PQRS = ["PENDIENTE", "RESPONDIDA"];

// POST /pqrs  
module.exports.crear = manejar(async (event, usuario) => {
  exigirRol(usuario, ROLES.ESTUDIANTE);
  const data = leerBody(event);
  const pqrs = {
    pqrsId: randomUUID(),
    tipo: validarOpcion(data, "tipo", TIPOS_PQRS),
    asunto: validarTexto(data, "asunto", { min: 3, max: 150 }),
    descripcion: validarTexto(data, "descripcion", { min: 10, max: 2000 }),
    cursoId: validarTexto(data, "cursoId", { max: 20, opcional: true }),
    estado: "PENDIENTE",
    usuarioId: usuario.id,
    usuarioEmail: usuario.email,
    usuarioNombre: usuario.nombre,
    fechaCreacion: new Date().toISOString(),
  };
  await db.send(new PutCommand({ TableName: config.tablaPqrs, Item: pqrs }));
  return respuesta(201, pqrs);
});

// GET /pqrs?estado=PENDIENTE
module.exports.listar = manejar(async (event, usuario) => {
  const estado = query(event, "estado");
  if (estado && !ESTADOS_PQRS.includes(estado)) {
    throw new HttpError(400, `"estado" debe ser uno de: ${ESTADOS_PQRS.join(", ")}`);
  }

  const filtros = [];
  const valores = {};
  if (!usuario.esAdmin) {
    filtros.push("usuarioId = :u");
    valores[":u"] = usuario.id;
  }
  if (estado) {
    filtros.push("estado = :e");
    valores[":e"] = estado;
  }

  const { Items } = await db.send(new ScanCommand({
    TableName: config.tablaPqrs,
    ...(filtros.length && {
      FilterExpression: filtros.join(" AND "),
      ExpressionAttributeValues: valores,
    }),
  }));
  Items.sort((a, b) => b.fechaCreacion.localeCompare(a.fechaCreacion));
  return respuesta(200, Items);
});

// GET /pqrs/{pqrsId}
module.exports.obtener = manejar(async (event, usuario) => {
  const { Item } = await db.send(new GetCommand({
    TableName: config.tablaPqrs,
    Key: { pqrsId: parametro(event, "pqrsId") },
  }));
  if (!Item || (!usuario.esAdmin && Item.usuarioId !== usuario.id)) {
    throw new HttpError(404, "PQRS no encontrada");
  }
  return respuesta(200, Item);
});

// PUT /pqrs/{pqrsId}/respuesta 
module.exports.responder = manejar(async (event, usuario) => {
  exigirRol(usuario, ROLES.ADMIN);
  const texto = validarTexto(leerBody(event), "respuesta", { min: 1, max: 2000 });

  try {
    const { Attributes } = await db.send(new UpdateCommand({
      TableName: config.tablaPqrs,
      Key: { pqrsId: parametro(event, "pqrsId") },
      UpdateExpression: "SET estado = :respondida, respuesta = :r, fechaRespuesta = :f, respondidaPor = :por",
      ConditionExpression: "attribute_exists(pqrsId) AND estado = :pendiente",
      ExpressionAttributeValues: {
        ":respondida": "RESPONDIDA",
        ":pendiente": "PENDIENTE",
        ":r": texto,
        ":f": new Date().toISOString(),
        ":por": usuario.nombre,
      },
      ReturnValues: "ALL_NEW",
      ReturnValuesOnConditionCheckFailure: "ALL_OLD",
    }));
    return respuesta(200, Attributes);
  } catch (err) {
    if (esFalloCondicional(err)) {
      if (err.Item) throw new HttpError(409, "La PQRS ya fue respondida");
      throw new HttpError(404, "PQRS no encontrada");
    }
    throw err;
  }
});
