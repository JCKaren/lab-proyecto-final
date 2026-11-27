# StudyHub · Frontend

Sitio estático (HTML, CSS y JavaScript sin dependencias ni compilación) alojado en un bucket **Amazon S3** con hosting de sitio web. Se conecta con:

- **Amazon Cognito** para registro, confirmación por correo e inicio de sesión. Usa la API de Cognito directamente con el flujo `USER_PASSWORD_AUTH`.
- **API Gateway (HTTP API) + Lambda** del backend, enviando el *ID token* de Cognito en el header `Authorization`.
- **S3 privado de materiales** mediante URLs firmadas: el navegador sube y descarga los archivos directamente de S3, sin pasar por la Lambda.

## Funcionalidades por rol

| Rol | Puede |
|---|---|
| Estudiante (rol por defecto al confirmar la cuenta) | Ver cursos, descargar material, crear PQRS y ver las respuestas de sus PQRS |
| Admin | Crear y eliminar cursos, subir y eliminar material, ver todas las PQRS, filtrarlas por estado y responderlas |

## Estructura

```
frontend/
├── index.html
├── css/styles.css
├── js/
│   ├── config.js   ← región, URL del API e ids de Cognito
│   ├── auth.js     ← Cognito: SignUp, ConfirmSignUp, InitiateAuth, refresh
│   ├── api.js      ← llamadas al API REST + subida a S3 con URL firmada
│   └── app.js      ← vistas y enrutamiento (#/cursos, #/cursos/{id}, #/pqrs)
├── infra/frontend-bucket.yml   ← IaC (CloudFormation) del bucket del sitio
├── deploy.sh                   ← despliegue en Linux/macOS/Git Bash
└── deploy.ps1                  ← despliegue en Windows PowerShell
```

## Despliegue paso a paso

Todo va en la región **us-east-1**, la misma del backend.

### 1. Crear el bucket del sitio

Requiere AWS CLI v2 configurado con `aws configure`.

```powershell
cd frontend
.\deploy.ps1 -Bucket studyhub-frontend-2026-udea      # Windows
```

```bash
cd frontend
./deploy.sh studyhub-frontend-2026-udea                # Linux / Git Bash
```

El nombre del bucket debe ser único en todo AWS; si ya existe, cambia el sufijo. Al terminar, el script imprime la URL del sitio, con esta forma:

```
http://studyhub-frontend-2026-udea.s3-website-us-east-1.amazonaws.com
```

En este primer despliegue el sitio carga, pero todavía no puede iniciar sesión.

### 2. Desplegar el backend con esa URL como origen permitido (CORS)

Desde la carpeta `backend/`, pegando la URL **sin "/" al final**:

```bash
serverless deploy --param="origen=http://studyhub-frontend-2026-udea.s3-website-us-east-1.amazonaws.com"
```

Del resultado se copian tres valores:

- `endpoint`: la URL base del HTTP API, por ejemplo `https://abc123.execute-api.us-east-1.amazonaws.com`.
- `UserPoolId`.
- `UserPoolClientId`.

Si en algún momento ya no aparecen, se pueden ver con `serverless info --verbose`.

### 3. Configurar el frontend y volver a subirlo

Edita `js/config.js` con esos valores:

```js
window.STUDYHUB_CONFIG = {
  region: "us-east-1",
  apiUrl: "https://abc123.execute-api.us-east-1.amazonaws.com",
  userPoolId: "us-east-1_AbCdEfGhI",
  clientId: "1a2b3c4d5e6f7g8h9i0j1k2l3m",
};
```

Después vuelve a ejecutar `deploy.ps1` o `deploy.sh`.

### 4. Crear el primer administrador

1. En el sitio, **Crear cuenta**, y confirmar con el código que llega al correo. La cuenta queda en el grupo `estudiante`.
2. Pasarla al grupo `admin` desde la consola de Cognito (*User pools → studyhub-usuarios-dev → Users → usuario → Add user to group → admin*) o con AWS CLI:

   ```bash
   aws cognito-idp admin-add-user-to-group --region us-east-1 \
     --user-pool-id <UserPoolId> --username <correo> --group-name admin
   ```

3. Cerrar sesión y volver a entrar, para que el token incluya el nuevo grupo.

### Alternativa sin CLI (consola de AWS)

1. **S3 → Create bucket** en us-east-1. Desmarca *Block all public access* y acepta el aviso.
2. Sube `index.html` y las carpetas `css/` y `js/` a la raíz del bucket.
3. **Properties → Static website hosting → Enable**, con Index document `index.html`. Ahí aparece la URL del sitio.
4. **Permissions → Bucket policy**, reemplazando `NOMBRE-DEL-BUCKET`:

   ```json
   {
     "Version": "2012-10-17",
     "Statement": [{
       "Sid": "LecturaPublicaDelSitio",
       "Effect": "Allow",
       "Principal": "*",
       "Action": "s3:GetObject",
       "Resource": "arn:aws:s3:::NOMBRE-DEL-BUCKET/*"
     }]
   }
   ```

## Seguridad aplicada

- El bucket del sitio solo permite `s3:GetObject` público: nadie anónimo puede listar, escribir ni borrar. Las ACL públicas siguen bloqueadas y el bucket tiene cifrado SSE-S3.
- Los archivos de material viven en otro bucket **privado**, al que solo se accede con URLs firmadas que vencen a los 5 minutos.
- El API solo acepta peticiones con un JWT válido de Cognito. Los permisos por rol se validan en la Lambda, no solo se ocultan en la interfaz.
- Los tokens se guardan en `sessionStorage`, así que se borran al cerrar la pestaña, y se refrescan automáticamente con el *refresh token*.
- Todo el texto que viene del API se escapa antes de pintarlo, para evitar XSS.

## Probar en local

No necesita instalar nada: basta un servidor estático, por ejemplo `npx serve .` o `python -m http.server 5500`.

Para que funcione contra el backend real, ese origen tiene que estar permitido en CORS. Despliega el backend con `--param="origen=http://localhost:5500"`, o con `*` solo para pruebas.
