const {
  PutCommand,
  GetCommand,
  ScanCommand,
  QueryCommand,
  DeleteCommand,
} = require("@aws-sdk/lib-dynamodb");
const { db, config, esFalloCondicional } = require("./lib/aws");
const {
  ROLES,
  HttpError,
  respuesta,
  leerBody,
  parametro,
  exigirRol,
  validarTexto,
  manejar,
} = require("./lib/http");

const CODIGO_CURSO = /^[A-Z0-9-]{2,20}$/;

// GET /cursos
module.exports.listar = manejar(async () => {
  const { Items } = await db.send(new ScanCommand({ TableName: config.tablaCursos }));
  Items.sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  return respuesta(200, Items);
});

// GET /cursos/{cursoId}
module.exports.obtener = manejar(async (event) => {
  const cursoId = parametro(event, "cursoId");
  const { Item } = await db.send(new GetCommand({ TableName: config.tablaCursos, Key: { cursoId } }));
  if (!Item) throw new HttpError(404, "Curso no encontrado");
  return respuesta(200, Item);
});

// POST /cursos   (admin)
module.exports.crear = manejar(async (event, usuario) => {
  exigirRol(usuario, ROLES.ADMIN);
  const data = leerBody(event);

  const cursoId = validarTexto(data, "codigo", { min: 2, max: 20 }).toUpperCase();
  if (!CODIGO_CURSO.test(cursoId)) {
    throw new HttpError(400, '"codigo" solo admite letras, números y guiones (ej. "SIS-301")');
  }

  const curso = {
    cursoId,
    nombre: validarTexto(data, "nombre", { min: 3, max: 120 }),
    descripcion: validarTexto(data, "descripcion", { max: 1000, opcional: true }),
    semestre: validarTexto(data, "semestre", { max: 20, opcional: true }),
    fechaCreacion: new Date().toISOString(),
  };

  try {
    await db.send(new PutCommand({
      TableName: config.tablaCursos,
      Item: curso,
      ConditionExpression: "attribute_not_exists(cursoId)",
    }));
  } catch (err) {
    if (esFalloCondicional(err)) throw new HttpError(409, `Ya existe un curso con código ${cursoId}`);
    throw err;
  }
  return respuesta(201, curso);
});

// DELETE /cursos/{cursoId}
module.exports.eliminar = manejar(async (event, usuario) => {
  exigirRol(usuario, ROLES.ADMIN);
  const cursoId = parametro(event, "cursoId");

  const { Count } = await db.send(new QueryCommand({
    TableName: config.tablaMateriales,
    KeyConditionExpression: "cursoId = :c",
    ExpressionAttributeValues: { ":c": cursoId },
    Select: "COUNT",
    Limit: 1,
  }));
  if (Count > 0) throw new HttpError(409, "El curso tiene material; elimínalo primero");

  try {
    await db.send(new DeleteCommand({
      TableName: config.tablaCursos,
      Key: { cursoId },
      ConditionExpression: "attribute_exists(cursoId)",
    }));
  } catch (err) {
    if (esFalloCondicional(err)) throw new HttpError(404, "Curso no encontrado");
    throw err;
  }
  return respuesta(200, { mensaje: "Curso eliminado" });
});
