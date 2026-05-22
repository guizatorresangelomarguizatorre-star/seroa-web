// 1. CONFIGURACIÓN DE FIREBASE
const firebaseConfig = {
    apiKey: "AIzaSyD8GcNrjousLrlNSKXcNrjl0gjAYuXvTMQ",
    authDomain: "seroa-e8606.firebaseapp.com",
    // OJO: Para la página web SÍ se necesita poner https:// (es distinto al código del ESP32)
    databaseURL: "https://seroa-e8606-default-rtdb.firebaseio.com",
    projectId: "seroa-e8606",
    storageBucket: "seroa-e8606.firebasestorage.app",
    messagingSenderId: "985506819702",
    appId: "1:985506819702:web:407215da36321f9084b957"
};

// Inicializamos Firebase
firebase.initializeApp(firebaseConfig);
const database = firebase.database();

// 2. RECUPERAR LA MEMORIA (Buscamos si hay datos guardados de antes)
let historialSpo2 = JSON.parse(localStorage.getItem('seroaHistorialSpo2')) || [];
let historialBpm = JSON.parse(localStorage.getItem('seroaHistorialBpm')) || [];
let categoriasTiempo = JSON.parse(localStorage.getItem('seroaCategoriasTiempo')) || [];

// Límite de puntos en la gráfica para que no se apelmace y se vea limpia
const LIMITE_PUNTOS = 15;

// 3. CONFIGURACIÓN DE LAS GRÁFICAS
const commonOptions = {
    chart: { type: 'area', height: 250, toolbar: { show: false }, foreColor: '#555', animations: { enabled: true, easing: 'linear', dynamicAnimation: { speed: 500 } } },
    fill: { type: 'gradient', gradient: { shadeIntensity: 1, opacityFrom: 0.4, opacityTo: 0.05, stops: [0, 90, 100] } },
    dataLabels: { enabled: false },
    grid: { borderColor: '#e0e0e0', strokeDashArray: 4 }, 
    xaxis: { 
        type: 'datetime',
        labels: { show: false }, // Mantiene el eje inferior limpio
        axisBorder: { show: false },
        axisTicks: { show: false }
    },
    tooltip: {
        x: {
            // EL FIX: Formateamos la hora directamente con JavaScript nativo
            formatter: function(val) {
                if (!val) return "";
                const fecha = new Date(val);
                // Extraemos la hora exacta en formato 24h
                const horas = fecha.getHours().toString().padStart(2, '0');
                const minutos = fecha.getMinutes().toString().padStart(2, '0');
                const segundos = fecha.getSeconds().toString().padStart(2, '0');
                return `${horas}:${minutos}:${segundos}`;
            }
        }
    }
};
// 4. EL MOTOR DE TIEMPO REAL
database.ref('Seroa/Actual').on('value', (snapshot) => {
    const datos = snapshot.val();
    
    if (datos) {
        const cartelEstado = document.getElementById('estadoSensorOverlay');
        const textoEstado = document.getElementById('textoEstadoSensor');
        
        // Leemos el canal independiente de mensajes
        const estadoSensor = datos.estado; 

        // === CONTROL DE MENSAJES SUPERIORES ===
        if (estadoSensor === "SIN_DEDO") {
            cartelEstado.style.display = 'block';
            textoEstado.innerText = "Por favor, coloca tu dispositivo Seroa en tu dedo para comenzar el monitoreo.";
            return; // No avanzamos la gráfica
            
        } else if (estadoSensor === "CALIBRANDO") {
            cartelEstado.style.display = 'block';
            textoEstado.innerText = "Calibrando señal... Mantén el dedo inmóvil unos segundos.";
            return; // No avanzamos la gráfica
            
        } else if (estadoSensor === "ACTIVO") {
            // Ocultamos el mensaje de arriba
            cartelEstado.style.display = 'none';

            // AQUÍ GRAFICAMOS NORMALMENTE (Sin alterar tu lógica)
            const actualSpo2 = datos.spo2;
            const actualBpm = datos.bpm;

            document.getElementById('spo2Valor').innerText = actualSpo2;
            document.getElementById('bpmValor').innerText = actualBpm;

            const ahora = new Date().getTime(); 

            historialSpo2.push({ x: ahora, y: actualSpo2 });
            historialBpm.push({ x: ahora, y: actualBpm });

            if (historialSpo2.length > LIMITE_PUNTOS) {
                historialSpo2.shift();
                historialBpm.shift();
            }

            localStorage.setItem('seroaHistorialSpo2', JSON.stringify(historialSpo2));
            localStorage.setItem('seroaHistorialBpm', JSON.stringify(historialBpm));

            if(chartSpo2) chartSpo2.updateSeries([{ data: historialSpo2 }]);
            if(chartBpm) chartBpm.updateSeries([{ data: historialBpm }]);
            
            const alerta = document.getElementById('alertaGlobalSeroa');
            if (actualSpo2 < 90 && alerta) alerta.classList.remove('d-none');
        }
    }
});