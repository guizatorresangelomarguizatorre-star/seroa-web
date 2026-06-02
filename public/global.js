// ==========================================
// 1. global.js (Enlazar en TODAS las pantallas)
// ==========================================

// --- FIREBASE Y GESTOR GLOBAL DE LECTURAS ---
const firebaseConfig = {
    apiKey: "AIzaSyD8GcNRjouSlrlNSKXcNrjl0gjAYuXvTMQ",
    authDomain: "seroa-e8606.firebaseapp.com",
    databaseURL: "https://seroa-e8606-default-rtdb.firebaseio.com",
    projectId: "seroa-e8606",
    storageBucket: "seroa-e8606.firebasestorage.app",
    messagingSenderId: "985506819702",
    appId: "1:985506819702:web:407215da36321f9084b957"
};

if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
window.database = firebase.database();

window.generarIdRegistro = function() {
    const tiempo = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14);
    const aleatorio = Math.random().toString(36).substring(2, 8).toUpperCase();
    return `R-${tiempo}-${aleatorio}`;
};

window.esHoy = function(fecha) {
    const dato = new Date(fecha);
    const hoy = new Date();
    return dato.getDate() === hoy.getDate() && dato.getMonth() === hoy.getMonth() && dato.getFullYear() === hoy.getFullYear();
};

window.SeroaRealtime = {
    database: window.database,
    currentData: null,
    isConnected: false,
    callbacks: [],
    currentRef: null,
    currentPath: null,
    subscribe(callback) {
        if (typeof callback !== 'function') return;
        this.callbacks.push(callback);
        if (this.currentData) callback(this.currentData);
    },
    notify(data) {
        this.currentData = data;
        this.isConnected = !!data && data.estado === 'ACTIVO';
        this.callbacks.forEach(cb => { try { cb(data); } catch (e) { console.error(e); } });
    }
};

// Attach a dynamic listener per-patient based on localStorage.selectedPatientId
window.SeroaRealtime.attachListener = function() {
    try {
        const pacienteId = localStorage.getItem('selectedPatientId');

        if (!pacienteId) {
            console.warn('No hay paciente seleccionado.');
            this.notify(null);
            return;
        }

        const path = `Seroa/Pacientes/${pacienteId}/Actual`;

        if (this.currentPath === path) return;

        if (this.currentRef) {
            try { this.currentRef.off(); } catch(e) {}
            this.currentRef = null;
        }

        this.currentPath = path;
        this.currentRef = window.database.ref(path);

        this.currentRef.on('value', snapshot => {
            const datos = snapshot.val() || null;
            console.log("Datos recibidos de Firebase:", datos);
            this.notify(datos);
        });

    } catch (err) {
        console.error('Error SeroaRealtime.attachListener:', err);
        this.notify(null);
    }
};

// Listen for storage changes (other tabs) to reattach listener when patient changes
window.addEventListener('storage', (e) => {
    if (e.key === 'selectedPatientId') {
        window.SeroaRealtime.attachListener();
    }
});

// --- RELOJ UNIVERSAL MULTI-PANTALLA ---
function actualizarReloj() {
    const ahora = new Date();
    const opciones = { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' };
    const textoFecha = ahora.toLocaleDateString('es-MX', opciones);
    
    const idsReloj = ["fecha", "fecha-dosificacion", "fecha-registro", "fecha-tanque", "fecha-config"];
    
    idsReloj.forEach(id => {
        const elemento = document.getElementById(id);
        if (elemento) {
            elemento.innerText = textoFecha;
        }
    });
}
setInterval(actualizarReloj, 60000);

// --- ALERTA CRÍTICA GIGANTE ---
function mostrarAlertaSeroa() {
    const alerta = document.getElementById('alertaGlobalSeroa');
    if(alerta) {
        alerta.classList.remove('d-none');
        if ("vibrate" in navigator) {
            navigator.vibrate([600, 200, 600, 200, 1000]); 
        }
    }
}

function ocultarAlertaSeroa() {
    const alerta = document.getElementById('alertaGlobalSeroa');
    if(alerta) {
        alerta.classList.add('d-none');
    }
}



// ==========================================
// REGISTRO DEL SERVICE WORKER
// ==========================================
let deferredPWAInstallPrompt = null;

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js')
      .then(registration => console.log('¡Service Worker registrado!', registration.scope))
      .catch(error => console.log('Falló el Service Worker:', error));
  });
}

