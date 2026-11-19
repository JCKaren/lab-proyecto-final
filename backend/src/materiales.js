const { PutCommand, GetCommand, QueryCommand, DeleteCommand } = require("@aws-sdk/lib-dynamodb");
const { PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const { randomUUID } = require("crypto");
const { db, s3, config } = require("./lib/aws");
const {
  ROLES,
  HttpError,
  respuesta,
  leerBody,
  parametro,
  exigirRol,
  validarTexto,
  validarOpcion,
  manejar,
} = require("./lib/http");

const TIPOS_PERMITIDOS = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/zip",
  "text/plain",
  "image/png",
  "image/jpeg",
];

const nombreArchivoSeguro = (nombre) =>
  nombre
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // quita tildes
    .replace(/[^\w.\-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^[._]+/, "")
    .slice(-150) || "archivo";

const materialPublico = ({ s3Key, ...resto }) => resto;

// GET /cursos/{cursoId}/materiales
module.exports.listar = manejar(async (event) => {
  const { Items } = await db.send(new QueryCommand({
    TableName: config.tablaMateriales,
    KeyConditionExpression: "cursoId = :c",
    ExpressionAttributeValues: { ":c": parametro(event, "cursoId") },
  }));
  Items.sort((a, b) => b.fechaCreacion.localeCompare(a.fechaCreacion));
  return respuesta(200, Items.map(materialPublico));
});

// GET /cursos/{cursoId}/materiales/{materialId}  
module.exports.obtener = manejar(async (event) => {
  const { Item: material } = await db.send(new GetCommand({
    TableName: config.tablaMateriales,
    Key: { cursoId: parametro(event, "cursoId"), materialId: parametro(event, "materialId") },
  }));
  if (!material) throw new HttpError(404, "Material no encontrado");

  const urlDescarga = await getSignedUrl(s3, new GetObjectCommand({
    Bucket: config.bucketMateriales,
    Key: material.s3Key,
    ResponseContentDisposition: `attachment; filename="${material.nombreArchivo}"`,
  }), { expiresIn: config.ttlUrlFirmada });

  return respuesta(200, { ...materialPublico(material), urlDescarga });
});

// POST /cursos/{cursoId}/materiales   (admin) 
module.exports.crear = manejar(async (event, usuario) => {
  exigirRol(usuario, ROLES.ADMIN);
  const cursoId = parametro(event, "cursoId");
  const data = leerBody(event);

  const titulo = validarTexto(data, "titulo", { min: 3, max: 150 });
  const descripcion = validarTexto(data, "descripcion", { max: 1000, opcional: true });
  const nombreArchivo = nombreArchivoSeguro(validarTexto(data, "nombreArchivo", { max: 200 }));
  const tipoContenido = validarOpcion(data, "tipoContenido", TIPOS_PERMITIDOS);

  const { Item: curso } = await db.send(new GetCommand({ TableName: config.tablaCursos, Key: { cursoId } }));
  if (!curso) throw new HttpError(404, "Curso no encontrado");

  const materialId = randomUUID();
  const material = {
    cursoId,
    materialId,
    titulo,
    descripcion,
    nombreArchivo,
    tipoContenido,
    s3Key: `materiales/${cursoId}/${materialId}/${nombreArchivo}`,
    fechaCreacion: new Date().toISOString(),
    creadoPor: usuario.nombre,
  };
  await db.send(new PutCommand({ TableName: config.tablaMateriales, Item: material }));

  const urlSubida = await getSignedUrl(s3, new PutObjectCommand({
    Bucket: config.bucketMateriales,
    Key: material.s3Key,
    ContentType: tipoContenido,
  }), { expiresIn: config.ttlUrlFirmada });

  return respuesta(201, { material: materialPublico(material), urlSubida });
});

// DELETE /cursos/{cursoId}/materiales/{materialId}  
module.exports.eliminar = manejar(async (event, usuario) => {
  exigirRol(usuario, ROLES.ADMIN);
  const llave = { cursoId: parametro(event, "cursoId"), materialId: parametro(event, "materialId") };

  const { Item: material } = await db.send(new GetCommand({ TableName: config.tablaMateriales, Key: llave }));
  if (!material) throw new HttpError(404, "Material no encontrado");

  await s3.send(new DeleteObjectCommand({ Bucket: config.bucketMateriales, Key: material.s3Key }));
  await db.send(new DeleteCommand({ TableName: config.tablaMateriales, Key: llave }));
  return respuesta(200, { mensaje: "Material eliminado" });
});
