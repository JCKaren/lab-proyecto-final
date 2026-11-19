// Utilidades de prueba: eventos falsos de API Gateway (HTTP API) y un "mock" de DynamoDB.
process.env.CURSOS_TABLE = "Cursos";
process.env.MATERIALES_TABLE = "Materiales";
process.env.PQRS_TABLE = "Pqrs";
process.env.MATERIALES_BUCKET = "bucket-pruebas";
process.env.AWS_REGION = "us-east-1";
process.env.AWS_ACCESS_KEY_ID = "test";
process.env.AWS_SECRET_ACCESS_KEY = "test";

const ADMIN = { sub: "admin-1", email: "admin@udea.edu.co", name: "Admin", "cognito:groups": "[admin]" };
const ESTUDIANTE = {
  sub: "est-1",
  email: "est@udea.edu.co",
  name: "Estudiante",
  "cognito:groups": "[estudiante]",
};

const evento = ({ path = {}, query, body, claims = ESTUDIANTE } = {}) => ({
  pathParameters: path,
  queryStringParameters: query,
  body: body === undefined ? undefined : JSON.stringify(body),
  requestContext: { authorizer: claims ? { jwt: { claims } } : undefined },
});

// Reemplaza db.send por una función que registra los comandos y responde con `responder`
const simularDb = (db, responder = () => ({})) => {
  const llamadas = [];
  db.send = async (comando) => {
    const llamada = { nombre: comando.constructor.name, input: comando.input };
    llamadas.push(llamada);
    return responder(llamada);
  };
  return llamadas;
};

const cuerpo = (res) => JSON.parse(res.body);

const falloCondicional = (extra = {}) =>
  Object.assign(new Error("fallo"), { name: "ConditionalCheckFailedException", ...extra });

module.exports = { ADMIN, ESTUDIANTE, evento, simularDb, cuerpo, falloCondicional };
