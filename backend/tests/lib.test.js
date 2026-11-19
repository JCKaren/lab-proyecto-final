const assert = require("node:assert/strict");
const { test } = require("node:test");
const { ADMIN, ESTUDIANTE, evento } = require("./helpers");
const { HttpError, leerGrupos, obtenerUsuario, validarTexto, manejar } = require("../src/lib/http");

test("leerGrupos interpreta el formato de HTTP API", () => {
  assert.deepEqual(leerGrupos("[admin estudiante]"), ["admin", "estudiante"]);
  assert.deepEqual(leerGrupos(undefined), []);
});

test("obtenerUsuario obtiene el rol; admin tiene prioridad", () => {
  assert.equal(obtenerUsuario(evento({ claims: ESTUDIANTE })).rol, "estudiante");
  const ambos = obtenerUsuario(evento({ claims: { ...ADMIN, "cognito:groups": "[estudiante admin]" } }));
  assert.equal(ambos.rol, "admin");
  assert.equal(ambos.esAdmin, true);
});

test("obtenerUsuario rechaza peticiones sin token o sin grupo", () => {
  assert.throws(() => obtenerUsuario(evento({ claims: null })), { statusCode: 401 });
  assert.throws(() => obtenerUsuario(evento({ claims: { sub: "x" } })), { statusCode: 403 });
});

test("validarTexto revisa obligatorio, tipo y longitud", () => {
  assert.equal(validarTexto({ a: "  hola " }, "a"), "hola");
  assert.equal(validarTexto({}, "a", { opcional: true }), undefined);
  assert.throws(() => validarTexto({}, "a"), HttpError);
  assert.throws(() => validarTexto({ a: 5 }, "a"), HttpError);
  assert.throws(() => validarTexto({ a: "ab" }, "a", { min: 3 }), HttpError);
});

test("manejar responde 400 con JSON inválido y 500 sin filtrar detalles internos", async () => {
  const conBody = manejar(async (event) => {
    require("../src/lib/http").leerBody(event);
  });
  const malo = await conBody({ ...evento(), body: "{no es json" });
  assert.equal(malo.statusCode, 400);

  const falla = manejar(async () => {
    throw new Error("secreto interno");
  });
  const original = console.error;
  console.error = () => {};
  try {
    const res = await falla(evento());
    assert.equal(res.statusCode, 500);
    assert.ok(!res.body.includes("secreto"));
    assert.equal(res.headers["Access-Control-Allow-Origin"], "*");
  } finally {
    console.error = original;
  }
});