function configurarBotonInstalacion() {
  const btnInstall = document.getElementById('btnInstallApp');
  if (!btnInstall) return;
  if (window.matchMedia('(display-mode: standalone)').matches) {
    btnInstall.classList.add('d-none');
    return;
  }
  if (!deferredPWAInstallPrompt) {
    btnInstall.classList.add('d-none');
    return;
  }
  btnInstall.classList.remove('d-none');
  if (btnInstall.dataset.installHandlerAttached !== 'true') {
    btnInstall.addEventListener('click', async () => {
      if (!deferredPWAInstallPrompt) return;
      deferredPWAInstallPrompt.prompt();
      const choiceResult = await deferredPWAInstallPrompt.userChoice;
      if (choiceResult.outcome === 'accepted') {
        mostrarToast('Instalación aceptada. Abre Seroa desde tu pantalla de inicio.', 'success');
      } else {
        mostrarToast('Instalación cancelada. Vuelve a intentarlo cuando quieras.', 'warning');
      }
      deferredPWAInstallPrompt = null;
      btnInstall.classList.add('d-none');
    });
    btnInstall.dataset.installHandlerAttached = 'true';
  }
}

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  deferredPWAInstallPrompt = event;
  configurarBotonInstalacion();
});

window.addEventListener('appinstalled', () => {
  const btnInstall = document.getElementById('btnInstallApp');
  if (btnInstall) btnInstall.classList.add('d-none');
  mostrarToast('Seroa instalada. ¡Listo para usar como aplicación móvil!', 'success');
});

// ==========================================
// MONITOR DE CONEXIÓN GLOBAL (Watchdog)
// ==========================================
let temporizadorDesconexion;

window.confirmarConexion = function() {
    const luzConexion = document.getElementById('luz-conexion');
    const textoConexion = document.getElementById('texto-conexion');
    
    if (luzConexion && textoConexion) {
        luzConexion.style.backgroundColor = '#28a745'; // Verde
        luzConexion.style.boxShadow = '0 0 8px #28a745';
        textoConexion.innerText = 'Dispositivo Seroa: En Línea';
    }

    clearTimeout(temporizadorDesconexion);
    temporizadorDesconexion = setTimeout(() => {
        if (luzConexion && textoConexion) {
            luzConexion.style.backgroundColor = '#dc3545'; // Rojo
            luzConexion.style.boxShadow = '0 0 8px #dc3545';
            textoConexion.innerText = 'Dispositivo Seroa: Desconectado';
        }
    }, 10000);
};

// ==========================================
// FUNCIONES DE CONTROL DE ACCESO Y PACIENTE
// ==========================================
function validarSesionUsuario() {
    const nombreGuardado = localStorage.getItem('nombrePaciente');
    const userId = localStorage.getItem('userId');
    const paginaActual = window.location.pathname.split("/").pop();

    if (nombreGuardado) {
        const primerNombre = nombreGuardado.split(' ')[0];
        
        // Inyectamos nombre en cabecera
        const elementoNombreHeader = document.getElementById('nombreUsuarioHeader');
        if (elementoNombreHeader) elementoNombreHeader.textContent = primerNombre;
        
        // Inyectamos nombre en el saludo grande
        const saludoPantalla = document.getElementById('nombreUsuarioPantalla');
        if (saludoPantalla) saludoPantalla.textContent = primerNombre;

        // Actualizamos el paciente seleccionado
        actualizarBadgePaciente();
    } else {
        const paginaActual = window.location.pathname.split("/").pop();
        if (paginaActual !== 'login.html' && paginaActual !== 'invitado.html') {
            window.location.href = 'login.html';
        }
    }
}

function actualizarBadgePaciente() {
    // Busca si hay un paciente seleccionado
    const pacienteNombre = localStorage.getItem('selectedPatientName') || localStorage.getItem('pacienteActivoSeroa');
    const pacienteRol = localStorage.getItem('selectedPatientRole');
    
    // Validación: Si no hay paciente, mostrar mensaje específico
    const display = (pacienteNombre && pacienteNombre !== '' && pacienteNombre !== 'null' && pacienteNombre !== 'undefined')
        ? `${pacienteNombre}${pacienteRol ? ' | ' + pacienteRol : ''}` 
        : 'No hay pacientes seleccionados';

    // Actualiza todos los badges que usan el atributo data-paciente-actual
    const badgesPaciente = document.querySelectorAll('[data-paciente-actual]');
    badgesPaciente.forEach(el => {
        const strong = el.querySelector('strong');
        if (strong) {
            strong.textContent = display;
        } else {
            el.innerHTML = `<i class="bi bi-person-fill text-teal me-1"></i> Paciente Actual: <strong>${display}</strong>`;
        }
    });

    // Aplicar restricciones UI según rol
    try { aplicarRestriccionesDeRol(); } catch (e) { console.error('Error aplicando restricciones de rol:', e); }
    
    // Actualizar tooltip del usuario
    actualizarTooltipUsuario();
}

