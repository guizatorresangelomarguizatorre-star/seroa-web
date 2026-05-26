// ==========================================
// 1. global.js (Enlazar en TODAS las pantallas)
// ==========================================

// --- RELOJ UNIVERSAL MULTI-PANTALLA ---
function actualizarReloj() {
    const ahora = new Date();
    const opciones = { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' };
    const textoFecha = ahora.toLocaleDateString('es-MX', opciones);
    
    // Lista de los IDs que usamos para la fecha en distintas pantallas
    const idsReloj = ["fecha", "fecha-dosificacion", "fecha-registro", "fecha-tanque", "fecha-config"];
    
    // Actualiza el texto solo si encuentra el ID en la página actual
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
        // Vibración para dispositivos móviles
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
// REGISTRO DEL SERVICE WORKER (Para PWA / Instalación)
// ==========================================
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js')
      .then(registration => {
        console.log('¡Service Worker registrado con éxito!', registration.scope);
      })
      .catch(error => {
        console.log('Falló el registro del Service Worker:', error);
      });
  });
}

// ==========================================
// CARGA DINÁMICA DE CABECERA, MENÚ, SESIÓN Y NAVEGACIÓN
// ==========================================
document.addEventListener("DOMContentLoaded", async () => {
    
    // 1. INYECTAR HEADER DINÁMICO
    const contenedorHeader = document.getElementById('header-container');
    if (contenedorHeader) {
        try {
            const response = await fetch('header.html');
            const headerHtml = await response.text();
            contenedorHeader.innerHTML = headerHtml;
        } catch (error) {
            console.error("Error cargando el header:", error);
        }
    }

    // 2. INYECTAR MENÚ DINÁMICO
    const contenedorMenu = document.getElementById('menu-container');
    if (contenedorMenu) {
        try {
            const responseMenu = await fetch('menu.html');
            const menuHtml = await responseMenu.text();
            contenedorMenu.innerHTML = menuHtml;
            
            // LUEGO de inyectar el menú, ejecutamos la función de resaltado
            resaltarMenuActivo();
            
        } catch (error) {
            console.error("Error cargando el menú dinámico:", error);
        }
    } else {
        // En caso de que el menú no sea dinámico en alguna pantalla, corremos la función igual
        resaltarMenuActivo();
    }

    // 3. DISPARAR EL RELOJ (Para que llene la fecha en el header inyectado al instante)
    actualizarReloj();

    // 4. VALIDAR SESIÓN DEL PACIENTE
    validarSesionUsuario();

    // 5. Actualizar el paciente seleccionado en todas las páginas
    actualizarPacienteSeleccionado();
});

function actualizarPacienteSeleccionado() {
    const pacienteActual = localStorage.getItem('selectedPatientName') || 'Sin selección';
    const pacienteActualBadge = document.getElementById('pacienteActualBadge');
    const pacienteActualLabels = document.querySelectorAll('[data-paciente-actual]');

    if (pacienteActualBadge) {
        pacienteActualBadge.innerHTML = `<i class="bi bi-person-fill text-teal me-1"></i> Paciente Actual: <strong>${pacienteActual}</strong>`;
    }

    pacienteActualLabels.forEach(el => {
        el.textContent = pacienteActual;
    });
}

// ==========================================
// FUNCIÓN PARA REMARCAR EL MENÚ ACTUAL DE VERDE
// ==========================================
function resaltarMenuActivo() {
    let paginaActual = window.location.pathname.split("/").pop();
    
    if (paginaActual === "" || paginaActual === "/") {
        paginaActual = "index.html";
    }

    const enlacesNav = document.querySelectorAll(".navbar-nav .nav-link");

    enlacesNav.forEach(enlace => {
        // Limpiamos estilos activos anteriores
        enlace.classList.remove("active", "activo");
        enlace.parentElement.classList.remove("active-nav", "fw-bold");
        
        const href = enlace.getAttribute("href");
        
        // Si el href del botón coincide con el archivo actual en la barra de direcciones
        if (href === paginaActual) {
            // Añadimos 'activo' (tu clase CSS que da el color verde y borde inferior)
            enlace.classList.add("active", "activo");
            enlace.parentElement.classList.add("active-nav", "fw-bold");
        }
    });
}

// ==========================================
// FUNCIONES DE CONTROL DE ACCESO
// ==========================================
function validarSesionUsuario() {
    const nombreGuardado = localStorage.getItem('nombrePaciente');
    
    if (nombreGuardado) {
        const primerNombre = nombreGuardado.split(' ')[0];
        
        // Inyectamos el nombre en la cabecera dinámica
        const elementoNombreHeader = document.getElementById('nombreUsuarioHeader');
        if (elementoNombreHeader) {
            elementoNombreHeader.textContent = primerNombre;
        }
        
        // Inyectamos el nombre en el saludo grande de la página de inicio
        const saludoPantalla = document.getElementById('nombreUsuarioPantalla');
        if (saludoPantalla) {
            saludoPantalla.textContent = primerNombre;
        }
    } else {
        // Prevención de bucle infinito: Solo redirige si NO estamos ya en el login
        const paginaActual = window.location.pathname.split("/").pop();
        if (paginaActual !== 'login.html') {
            window.location.href = 'login.html';
        }
    }
}

function cerrarSesion() {
    // Limpiamos la memoria del navegador y mandamos al usuario a la puerta de entrada
    localStorage.removeItem('nombrePaciente');
    window.location.href = 'login.html';
}
// ==========================================
// MODO PRUEBA: SIMULACIÓN DE CONEXIÓN
// ==========================================
function iniciarModoPrueba() {
    let contador = 0;
    const intervalos = setInterval(() => {
        contador++;
        
        console.log(`Prueba ${contador}/4: Cambiando estado...`);

        if (contador === 1) {
            // Prueba 1: Todo en línea
            confirmarConexion(); 
        } else if (contador === 2) {
            // Prueba 2: Simulamos desconexión forzada
            const luz = document.getElementById('luz-conexion');
            const txt = document.getElementById('texto-conexion');
            if(luz && txt) {
                luz.style.backgroundColor = '#dc3545';
                luz.style.boxShadow = '0 0 8px #dc3545';
                txt.innerText = 'Dispositivo Seroa: Desconectado';
            }
        } else if (contador === 3) {
            // Prueba 3: Volvemos a línea
            confirmarConexion();
        } else if (contador === 4) {
            // Prueba 4: Desconexión final y terminamos
            const luz = document.getElementById('luz-conexion');
            const txt = document.getElementById('texto-conexion');
            if(luz && txt) {
                luz.style.backgroundColor = '#dc3545';
                luz.style.boxShadow = '0 0 8px #dc3545';
                txt.innerText = 'Dispositivo Seroa: Desconectado';
            }
            clearInterval(intervalos); // Detenemos la prueba
        }
    }, 10000); // 10 segundos entre cada cambio
}

// Disparamos la prueba al cargar la página (solo para ver los cambios)
iniciarModoPrueba();