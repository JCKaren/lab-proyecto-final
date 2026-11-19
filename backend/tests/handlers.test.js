const assert = require("node:assert/strict");
const { test } = require("node:test");
const { ADMIN, ESTUDIANTE, evento, simularDb, cuerpo, falloCondicional } = require("./helpers");
const { db } = require("../src/lib/aws");
const cursos = require("../src/cursos");
const materiales = require("../src/materiales");
const pqrs = require("../src/pqrs");

// ---------------- Cursos ----------------
test("un estudiante no puede crear cursos", async () => {
  const llamadas = simularDb(db);
  const res = await cursos.crear(evento({ body: { codigo: "SIS-301", nombre: "Sistemas" } }));
  assert.equal(res.statusCode, 403);
  assert.equal(llamadas.length, 0);
});

test("el admin crea un curso y el código se normaliza", async () => {
  const llamadas = simularDb(db);
  const res = await cursos.crear(evento({
    claims: ADMIN,
    body: { codigo: "sis-301", nombre: "Sistemas Operativos" },
  }));
  assert.equal(res.statusCode, 201);
  assert.equal(cuerpo(res).cursoId, "SIS-301");
  assert.equal(llamadas[0].nombre, "PutCommand");
});

test("crear un curso con código repetido devuelve 409", async () => {
  simularDb(db, () => {
    throw falloCondicional();
  });
  const res = await cursos.crear(evento({ claims: ADMIN, body: { codigo: "SIS-301", nombre: "Sistemas" } }));
  assert.equal(res.statusCode, 409);
});

test("no se puede eliminar un curso con material", async () => {
  simularDb(db, ({ nombre }) => (nombre === "QueryCommand" ? { Count: 1 } : {}));
  const res = await cursos.eliminar(evento({ claims: ADMIN, path: { cursoId: "SIS-301" } }));
  assert.equal(res.statusCode, 409);
});

// ---------------- Materiales ----------------
test("el admin registra material y recibe una URL prefirmada de subida", async () => {
  simularDb(db, ({ nombre, input }) =>
    nombre === "GetCommand" && input.TableName === "Cursos" ? { Item: { cursoId: "SIS-301" } } : {}
  );
  const res = await materiales.crear(evento({
    claims: ADMIN,
    path: { cursoId: "SIS-301" },
    body: { titulo: "Parcial 1", nombreArchivo: "Guía parcial 1.pdf", tipoContenido: "application/pdf" },
  }));
  assert.equal(res.statusCode, 201);
  const data = cuerpo(res);
  assert.equal(data.material.nombreArchivo, "Guia_parcial_1.pdf");
  assert.equal(data.material.s3Key, undefined, "no expone la ruta interna");
  assert.match(data.urlSubida, /bucket-pruebas.*materiales\/SIS-301\/.+\/Guia_parcial_1\.pdf\?.*X-Amz-Signature=/);
});

test("se rechazan tipos de archivo no permitidos", async () => {
  simularDb(db);
  const res = await materiales.crear(evento({
    claims: ADMIN,
    path: { cursoId: "SIS-301" },
    body: { titulo: "Programa", nombreArchivo: "x.exe", tipoContenido: "application/x-msdownload" },
  }));
  assert.equal(res.statusCode, 400);
});

test("obtener material devuelve la URL de descarga", async () => {
  simularDb(db, () => ({
    Item: { cursoId: "C", materialId: "m", nombreArchivo: "a.pdf", s3Key: "materiales/C/m/a.pdf" },
  }));
  const res = await materiales.obtener(evento({ path: { cursoId: "C", materialId: "m" } }));
  assert.equal(res.statusCode, 200);
  assert.match(cuerpo(res).urlDescarga, /materiales\/C\/m\/a\.pdf\?.*X-Amz-Signature=/);
});

test("un estudiante no puede eliminar material", async () => {
  simularDb(db);
  const res = await materiales.eliminar(evento({ path: { cursoId: "C", materialId: "m" } }));
  assert.equal(res.statusCode, 403);
});

// ---------------- PQRS ----------------
test("el estudiante crea una PQRS pendiente; el admin no puede crearla", async () => {
  simularDb(db);
  const body = { tipo: "QUEJA", asunto: "Material incompleto", descripcion: "Falta la segunda parte del taller." };
  const res = await pqrs.crear(evento({ body }));
  assert.equal(res.statusCode, 201);
  assert.equal(cuerpo(res).estado, "PENDIENTE");
  assert.equal((await pqrs.crear(evento({ body, claims: ADMIN }))).statusCode, 403);
});

test("el estudiante solo lista sus PQRS; el admin ve todas", async () => {
  const llamadas = simularDb(db, () => ({ Items: [] }));
  await pqrs.listar(evento({ query: { estado: "PENDIENTE" } }));
  assert.equal(llamadas[0].input.FilterExpression, "usuarioId = :u AND estado = :e");
  assert.equal(llamadas[0].input.ExpressionAttributeValues[":u"], ESTUDIANTE.sub);

  await pqrs.listar(evento({ claims: ADMIN }));
  assert.equal(llamadas[1].input.FilterExpression, undefined);
});

test("el estudiante no puede ver la PQRS de otro (404)", async () => {
  simularDb(db, () => ({ Item: { pqrsId: "p", usuarioId: "otro" } }));
  const res = await pqrs.obtener(evento({ path: { pqrsId: "p" } }));
  assert.equal(res.statusCode, 404);
});

test("responder una PQRS ya respondida devuelve 409; inexistente 404", async () => {
  const ev = evento({ claims: ADMIN, path: { pqrsId: "p" }, body: { respuesta: "Ya se subió el material." } });
  simularDb(db, () => {
    throw falloCondicional({ Item: { pqrsId: { S: "p" } } });
  });
  assert.equal((await pqrs.responder(ev)).statusCode, 409);
  simularDb(db, () => {
    throw falloCondicional();
  });
  assert.equal((await pqrs.responder(ev)).statusCode, 404);
});
