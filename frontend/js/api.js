// Cliente del API REST de StudyHub (API Gateway HTTP API + Lambda).
// Todas las rutas exigen el ID token de Cognito en el header Authorization.
(function () {
  const BASE = window.STUDYHUB_CONFIG.apiUrl.replace(/\/+$/, "");

  class ApiError extends Error {
    constructor(status, mensaje) {
      super(mensaje);
      this.status = status;
    }
  }

  async function pedir(metodo, ruta, cuerpo, reintento = true) {
    const token = await Auth.token();
    if (!token) throw new ApiError(401, "Debes iniciar sesión.");

    let res;
    try {
      res = await fetch(BASE + ruta, {
        method: metodo,
        headers: {
          Authorization: `Bearer ${token}`,
          ...(cuerpo !== undefined && { "Content-Type": "application/json" }),
        },
        body: cuerpo !== undefined ? JSON.stringify(cuerpo) : undefined,
      });
    } catch {
      throw new ApiError(0, "No se pudo conectar con el servidor.");
    }

    if (res.status === 401 && reintento) {
      try {
        await Auth.refrescar();
        return pedir(metodo, ruta, cuerpo, false);
      } catch {
        Auth.cerrarSesion();
        window.dispatchEvent(new Event("studyhub:sesion-expirada"));
        throw new ApiError(401, "Tu sesión expiró. Inicia sesión de nuevo.");
      }
    }

    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new ApiError(res.status, data.error || data.message || `Error ${res.status}`);
    return data;
  }

  const id = encodeURIComponent;

  window.Api = {
    ApiError,
    // Cursos
    listarCursos: () => pedir("GET", "/cursos"),
    obtenerCurso: (cursoId) => pedir("GET", `/cursos/${id(cursoId)}`),
    crearCurso: (curso) => pedir("POST", "/cursos", curso),
    eliminarCurso: (cursoId) => pedir("DELETE", `/cursos/${id(cursoId)}`),

    // Materiales
    listarMateriales: (cursoId) => pedir("GET", `/cursos/${id(cursoId)}/materiales`),
    obtenerMaterial: (cursoId, materialId) =>
      pedir("GET", `/cursos/${id(cursoId)}/materiales/${id(materialId)}`),
    crearMaterial: (cursoId, material) => pedir("POST", `/cursos/${id(cursoId)}/materiales`, material),
    eliminarMaterial: (cursoId, materialId) =>
      pedir("DELETE", `/cursos/${id(cursoId)}/materiales/${id(materialId)}`),

    // Sube el archivo directo al bucket privado con la URL firmada que entrega la Lambda.
    async subirArchivo(urlSubida, archivo, tipoContenido) {
      let res;
      try {
        res = await fetch(urlSubida, {
          method: "PUT",
          headers: { "Content-Type": tipoContenido },
          body: archivo,
        });
      } catch {
        throw new ApiError(0, "No se pudo subir el archivo a S3.");
      }
      if (!res.ok) throw new ApiError(res.status, `S3 rechazó el archivo (${res.status}).`);
    },

    // PQRS
    listarPqrs: (estado) => pedir("GET", `/pqrs${estado ? `?estado=${id(estado)}` : ""}`),
    obtenerPqrs: (pqrsId) => pedir("GET", `/pqrs/${id(pqrsId)}`),
    crearPqrs: (pqrs) => pedir("POST", "/pqrs", pqrs),
    responderPqrs: (pqrsId, respuesta) => pedir("PUT", `/pqrs/${id(pqrsId)}/respuesta`, { respuesta }),
  };
})();
