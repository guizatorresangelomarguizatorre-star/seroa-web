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
    xaxis: { range: 10 } // Muestra los últimos 10 saltos visualmente
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

// 4. EL MOTOR DE TIEMPO REAL CON MEMORIA
// Nos quedamos escuchando el "Pizarrón" de Firebase
database.ref('Seroa/Actual').on('value', (snapshot) => {
    const datos = snapshot.val();
    
    if (datos) {
        // Obtenemos los valores que mandó el ESP32
        const actualSpo2 = datos.spo2;
        const actualBpm = datos.bpm;

        // 1. Actualizamos los números grandotes en el HTML
        document.getElementById('spo2Valor').innerText = actualSpo2;
        document.getElementById('bpmValor').innerText = actualBpm;

        // 2. Generamos la hora exacta
        const ahora = new Date();
        const horaTexto = ahora.getHours() + ':' + (ahora.getMinutes() < 10 ? '0' : '') + ahora.getMinutes() + ':' + (ahora.getSeconds() < 10 ? '0' : '') + ahora.getSeconds();

        // 3. Metemos el dato nuevo al final de las listas
        historialSpo2.push(actualSpo2);
        historialBpm.push(actualBpm);
        categoriasTiempo.push(horaTexto);

        // 4. Si la lista ya tiene más de 15 puntos, borramos el más viejo
        if (historialSpo2.length > LIMITE_PUNTOS) {
            historialSpo2.shift();
            historialBpm.shift();
            categoriasTiempo.shift();
        }

        // 5. ¡EL TRUCO DE LA MEMORIA! Guardamos las listas en el navegador
        localStorage.setItem('seroaHistorialSpo2', JSON.stringify(historialSpo2));
        localStorage.setItem('seroaHistorialBpm', JSON.stringify(historialBpm));
        localStorage.setItem('seroaCategoriasTiempo', JSON.stringify(categoriasTiempo));

        // 6. Refrescamos los dibujos de las gráficas de manera sincronizada
        if (chartSpo2) {
         chartSpo2.updateOptions({
              xaxis: {
                   categories: categoriasTiempo
              }
            });
            chartSpo2.updateSeries([{
              data: historialSpo2
          }]);
        }

        if (chartBpm) {
         chartBpm.updateOptions({
                xaxis: {
                  categories: categoriasTiempo
             }
            });
            chartBpm.updateSeries([{
               data: historialBpm
         }]);
        }
    }
});