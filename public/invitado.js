const firebaseConfig = {
    apiKey: "AIzaSyD8GcNrjousLrlNSKXcNrjl0gjAYuXvTMQ",
    authDomain: "seroa-e8606.firebaseapp.com",
    databaseURL: "https://seroa-e8606-default-rtdb.firebaseio.com",
    projectId: "seroa-e8606",
    storageBucket: "seroa-e8606.firebasestorage.app",
    messagingSenderId: "985506819702",
    appId: "1:985506819702:web:407215da36321f9084b957"
};

firebase.initializeApp(firebaseConfig);
const database = firebase.database();

function formatoFecha(fecha) {
    const dt = new Date(fecha);
    return dt.toLocaleString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function clasificarLectura(spo2, bpm) {
    if (spo2 < 85 || bpm < 50 || bpm > 140) return { nivel: 'Peligro', color: 'danger' };
    if ((spo2 >= 85 && spo2 <= 89) || (bpm >= 50 && bpm <= 59) || (bpm >= 101 && bpm <= 140)) return { nivel: 'Precaución', color: 'warning' };
    return { nivel: 'Normal', color: 'success' };
}

function renderLectura(datos) {
    const spO2 = document.getElementById('invitadoSpo2');
    const bpm = document.getElementById('invitadoBpm');
    const estado = document.getElementById('invitadoEstado');
    const fecha = document.getElementById('invitadoFecha');

    if (!datos || !spO2 || !bpm || !estado || !fecha) return;
    spO2.textContent = `${datos.spo2 || '--'}%`;
    bpm.textContent = `${datos.bpm || '--'} bpm`;
    const clase = clasificarLectura(datos.spo2 || 0, datos.bpm || 0);
    estado.textContent = clase.nivel;
    estado.className = `badge rounded-pill bg-${clase.color}`;
    fecha.textContent = formatoFecha(new Date());
}

function iniciarInvitado() {
    const params = new URLSearchParams(window.location.search);
    const acceso = params.get('acceso');
    const tituloPaciente = document.getElementById('invitadoNombrePaciente');

    if (!acceso) {
        document.body.innerHTML = '<div class="container py-5"><div class="alert alert-danger">Código de acceso faltante.</div></div>';
        return;
    }

    fetch(`/api/invitado?acceso=${encodeURIComponent(acceso)}`)
        .then(res => res.json())
        .then(info => {
            if (!info || info.error) {
                document.body.innerHTML = `<div class="container py-5"><div class="alert alert-danger">${info.error || 'Acceso inválido.'}</div></div>`;
                return;
            }
            tituloPaciente.textContent = info.nombre;
            const path = `Seroa/Actual`;
            database.ref(path).on('value', snapshot => {
                renderLectura(snapshot.val());
            });
        })
        .catch(err => {
            console.error(err);
            document.body.innerHTML = '<div class="container py-5"><div class="alert alert-danger">No se pudo validar el acceso.</div></div>';
        });
}

document.addEventListener('DOMContentLoaded', iniciarInvitado);
