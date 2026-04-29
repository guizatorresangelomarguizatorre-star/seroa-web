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
actualizarReloj();

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
// NAVEGACIÓN INTELIGENTE (Resalta el menú actual)
// ==========================================
document.addEventListener("DOMContentLoaded", () => {
  // 1. Obtenemos el nombre del archivo actual en la barra del navegador
  let paginaActual = window.location.pathname.split("/").pop();
  
  // Si la ruta está vacía (ej. localhost/seroa/), asumimos que es el index
  if (paginaActual === "" || paginaActual === "/") {
      paginaActual = "index.html";
  }

  // 2. Buscamos todos los enlaces dentro de tu menú
  const enlacesNav = document.querySelectorAll(".navbar-nav .nav-link");

  enlacesNav.forEach(enlace => {
    // Primero, limpiamos el estado activo por precaución
    enlace.parentElement.classList.remove("active-nav", "fw-bold");

    // 3. Comparamos si el href coincide con la página actual
    const href = enlace.getAttribute("href");
    if (href === paginaActual) {
      // Si coincide, aplicamos tus clases de resaltado al <li>
      enlace.parentElement.classList.add("active-nav", "fw-bold");
    }
  });
});