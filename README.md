# **Proyecto final de Cloud Computing (StudyHub)**

Plataforma web para compartir material de cursos y gestionar PQRS (peticiones, quejas, reclamos y sugerencias), construida sobre AWS con arquitectura serverless.

**Integrantes:** 
-Karen Michelle Jimenez Castro
-Jhomar Farid Arrieta Montes
-Kelly Julieth Arango Henao

**Arquitectura**

| Capa | Servicio | Uso |
|---|---|---|
| Computo | AWS Lambda (Node.js 24, arm64) | 13 funciones: cursos, materiales, PQRS y post-confirmacion de usuarios |
| API | API Gateway HTTP API | 12 rutas REST con autorizador JWT y limite de peticiones |
| Autenticacion | Amazon Cognito | Registro, login y roles por grupo (`admin`, `estudiante`) |
| Base de datos | DynamoDB (bajo demanda) | Tablas de cursos, materiales y PQRS |
| Almacenamiento | S3 (privado, cifrado) | Archivos del material, con URLs prefirmadas de 5 minutos |
| Seguridad | IAM | Rol de las Lambda con permisos minimos por tabla y por prefijo de S3 |
| Red | VPC, subred publica, Internet Gateway | Red base del proyecto |
| Computo IaaS | EC2 t3.micro y Security Group | Instancia de pruebas con SSH solo desde una IP |
| Monitoreo | CloudWatch, SNS | Dashboard, alarmas |
| Trazabilidad | X-Ray | Trazas de las funciones Lambda |



# **Estructura del repositorio**

**Despliegue**

# **Infraestructura de red (VPC y EC2)**

**Desde la raiz del proyecto:**

```powershell
.\infraestructura\desplegar.ps1
```

**Para eliminarla:**


```powershell
.\infraestructura\eliminar.ps1
```

**Backend**


```powershell
cd backend
npm install
npm test
npx serverless deploy --param="correo=tu@correo.com"
```

Al terminar se muestran la URL de la API, UserPoolId, UserPoolClientId y el enlace al dashboard de CloudWatch.

Para eliminar el backend: 

```powershell
npx serverless remove
```

**API**

Todas las rutas requieren token de Cognito en el encabezado Authorization.

| Metodo | Ruta | Rol | Descripcion |
|---|---|---|---|
| GET | `/cursos` | admin, estudiante | Lista los cursos ordenados por nombre |
| GET | `/cursos/{cursoId}` | admin, estudiante | Obtiene un curso |
| POST | `/cursos` | admin | Crea un curso (codigo, nombre, descripcion, semestre) |
| DELETE | `/cursos/{cursoId}` | admin | Elimina un curso que no tenga material |
| GET | `/cursos/{cursoId}/materiales` | admin, estudiante | Lista el material de un curso |
| GET | `/cursos/{cursoId}/materiales/{materialId}` | admin, estudiante | Devuelve el material con una URL de descarga de 5 minutos |
| POST | `/cursos/{cursoId}/materiales` | admin | Registra el material y devuelve una URL para subir el archivo a S3 |
| DELETE | `/cursos/{cursoId}/materiales/{materialId}` | admin | Elimina el material y su archivo |
| POST | `/pqrs` | estudiante | Crea una PQRS (tipo, asunto, descripcion, curso opcional) |
| GET | `/pqrs` | admin, estudiante | Admin ve todas; el estudiante solo las suyas. Filtro opcional `?estado=PENDIENTE` |
| GET | `/pqrs/{pqrsId}` | admin, estudiante | Obtiene una PQRS (el estudiante solo la suya) |
| PUT | `/pqrs/{pqrsId}/respuesta` | admin | Responde una PQRS pendiente |

La coleccion de Postman esta en `backend/postman/`.

**Seguridad**

- Autenticacion con Cognito y autorizacion por grupos (`admin`, `estudiante`).
- IAM con menor privilegio: cada permiso limitado a su tabla y al prefijo `materiales/*` del bucket.
- Bucket S3 privado, cifrado (AES256), con bloqueo de acceso publico y solo HTTPS.
- Descargas y subidas mediante URLs prefirmadas de 5 minutos.
- Limite de peticiones en la API (throttling).
- Security Group de la EC2 con SSH solo desde una IP.
- La plantilla de la EC2 exige IMDSv2 y cifra el disco.

**Costos**

Decisiones para reducir costos: DynamoDB bajo demanda, Lambda en arm64, retencion corta de logs y EC2 apagada cuando no se usa.


