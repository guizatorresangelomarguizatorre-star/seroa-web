// ==========================================
// 1. RELOJ UNIVERSAL MULTI-PANTALLA
// ==========================================
function actualizarReloj() {
    const ahora = new Date();
    const opciones = { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' };
    const textoFecha = ahora.toLocaleDateString('es-MX', opciones);
    const idsReloj = ["fecha", "fecha-dosificacion", "fecha-registro", "fecha-tanque", "fecha-config"];
    
    idsReloj.forEach(id => {
        const elemento = document.getElementById(id);
        if (elemento) elemento.innerText = textoFecha;
    });
}
setInterval(actualizarReloj, 60000);

// ==========================================
// 2. MONITOR DE CONEXIÓN GLOBAL
// ==========================================
let temporizadorDesconexion;

function confirmarConexion() {
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
}

// ==========================================
// 3. MODO PRUEBA (MANTENIDO IGUAL)
// ==========================================
function iniciarModoPrueba() {
    let contador = 0;
    const intervalos = setInterval(() => {
        contador++;
        console.log(`Prueba ${contador}/4: Cambiando estado...`);

        if (contador === 1) confirmarConexion(); // Prueba 1: En línea
        else if (contador === 2) { // Prueba 2: Desconectado
            const luz = document.getElementById('luz-conexion');
            const txt = document.getElementById('texto-conexion');
            if(luz && txt) {
                luz.style.backgroundColor = '#dc3545';
                luz.style.boxShadow = '0 0 8px #dc3545';
                txt.innerText = 'Dispositivo Seroa: Desconectado';
            }
        } else if (contador === 3) confirmarConexion(); // Prueba 3: En línea
        else if (contador === 4) { // Prueba 4: Desconexión final
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
// 4. INICIALIZACIÓN GLOBAL
// ==========================================
document.addEventListener("DOMContentLoaded", async () => {
    // Estado inicial en rojo al cargar
    const luz = document.getElementById('luz-conexion');
    const txt = document.getElementById('texto-conexion');
    if(luz && txt) {
        luz.style.backgroundColor = '#dc3545';
        txt.innerText = 'Dispositivo Seroa: Desconectado';
    }

    // Carga de componentes (Header/Menú)
    const contenedorHeader = document.getElementById('header-container');
    if (contenedorHeader) {
        const response = await fetch('header.html');
        if (response.ok) contenedorHeader.innerHTML = await response.text();
    }

    const contenedorMenu = document.getElementById('menu-container');
    if (contenedorMenu) {
        const responseMenu = await fetch('menu.html');
        if (responseMenu.ok) {
            contenedorMenu.innerHTML = await responseMenu.text();
            resaltarMenuActivo();
        }
    }

    actualizarReloj();
    validarSesionUsuario();
    iniciarModoPrueba(); // Mantenemos la prueba activa
});

// ... (restos de tus funciones resaltarMenuActivo, validarSesionUsuario, cerrarSesion)