// Nueva función para actualizar y inicializar el tooltip
function actualizarTooltipUsuario() {
    const nombreUsuario = localStorage.getItem('nombrePaciente') || 'Usuario anónimo';
    const userTooltipElement = document.getElementById('userTooltip');
    const avatarIcon = userTooltipElement ? userTooltipElement.querySelector('.avatar-icon') : null;
    
    if (userTooltipElement) {
        userTooltipElement.setAttribute('data-bs-title', `${nombreUsuario}`);
        
        // Reinicializar el tooltip de Bootstrap 5
        const tooltipInstance = bootstrap.Tooltip.getInstance(userTooltipElement);
        if (tooltipInstance) {
            tooltipInstance.dispose();
        }
        new bootstrap.Tooltip(userTooltipElement);
    }
    
    // Agregar title attribute al ícono para tooltip nativo
    if (avatarIcon) {
        avatarIcon.setAttribute('title', nombreUsuario);
    }
}

// Oculta o deshabilita controles sensibles cuando el rol es 'Invitado'
window.mostrarToast = function(mensaje, tipo = 'success', duracion = 3000) {
    try {
        const body = document.body || document.documentElement;
        if (!body) return;

        let container = document.getElementById('seroaToastContainer');
        if (!container) {
            container = document.createElement('div');
            container.id = 'seroaToastContainer';
            container.style.position = 'fixed';
            container.style.top = '1rem';
            container.style.right = '1rem';
            container.style.zIndex = '1085';
            container.style.minWidth = '280px';
            body.appendChild(container);
        }

        const toast = document.createElement('div');
        const toastClass = tipo === 'danger' ? 'bg-danger text-white' : tipo === 'warning' ? 'bg-warning text-dark' : 'bg-success text-white';
        toast.className = `toast align-items-center border-0 ${toastClass}`;
        toast.role = 'alert';
        toast.ariaLive = 'assertive';
        toast.ariaAtomic = 'true';
        toast.style.minWidth = '280px';
        toast.innerHTML = `
            <div class="d-flex">
                <div class="toast-body">${mensaje}</div>
                <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Cerrar"></button>
            </div>
        `;

        container.appendChild(toast);
        const bootToast = new bootstrap.Toast(toast, { delay: duracion });
        bootToast.show();
        toast.addEventListener('hidden.bs.toast', () => toast.remove());
    } catch (err) {
        console.error('mostrarToast error:', err);
    }
};

window.formatearErrorUsuario = function(error, fallback = 'Ocurrió un error inesperado. Intenta nuevamente.') {
    if (!error) return fallback;
    const texto = typeof error === 'string' ? error : (error.message || error.error || '');
    const mensaje = texto.toString().trim();
    if (!mensaje) return fallback;
    const clave = mensaje.toLowerCase();

    if (clave.includes('network') || clave.includes('failed to fetch') || clave.includes('fetch') || clave.includes('timeout')) {
        return 'No se pudo conectar con el servidor. Revisa tu conexión a internet.';
    }
    if (clave.includes('unauthorized') || clave.includes('forbidden') || clave.includes('acceso denegado') || clave.includes('permiso')) {
        return 'No tienes permisos para realizar esta acción.';
    }
    if (clave.includes('not found') || clave.includes('no encontrado')) {
        return 'El recurso no fue encontrado. Intenta nuevamente.';
    }
    if (clave.includes('invalid') || clave.includes('inválido') || clave.includes('required') || clave.includes('campo')) {
        return 'Por favor revisa los datos y completa los campos requeridos.';
    }
    if (clave.includes('email') && clave.includes('exists')) {
        return 'El correo ya está registrado. Usa otro o recupera tu cuenta.';
    }
    return mensaje.charAt(0).toUpperCase() + mensaje.slice(1);
};

