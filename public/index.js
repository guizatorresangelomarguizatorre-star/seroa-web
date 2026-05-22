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
    xaxis: { type: 'datetime' } // <-- CLAVE: Asegúrate de que esto diga 'datetime'
};

let chartSpo2, chartBpm;

if(document.querySelector("#spo2Chart")) {
    const spo2Options = { ...commonOptions, colors: ['#66bb6a'], stroke: { curve: 'smooth', width: 3 }, series: [{ name: "SpO2", data: historialSpo2 }], yaxis: { min: 80, max: 100 } };
    chartSpo2 = new ApexCharts(document.querySelector("#spo2Chart"), spo2Options);
    chartSpo2.render();
}

if(document.querySelector("#bpmChart")) {
    const bpmOptions = { ...commonOptions, colors: ['#3b8b88'], stroke: { curve: 'smooth', width: 3 }, series: [{ name: "BPM", data: historialBpm }], yaxis: { min: 40, max: 150 } };
    chartBpm = new ApexCharts(document.querySelector("#bpmChart"), bpmOptions);
    chartBpm.render();
}

// === PARCHE DE SEGURIDAD: Limpiamos la memoria si tiene el formato viejo ===
if (historialSpo2.length > 0 && typeof historialSpo2[0] !== 'object') {
    historialSpo2 = [];
    historialBpm = [];
    localStorage.removeItem('seroaHistorialSpo2');
    localStorage.removeItem('seroaHistorialBpm');
}

// 4. EL MOTOR DE TIEMPO REAL CON MEMORIA INTELIGENTE
database.ref('Seroa/Actual').on('value', (snapshot) => {
    const datos = snapshot.val();
    
    if (datos) {
        const actualSpo2 = datos.spo2;
        const actualBpm = datos.bpm;
        
        const cartelEstado = document.getElementById('estadoSensorOverlay');
        const textoEstado = document.getElementById('textoEstadoSensor');
        const valorSpo2 = document.getElementById('spo2Valor');
        const valorBpm = document.getElementById('bpmValor');

        // === 1. MODO "SIN DEDO" ===
        if (actualSpo2 === 0 || actualBpm === 0) {
            cartelEstado.style.display = 'block';
            textoEstado.innerText = "Por favor, coloca tu dispositivo Seroa en tu dedo para comenzar el monitoreo.";
            valorSpo2.innerText = "--";
            valorBpm.innerText = "--";
            
            // Vaciamos la gráfica visualmente para que empiece limpia al poner el dedo de nuevo
            historialSpo2 = [];
            historialBpm = [];
            if(chartSpo2) chartSpo2.updateSeries([{ data: [] }]);
            if(chartBpm) chartBpm.updateSeries([{ data: [] }]);
            return; 
        } 
        
        // === 2. MODO "RUIDO / CALIBRANDO" ===
        if (actualSpo2 < 80 || actualBpm > 130) {
            cartelEstado.style.display = 'block';
            
            // Si la pantalla dice "--" o "Calculando", significa que RECIÉN puso el dedo
            if (valorSpo2.innerText === "--" || valorSpo2.innerText === "Calculando...") {
                textoEstado.innerText = "Calibrando señal... Mantén el dedo inmóvil unos segundos.";
                valorSpo2.innerText = "Calculando...";
                valorBpm.innerText = "Calculando...";
            } else {
                // Si ya había un dato válido, NO borramos los números para que puedas leerlos
                // Solo cambiamos el mensaje de aviso
                textoEstado.innerText = "Interferencia detectada. Mantén el dedo inmóvil...";
            }
            return; // No graficamos este "ruido" para no arruinar la curva
        }

        // === 3. MODO "MONITOREO ACTIVO" ===
        // Si la señal es buena, quitamos carteles y actualizamos números y gráficas
        cartelEstado.style.display = 'none';

        valorSpo2.innerText = actualSpo2;
        valorBpm.innerText = actualBpm;

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
});