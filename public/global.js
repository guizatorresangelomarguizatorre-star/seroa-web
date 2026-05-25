// ... (mantiene todo tu código anterior de reloj, alertas, etc.)

// ==========================================
// MONITOR DE CONEXIÓN GLOBAL (Watchdog Timer)
// ==========================================
let temporizadorDesconexion;

function iniciarMonitorConexion() {
    // Buscamos los elementos en la página actual
    const luzConexion = document.getElementById('luz-conexion');
    const textoConexion = document.getElementById('texto-conexion');

    if (!luzConexion || !textoConexion) return; // Si no existen en esta página, no hacemos nada

    // Si recibimos un pulso (debes llamar a esta función desde tus otros JS cuando recibas datos de Firebase)
    // O mejor aún, la llamamos automáticamente al recibir datos
}

// Función que llamarás desde tus archivos específicos (index.js, etc.) cada vez que Firebase reciba datos
function confirmarConexion() {
    const luzConexion = document.getElementById('luz-conexion');
    const textoConexion = document.getElementById('texto-conexion');
    
    if (luzConexion && textoConexion) {
        // Encendemos Luz Verde
        luzConexion.style.backgroundColor = '#28a745';
        luzConexion.style.boxShadow = '0 0 8px #28a745';
        textoConexion.innerText = 'Dispositivo Seroa: En Línea';
    }

    // Reseteamos el temporizador de 10 segundos
    clearTimeout(temporizadorDesconexion);
    temporizadorDesconexion = setTimeout(() => {
        // Si pasan 10s sin llamar a esta función, cambiamos a Rojo
        luzConexion.style.backgroundColor = '#dc3545';
        luzConexion.style.boxShadow = '0 0 8px #dc3545';
        textoConexion.innerText = 'Dispositivo Seroa: Desconectado';
    }, 10000);
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