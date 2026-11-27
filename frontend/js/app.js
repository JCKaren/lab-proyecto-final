// Interfaz de StudyHub: enrutamiento por hash y vistas por rol (admin / estudiante).
(function () {
  const $ = (sel, raiz = document) => raiz.querySelector(sel);
  const $$ = (sel, raiz = document) => [...raiz.querySelectorAll(sel)];

  const TIPOS_PQRS = ["PETICION", "QUEJA", "RECLAMO", "SUGERENCIA"];
  const NOMBRE_TIPO = { PETICION: "Petición", QUEJA: "Queja", RECLAMO: "Reclamo", SUGERENCIA: "Sugerencia" };

  // Tipos de archivo que acepta la Lambda de materiales.
  const TIPOS_ARCHIVO = {
    pdf: "application/pdf",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ppt: "application/vnd.ms-powerpoint",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    xls: "application/vnd.ms-excel",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    zip: "application/zip",
    txt: "text/plain",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
  };
  const MAX_MB = 25;

  let usuario = null;
  let cursosCache = [];

  // ---------- utilidades ----------
  const esc = (v) =>
    String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

  const fecha = (iso) =>
    iso
      ? new Date(iso).toLocaleString("es-CO", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
      : "";

  const esAdmin = () => usuario?.rol === "admin";

  function aviso(mensaje, tipo = "ok") {
    const el = document.createElement("div");
    el.className = `aviso aviso--${tipo}`;
    el.textContent = mensaje;
    $("#avisos").appendChild(el);
    setTimeout(() => el.classList.add("aviso--salida"), 3800);
    setTimeout(() => el.remove(), 4300);
  }

  function datosForm(form) {
    const datos = {};
    new FormData(form).forEach((v, k) => {
      if (typeof v === "string") {
        const limpio = v.trim();
        if (limpio !== "") datos[k] = limpio;
      }
    });
    return datos;
  }

  // Deshabilita el botón de envío mientras corre la promesa.
  async function ocupado(form, fn) {
    const boton = $('button[type="submit"]', form);
    const texto = boton?.textContent;
    if (boton) {
      boton.disabled = true;
      boton.textContent = "Procesando…";
    }
    try {
      return await fn();
    } finally {
      if (boton) {
        boton.disabled = false;
        boton.textContent = texto;
      }
    }
  }

  const cargando = () => `<div class="cargando"><span></span> Cargando…</div>`;
  const vacio = (texto) => `<div class="vacio">${esc(texto)}</div>`;
  const errorBloque = (err) => `<div class="vacio vacio--error">${esc(err.message)}</div>`;

  // ---------- autenticación ----------
  function mostrarPanelAuth(panel) {
    $$(".pestana").forEach((p) => p.classList.toggle("activa", p.dataset.pestana === panel));
    $$("[data-panel]").forEach((f) => (f.hidden = f.dataset.panel !== panel));
    $(".pestanas").hidden = panel === "confirmar";
  }

  function irAConfirmar(email) {
    $("#form-confirmar [name=email]").value = email;
    $("#confirmar-email").textContent = email;
    mostrarPanelAuth("confirmar");
  }

  function iniciarAuth() {
    $$(".pestana").forEach((p) => p.addEventListener("click", () => mostrarPanelAuth(p.dataset.pestana)));

    $("#form-login").addEventListener("submit", (e) => {
      e.preventDefault();
      const form = e.target;
      const { email, password } = datosForm(form);
      ocupado(form, async () => {
        try {
          await Auth.iniciarSesion(email, password);
          form.reset();
          entrar();
        } catch (err) {
          if (err.tipo === "UserNotConfirmedException") {
            irAConfirmar(email);
            aviso(err.message, "info");
          } else aviso(err.message, "error");
        }
      });
    });

    $("#form-registro").addEventListener("submit", (e) => {
      e.preventDefault();
      const form = e.target;
      const { nombre, email, password } = datosForm(form);
      ocupado(form, async () => {
        try {
          await Auth.registrar(nombre, email, password);
          form.reset();
          irAConfirmar(email);
          aviso("Cuenta creada. Revisa tu correo.", "ok");
        } catch (err) {
          aviso(err.message, "error");
        }
      });
    });

    $("#form-confirmar").addEventListener("submit", (e) => {
      e.preventDefault();
      const form = e.target;
      const { email, codigo } = datosForm(form);
      ocupado(form, async () => {
        try {
          await Auth.confirmar(email, codigo);
          form.reset();
          mostrarPanelAuth("login");
          $("#form-login [name=email]").value = email;
          $("#form-login [name=password]").focus();
          aviso("Cuenta confirmada. Ya puedes iniciar sesión.", "ok");
        } catch (err) {
          aviso(err.message, "error");
        }
      });
    });

    $("#reenviar-codigo").addEventListener("click", async () => {
      try {
        await Auth.reenviarCodigo($("#form-confirmar [name=email]").value);
        aviso("Te enviamos un nuevo código.", "info");
      } catch (err) {
        aviso(err.message, "error");
      }
    });

    $("#cerrar-sesion").addEventListener("click", () => {
      Auth.cerrarSesion();
      salir();
    });

    window.addEventListener("studyhub:sesion-expirada", () => {
      aviso("Tu sesión expiró. Inicia sesión de nuevo.", "info");
      salir();
    });
  }

  function entrar() {
    usuario = Auth.usuario();
    if (!usuario) return salir();
    $("#vista-auth").hidden = true;
    $("#vista-app").hidden = false;
    $("#perfil-nombre").textContent = usuario.nombre;
    const rol = $("#perfil-rol");
    rol.textContent = usuario.rol === "admin" ? "Administrador" : usuario.rol === "estudiante" ? "Estudiante" : "Sin rol";
    rol.className = `etiqueta ${usuario.rol === "admin" ? "etiqueta--oscura" : "etiqueta--verde"}`;
    if (!location.hash || location.hash === "#/") location.hash = "#/cursos";
    else enrutar();
  }

  function salir() {
    usuario = null;
    cursosCache = [];
    $("#vista-app").hidden = true;
    $("#vista-auth").hidden = false;
    $("#contenido").innerHTML = "";
    if (location.hash) history.replaceState(null, "", location.pathname + location.search);
    mostrarPanelAuth("login");
  }

  // ---------- enrutamiento ----------
  function enrutar() {
    if (!usuario) return;
    const partes = location.hash.replace(/^#\/?/, "").split("/").map(decodeURIComponent);
    const [seccion, idCurso] = partes;
    $$(".menu a").forEach((a) => a.classList.toggle("activo", a.dataset.ruta === seccion));

    if (!usuario.rol) return vistaSinRol();
    if (seccion === "pqrs") return vistaPqrs();
    if (seccion === "cursos" && idCurso) return vistaCurso(idCurso);
    return vistaCursos();
  }

  function vistaSinRol() {
    $("#contenido").innerHTML = `
      <div class="vacio vacio--error">
        Tu cuenta no tiene un rol asignado todavía. Cierra sesión y vuelve a entrar;
        si el problema sigue, pide a un administrador que te agregue a un grupo.
      </div>`;
  }

  // ---------- cursos ----------
  async function vistaCursos() {
    const c = $("#contenido");
    c.innerHTML = `
      <div class="encabezado">
        <div>
          <h1>Cursos</h1>
          <p class="sub">${esAdmin() ? "Crea cursos y gestiona su material." : "Elige un curso para ver su material de estudio."}</p>
        </div>
      </div>
      ${esAdmin() ? formCurso() : ""}
      <div id="lista-cursos">${cargando()}</div>`;

    if (esAdmin()) {
      $("#form-curso").addEventListener("submit", (e) => {
        e.preventDefault();
        const form = e.target;
        const datos = datosForm(form);
        datos.codigo = (datos.codigo || "").toUpperCase();
        ocupado(form, async () => {
          try {
            const curso = await Api.crearCurso(datos);
            form.reset();
            aviso(`Curso ${curso.cursoId} creado.`);
            pintarCursos();
          } catch (err) {
            aviso(err.message, "error");
          }
        });
      });
    }
    pintarCursos();
  }

  const formCurso = () => `
    <details class="tarjeta plegable">
      <summary>+ Nuevo curso</summary>
      <form id="form-curso" class="formulario formulario--rejilla">
        <label>Código
          <input name="codigo" placeholder="SIS-301" maxlength="20" required />
        </label>
        <label>Semestre
          <input name="semestre" placeholder="2026-2" maxlength="20" />
        </label>
        <label class="ancho">Nombre
          <input name="nombre" placeholder="Cloud Computing" minlength="3" maxlength="120" required />
        </label>
        <label class="ancho">Descripción
          <textarea name="descripcion" rows="2" maxlength="1000"></textarea>
        </label>
        <div class="ancho"><button class="boton boton--primario" type="submit">Crear curso</button></div>
      </form>
    </details>`;

  async function pintarCursos() {
    const lista = $("#lista-cursos");
    if (!lista) return;
    try {
      cursosCache = await Api.listarCursos();
    } catch (err) {
      lista.innerHTML = errorBloque(err);
      return;
    }
    if (!cursosCache.length) {
      lista.innerHTML = vacio(esAdmin() ? "Aún no hay cursos. Crea el primero." : "Todavía no hay cursos publicados.");
      return;
    }
    lista.innerHTML = `<div class="rejilla">${cursosCache
      .map(
        (k) => `
        <article class="tarjeta curso">
          <a class="curso__enlace" href="#/cursos/${encodeURIComponent(k.cursoId)}">
            <span class="curso__codigo">${esc(k.cursoId)}</span>
            <h3>${esc(k.nombre)}</h3>
            ${k.descripcion ? `<p>${esc(k.descripcion)}</p>` : ""}
          </a>
          <footer>
            ${k.semestre ? `<span class="etiqueta">${esc(k.semestre)}</span>` : "<span></span>"}
            ${esAdmin() ? `<button class="boton boton--peligro boton--chico" data-borrar-curso="${esc(k.cursoId)}">Eliminar</button>` : ""}
          </footer>
        </article>`
      )
      .join("")}</div>`;

    $$("[data-borrar-curso]", lista).forEach((b) =>
      b.addEventListener("click", async () => {
        const cursoId = b.dataset.borrarCurso;
        if (!confirm(`¿Eliminar el curso ${cursoId}?`)) return;
        try {
          await Api.eliminarCurso(cursoId);
          aviso("Curso eliminado.");
          pintarCursos();
        } catch (err) {
          aviso(err.message, "error");
        }
      })
    );
  }

  // ---------- materiales de un curso ----------
  async function vistaCurso(cursoId) {
    const c = $("#contenido");
    c.innerHTML = cargando();
    let curso;
    try {
      curso = await Api.obtenerCurso(cursoId);
    } catch (err) {
      c.innerHTML = `<a class="volver" href="#/cursos">← Cursos</a>${errorBloque(err)}`;
      return;
    }

    c.innerHTML = `
      <a class="volver" href="#/cursos">← Cursos</a>
      <div class="encabezado">
        <div>
          <span class="curso__codigo">${esc(curso.cursoId)}</span>
          <h1>${esc(curso.nombre)}</h1>
          ${curso.descripcion ? `<p class="sub">${esc(curso.descripcion)}</p>` : ""}
        </div>
        ${curso.semestre ? `<span class="etiqueta">${esc(curso.semestre)}</span>` : ""}
      </div>
      ${esAdmin() ? formMaterial() : ""}
      <h2>Material de estudio</h2>
      <div id="lista-materiales">${cargando()}</div>`;

    if (esAdmin()) $("#form-material").addEventListener("submit", (e) => subirMaterial(e, cursoId));
    pintarMateriales(cursoId);
  }

  const formMaterial = () => `
    <details class="tarjeta plegable">
      <summary>+ Subir material</summary>
      <form id="form-material" class="formulario formulario--rejilla">
        <label class="ancho">Título
          <input name="titulo" minlength="3" maxlength="150" required />
        </label>
        <label class="ancho">Descripción
          <textarea name="descripcion" rows="2" maxlength="1000"></textarea>
        </label>
        <label class="ancho">Archivo
          <input name="archivo" type="file" required
            accept=".${Object.keys(TIPOS_ARCHIVO).join(",.")}" />
          <small>PDF, Word, PowerPoint, Excel, ZIP, TXT o imagen. Máximo ${MAX_MB} MB.</small>
        </label>
        <div class="ancho"><button class="boton boton--primario" type="submit">Subir</button></div>
      </form>
    </details>`;

  function tipoDeArchivo(archivo) {
    const ext = archivo.name.split(".").pop().toLowerCase();
    const porExtension = TIPOS_ARCHIVO[ext];
    if (archivo.type && Object.values(TIPOS_ARCHIVO).includes(archivo.type)) return archivo.type;
    return porExtension || null;
  }

  function subirMaterial(e, cursoId) {
    e.preventDefault();
    const form = e.target;
    const archivo = form.archivo.files[0];
    const { titulo, descripcion } = datosForm(form);
    if (!archivo) return aviso("Selecciona un archivo.", "error");
    const tipoContenido = tipoDeArchivo(archivo);
    if (!tipoContenido) return aviso("Ese tipo de archivo no está permitido.", "error");
    if (archivo.size > MAX_MB * 1024 * 1024) return aviso(`El archivo supera ${MAX_MB} MB.`, "error");

    ocupado(form, async () => {
      let creado;
      try {
        // 1) La Lambda registra el material en DynamoDB y devuelve una URL firmada de subida.
        creado = await Api.crearMaterial(cursoId, {
          titulo,
          descripcion,
          nombreArchivo: archivo.name,
          tipoContenido,
        });
        // 2) El navegador sube el archivo directo al bucket privado.
        await Api.subirArchivo(creado.urlSubida, archivo, tipoContenido);
        form.reset();
        aviso("Material publicado.");
        pintarMateriales(cursoId);
      } catch (err) {
        // Si falló la subida, se borra el registro para no dejar material sin archivo.
        if (creado?.material?.materialId) {
          Api.eliminarMaterial(cursoId, creado.material.materialId).catch(() => {});
        }
        aviso(err.message, "error");
      }
    });
  }

  const ICONO = (tipo = "") =>
    tipo.includes("pdf") ? "PDF"
      : tipo.includes("word") ? "DOC"
      : tipo.includes("presentation") || tipo.includes("powerpoint") ? "PPT"
      : tipo.includes("sheet") || tipo.includes("excel") ? "XLS"
      : tipo.includes("zip") ? "ZIP"
      : tipo.startsWith("image/") ? "IMG"
      : "TXT";

  async function pintarMateriales(cursoId) {
    const lista = $("#lista-materiales");
    if (!lista) return;
    let materiales;
    try {
      materiales = await Api.listarMateriales(cursoId);
    } catch (err) {
      lista.innerHTML = errorBloque(err);
      return;
    }
    if (!materiales.length) {
      lista.innerHTML = vacio("Este curso aún no tiene material.");
      return;
    }
    lista.innerHTML = `<ul class="lista">${materiales
      .map(
        (m) => `
        <li class="fila">
          <span class="icono-archivo">${ICONO(m.tipoContenido)}</span>
          <div class="fila__texto">
            <strong>${esc(m.titulo)}</strong>
            ${m.descripcion ? `<span>${esc(m.descripcion)}</span>` : ""}
            <small>${esc(m.nombreArchivo)} · ${esc(fecha(m.fechaCreacion))}${m.creadoPor ? ` · ${esc(m.creadoPor)}` : ""}</small>
          </div>
          <div class="fila__acciones">
            <button class="boton boton--secundario boton--chico" data-descargar="${esc(m.materialId)}">Descargar</button>
            ${esAdmin() ? `<button class="boton boton--peligro boton--chico" data-borrar-material="${esc(m.materialId)}">Eliminar</button>` : ""}
          </div>
        </li>`
      )
      .join("")}</ul>`;

    $$("[data-descargar]", lista).forEach((b) =>
      b.addEventListener("click", async () => {
        b.disabled = true;
        try {
          const { urlDescarga } = await Api.obtenerMaterial(cursoId, b.dataset.descargar);
          window.location.assign(urlDescarga); // URL firmada, válida por pocos minutos
        } catch (err) {
          aviso(err.message, "error");
        } finally {
          b.disabled = false;
        }
      })
    );

    $$("[data-borrar-material]", lista).forEach((b) =>
      b.addEventListener("click", async () => {
        if (!confirm("¿Eliminar este material?")) return;
        try {
          await Api.eliminarMaterial(cursoId, b.dataset.borrarMaterial);
          aviso("Material eliminado.");
          pintarMateriales(cursoId);
        } catch (err) {
          aviso(err.message, "error");
        }
      })
    );
  }

  // ---------- PQRS ----------
  async function vistaPqrs() {
    const c = $("#contenido");
    c.innerHTML = `
      <div class="encabezado">
        <div>
          <h1>PQRS</h1>
          <p class="sub">${esAdmin() ? "Peticiones, quejas, reclamos y sugerencias de los estudiantes." : "Envía tus peticiones, quejas, reclamos o sugerencias y sigue su respuesta."}</p>
        </div>
        ${esAdmin() ? `
          <label class="filtro">Estado
            <select id="filtro-estado">
              <option value="">Todas</option>
              <option value="PENDIENTE" selected>Pendientes</option>
              <option value="RESPONDIDA">Respondidas</option>
            </select>
          </label>` : ""}
      </div>
      ${esAdmin() ? "" : `<div id="contenedor-form-pqrs">${cargando()}</div>`}
      <h2>${esAdmin() ? "Solicitudes" : "Mis solicitudes"}</h2>
      <div id="lista-pqrs">${cargando()}</div>`;

    if (esAdmin()) {
      $("#filtro-estado").addEventListener("change", pintarPqrs);
    } else {
      if (!cursosCache.length) {
        try {
          cursosCache = await Api.listarCursos();
        } catch {
          cursosCache = [];
        }
      }
      const cont = $("#contenedor-form-pqrs");
      if (!cont) return;
      cont.innerHTML = formPqrs();
      $("#form-pqrs").addEventListener("submit", (e) => {
        e.preventDefault();
        const form = e.target;
        ocupado(form, async () => {
          try {
            await Api.crearPqrs(datosForm(form));
            form.reset();
            aviso("Solicitud enviada.");
            pintarPqrs();
          } catch (err) {
            aviso(err.message, "error");
          }
        });
      });
    }
    pintarPqrs();
  }

  const formPqrs = () => `
    <details class="tarjeta plegable" open>
      <summary>+ Nueva solicitud</summary>
      <form id="form-pqrs" class="formulario formulario--rejilla">
        <label>Tipo
          <select name="tipo" required>
            ${TIPOS_PQRS.map((t) => `<option value="${t}">${NOMBRE_TIPO[t]}</option>`).join("")}
          </select>
        </label>
        <label>Curso (opcional)
          <select name="cursoId">
            <option value="">General</option>
            ${cursosCache.map((k) => `<option value="${esc(k.cursoId)}">${esc(k.cursoId)} · ${esc(k.nombre)}</option>`).join("")}
          </select>
        </label>
        <label class="ancho">Asunto
          <input name="asunto" minlength="3" maxlength="150" required />
        </label>
        <label class="ancho">Descripción
          <textarea name="descripcion" rows="3" minlength="10" maxlength="2000" required></textarea>
        </label>
        <div class="ancho"><button class="boton boton--primario" type="submit">Enviar</button></div>
      </form>
    </details>`;

  async function pintarPqrs() {
    const lista = $("#lista-pqrs");
    if (!lista) return;
    lista.innerHTML = cargando();
    const estado = esAdmin() ? $("#filtro-estado")?.value : "";
    let items;
    try {
      items = await Api.listarPqrs(estado);
    } catch (err) {
      lista.innerHTML = errorBloque(err);
      return;
    }
    if (!items.length) {
      lista.innerHTML = vacio(esAdmin() ? "No hay solicitudes con ese filtro." : "Aún no has enviado solicitudes.");
      return;
    }
    lista.innerHTML = items
      .map((p) => {
        const pendiente = p.estado === "PENDIENTE";
        return `
        <article class="tarjeta pqrs">
          <header>
            <span class="etiqueta etiqueta--${p.tipo.toLowerCase()}">${NOMBRE_TIPO[p.tipo] || esc(p.tipo)}</span>
            ${p.cursoId ? `<span class="etiqueta">${esc(p.cursoId)}</span>` : ""}
            <span class="estado estado--${pendiente ? "pendiente" : "respondida"}">${pendiente ? "Pendiente" : "Respondida"}</span>
          </header>
          <h3>${esc(p.asunto)}</h3>
          <p>${esc(p.descripcion)}</p>
          <small>${esAdmin() ? `${esc(p.usuarioNombre)} (${esc(p.usuarioEmail)}) · ` : ""}${esc(fecha(p.fechaCreacion))}</small>
          ${p.respuesta ? `
            <div class="respuesta">
              <strong>Respuesta</strong>
              <p>${esc(p.respuesta)}</p>
              <small>${esc(p.respondidaPor || "")} · ${esc(fecha(p.fechaRespuesta))}</small>
            </div>` : ""}
          ${esAdmin() && pendiente ? `
            <form class="formulario form-responder" data-pqrs="${esc(p.pqrsId)}">
              <label>Responder
                <textarea name="respuesta" rows="2" maxlength="2000" required></textarea>
              </label>
              <div><button class="boton boton--primario boton--chico" type="submit">Enviar respuesta</button></div>
            </form>` : ""}
        </article>`;
      })
      .join("");

    $$(".form-responder", lista).forEach((form) =>
      form.addEventListener("submit", (e) => {
        e.preventDefault();
        const { respuesta } = datosForm(form);
        ocupado(form, async () => {
          try {
            await Api.responderPqrs(form.dataset.pqrs, respuesta);
            aviso("Respuesta enviada.");
            pintarPqrs();
          } catch (err) {
            aviso(err.message, "error");
          }
        });
      })
    );
  }

  // ---------- arranque ----------
  iniciarAuth();
  window.addEventListener("hashchange", enrutar);
  if (Auth.usuario()) entrar();
  else salir();
})();
