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