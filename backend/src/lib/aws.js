const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient } = require("@aws-sdk/lib-dynamodb");
const { S3Client } = require("@aws-sdk/client-s3");

const db = DynamoDBDocumentClient.from(new DynamoDBClient(), {
  marshallOptions: { removeUndefinedValues: true },
});

const s3 = new S3Client();

const config = {
  tablaCursos: process.env.CURSOS_TABLE,
  tablaMateriales: process.env.MATERIALES_TABLE,
  tablaPqrs: process.env.PQRS_TABLE,
  bucketMateriales: process.env.MATERIALES_BUCKET,
  ttlUrlFirmada: Number(process.env.URL_FIRMADA_TTL || 300),
};

const esFalloCondicional = (err) => err?.name === "ConditionalCheckFailedException";

module.exports = { db, s3, config, esFalloCondicional };
