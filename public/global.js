// ==========================================
// 1. global.js (Enlazar en TODAS las pantallas)
// ==========================================

// --- FIREBASE Y GESTOR GLOBAL DE LECTURAS ---
const firebaseConfig = {
    apiKey: "AIzaSyD8GcNrjousLrlNSKXcNrjl0gjAYuXvTMQ",
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

window.database.ref('Seroa/Actual').on('value', snapshot => {
    const datos = snapshot.val() || null;
    window.SeroaRealtime.notify(datos);
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

// SOLO PARA PRUEBAS: Aparece a los 3 segundos. Bórralo cuando conectes el ESP32 real.
setTimeout(mostrarAlertaSeroa, 3000);

// ==========================================
// REGISTRO DEL SERVICE WORKER
// ==========================================
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js')
      .then(registration => console.log('¡Service Worker registrado!', registration.scope))
      .catch(error => console.log('Falló el Service Worker:', error));
  });
}

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
        if (paginaActual !== 'login.html') {
            window.location.href = 'login.html';
        }
    }
}

function actualizarBadgePaciente() {
    // Busca si hay un paciente seleccionado, priorizando la clave estándar usada en scripts
    const pacienteSeleccionado = localStorage.getItem('selectedPatientName') || localStorage.getItem('pacienteActivoSeroa') || "Sin selección";

    // Actualiza todos los badges que usan el atributo data-paciente-actual
    const badgesPaciente = document.querySelectorAll('[data-paciente-actual]');
    badgesPaciente.forEach(el => {
        // si contiene un <strong>, remplazar su texto, si no, reemplazar innerHTML con formato
        const strong = el.querySelector('strong');
        if (strong) {
            strong.textContent = pacienteSeleccionado;
        } else {
            el.innerHTML = `<i class="bi bi-person-fill text-teal me-1"></i> Paciente Actual: <strong>${pacienteSeleccionado}</strong>`;
        }
    });
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

    // 3. Disparar Pruebas
    iniciarModoPrueba();
});