function aplicarRestriccionesDeRol() {
    try {
        const rol = localStorage.getItem('selectedPatientRole') || 'Invitado';
        const ocultarSelectors = [
            '.rol-editar',
            '.btn-activar-valvula',
            '.btn-guardar-config',
            '.btn-eliminar-acceso',
            '.rol-admin-only',
            '[data-protect-role]'
        ];
        const paginasRestringidas = ['dosificacion.html', 'registro.html', 'tanque.html', 'configuracion.html'];

        if (rol === 'Invitado') {
            ocultarSelectors.forEach(sel => {
                document.querySelectorAll(sel).forEach(el => {
                    try { el.classList.add('d-none'); } catch(e) { try { el.style.display = 'none'; } catch(_){} }
                });
            });

            // Marcar enlaces como deshabilitados y añadir tooltip explicativo
            paginasRestringidas.forEach(href => {
                document.querySelectorAll(`.navbar-nav .nav-link[href="${href}"]`).forEach(el => {
                    const item = el.closest('li');
                    const target = item || el;
                    try {
                        target.classList.add('nav-disabled');
                        el.setAttribute('aria-disabled', 'true');
                        el.setAttribute('data-bs-toggle', 'tooltip');
                        el.setAttribute('data-bs-placement', 'bottom');
                        el.setAttribute('title', 'Acceso restringido: agrega un paciente o solicita un permiso');
                    } catch (e) { /* ignore */ }
                });
            });


        // Además, verificar si el usuario NO tiene pacientes en su cuenta.
        // Si no tiene pacientes, ocultamos las mismas pestañas restringidas.
        // Esto permite a usuarios sin pacientes no ver secciones que requieren un paciente.
        (async function actualizarVisibilidadPestanias() {
            try {
                const userId = localStorage.getItem('userId');
                let noTienePacientes = false;

                if (!userId) {
                    // Sin sesión, consideramos que no puede acceder a funciones
                    noTienePacientes = true;
                } else {
                    try {
                        const resp = await fetch(`/api/pacientes?id_usuario=${encodeURIComponent(userId)}`);
                        if (resp.ok) {
                            const data = await resp.json();
                            if (Array.isArray(data) && data.length === 0) noTienePacientes = true;
                        } else {
                            // Si la petición falla, no cambiamos visibilidad por seguridad
                            console.warn('No se pudo comprobar lista de pacientes:', resp.status);
                        }
                    } catch (err) {
                        console.error('Error al comprobar pacientes del usuario:', err);
                    }
                }

                const enlaces = document.querySelectorAll('.navbar-nav .nav-link');
                enlaces.forEach(el => {
                    const href = el.getAttribute('href');
                    if (!href) return;
                    if (paginasRestringidas.includes(href)) {
                        const item = el.closest('li');
                        const target = item || el;
                        if (noTienePacientes || rol === 'Invitado') {
                            target.classList.add('nav-disabled');
                            el.setAttribute('aria-disabled', 'true');
                            el.setAttribute('data-bs-toggle', 'tooltip');
                            el.setAttribute('data-bs-placement', 'bottom');
                            el.setAttribute('title', 'Acceso restringido: agrega un paciente o solicita un permiso de administrador o doctor');
                        } else {
                            target.classList.remove('nav-disabled');
                            el.removeAttribute('aria-disabled');
                            el.removeAttribute('data-bs-toggle');
                            el.removeAttribute('title');
                        }
                    }
                });
                // Inicializar tooltips en caso de que Bootstrap esté cargado
                try { var tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]')); tooltipTriggerList.map(function (el) { return new bootstrap.Tooltip(el); }); } catch(e) {}
            } catch (e) {
                console.error('actualizarVisibilidadPestanias error:', e);
            }
        })();
            const paginaActual = window.location.pathname.split('/').pop();
            if (paginasRestringidas.includes(paginaActual)) {
                window.location.href = 'pacientes.html';
            }
        } else {
            ocultarSelectors.forEach(sel => {
                document.querySelectorAll(sel).forEach(el => {
                    try { el.classList.remove('d-none'); el.style.display = ''; } catch(e) {}
                });
            });

            paginasRestringidas.forEach(href => {
                document.querySelectorAll(`.navbar-nav .nav-link[href="${href}"]`).forEach(el => {
                    const item = el.closest('li');
                    if (item) {
                        item.classList.remove('d-none');
                    } else {
                        el.classList.remove('d-none');
                    }
                });
            });
        }
    } catch (err) {
        console.error('aplicarRestriccionesDeRol error:', err);
    }
}

function cerrarSesion() {
    localStorage.removeItem('nombrePaciente');
    window.location.href = 'login.html';
}

// ==========================================
// CARGA DINÁMICA DE MENÚ Y CABECERA
// ==========================================
async function inyectarComponentesDinamicos() {
    // 1. HEADER
    const contenedorHeader = document.getElementById('header-container');
    if (contenedorHeader) {
        try {
            const response = await fetch('header.html');
            if(response.ok) {
                contenedorHeader.innerHTML = await response.text();
                // Actualizar tooltip del usuario después de inyectar header
                setTimeout(() => {
                    actualizarTooltipUsuario();
                }, 100);
            } else {
                console.error("Seroa Error: header.html no encontrado.");
            }
        } catch (error) { console.error("Seroa Error fetch header:", error); }
    }

    // 2. MENÚ
    const contenedorMenu = document.getElementById('menu-container');
    if (contenedorMenu) {
        try {
            const responseMenu = await fetch('menu.html');
            if(responseMenu.ok) {
                contenedorMenu.innerHTML = await responseMenu.text();
                resaltarMenuActivo();
            } else {
                console.error("Seroa Error: menu.html no encontrado.");
            }
        } catch (error) { console.error("Seroa Error fetch menú:", error); }
    }
    
    // Validamos sesión de nuevo una vez que los elementos existen en el DOM
    validarSesionUsuario();
    actualizarReloj();
    
    // Inicializar tooltips de Bootstrap 5
    const tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
    tooltipTriggerList.map(function (tooltipTriggerEl) {
        return new bootstrap.Tooltip(tooltipTriggerEl);
    });
}

function resaltarMenuActivo() {
    let paginaActual = window.location.pathname.split("/").pop();
    if (paginaActual === "" || paginaActual === "/") paginaActual = "index.html";

    const enlacesNav = document.querySelectorAll(".navbar-nav .nav-link");
    enlacesNav.forEach(enlace => {
        enlace.classList.remove("active", "activo");
        enlace.parentElement.classList.remove("active-nav", "fw-bold");
        
        if (enlace.getAttribute("href") === paginaActual) {
            enlace.classList.add("active", "activo");
            enlace.parentElement.classList.add("active-nav", "fw-bold");
        }
    });
}

// ==========================================
// MODO PRUEBA: SIMULACIÓN DE CONEXIÓN
// ==========================================
function iniciarModoPrueba() {
    let contador = 0;
    const intervalos = setInterval(() => {
        contador++;
        console.log(`Prueba ${contador}/4: Cambiando estado de conexión...`);

        if (contador === 1) {
            window.confirmarConexion(); 
        } else if (contador === 2) {
            const luz = document.getElementById('luz-conexion');
            const txt = document.getElementById('texto-conexion');
            if(luz && txt) {
                luz.style.backgroundColor = '#dc3545';
                luz.style.boxShadow = '0 0 8px #dc3545';
                txt.innerText = 'Dispositivo Seroa: Desconectado';
            }
        } else if (contador === 3) {
            window.confirmarConexion();
        } else if (contador === 4) {
            const luz = document.getElementById('luz-conexion');
            const txt = document.getElementById('texto-conexion');
            if(luz && txt) {
                luz.style.backgroundColor = '#dc3545';
                luz.style.boxShadow = '0 0 8px #dc3545';
                txt.innerText = 'Dispositivo Seroa: Desconectado';
            }
            clearInterval(intervalos);
        }
    }, 10000); 
}

// ==========================================
// INICIALIZADOR PRINCIPAL
// ==========================================
document.addEventListener("DOMContentLoaded", async () => {
    // 1. Forzar color rojo por defecto al cargar
    const luz = document.getElementById('luz-conexion');
    const txt = document.getElementById('texto-conexion');
    if(luz && txt) {
        luz.style.backgroundColor = '#dc3545';
        txt.innerText = 'Dispositivo Seroa: Desconectado';
    }

    // 2. Inyectar HTML Dinámico
    await inyectarComponentesDinamicos();

    configurarBotonInstalacion();

    // 3. Configurar listener dinámico de Realtime según paciente seleccionado
    try { window.SeroaRealtime.attachListener(); } catch (e) { console.error('Error iniciando listener Realtime:', e); }

    // 4. Disparar Pruebas
    
});
