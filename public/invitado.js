const database = window.database || firebase.database();

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
    const spO2 = document.getElementById('spO2Valor');
    const bpm = document.getElementById('bpmValor');
    const valvula = document.getElementById('valvulaValor');
    const evento = document.getElementById('eventoReciente');
    const actualizacion = document.getElementById('actualizacionLabel');

    if (!datos) return;
    
    if (spO2) spO2.textContent = `${datos.spo2 || '--'}%`;
    if (bpm) bpm.textContent = `${datos.bpm || '--'}`;
    
    if (valvula) {
        const estado = datos.valvula_estado === 'Abierta' ? 'Abierta' : 'Cerrada';
        const color = datos.valvula_estado === 'Abierta' ? 'success' : 'secondary';
        valvula.textContent = estado;
        valvula.className = `display-6 fw-bold text-${color}`;
    }
    
    if (evento) {
        evento.textContent = `SpO2: ${datos.spo2}% | Pulso: ${datos.bpm} bpm | ${formatoFecha(datos.timestamp || new Date())}`;
    }
    
    if (actualizacion) {
        actualizacion.textContent = formatoFecha(new Date());
    }
}

function iniciarInvitado() {
    const params = new URLSearchParams(window.location.search);
    const acceso = params.get('acceso');
    const tituloPaciente = document.getElementById('invitadoNombrePaciente');

    if (!acceso) {
        mostrarErrorInvitado('Código de acceso faltante.');
        return;
    }

    fetch(`/api/invitado?acceso=${encodeURIComponent(acceso)}`)
        .then(res => {
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return res.json();
        })
        .then(info => {
            if (!info || info.error) {
                mostrarErrorInvitado(info.error || 'Acceso inválido.');
                return;
            }
            
            // Guardar datos del paciente en localStorage
            localStorage.setItem('selectedPatientId', info.id_paciente);
            localStorage.setItem('selectedPatientName', info.nombre);
            localStorage.setItem('selectedPatientRole', 'Invitado');
            localStorage.setItem('selectedPatientPeso', info.peso_kg || 'N/A');
            localStorage.setItem('selectedPatientEdad', info.edad || 'N/A');
            localStorage.setItem('selectedPatientSexo', info.sexo || 'N/A');
            localStorage.setItem('selectedPatientPadecimiento', info.padecimiento || 'N/A');
            localStorage.setItem('selectedPatientSpo2Min', info.rango_spo2_min || 'N/A');
            localStorage.setItem('selectedPatientSpo2Max', info.rango_spo2_max || 'N/A');
            
            if (tituloPaciente) {
                tituloPaciente.textContent = info.nombre;
            }
            
            // Actualizar badge del paciente compartido
            actualizarBadgePaciente();
            
            // Suscribirse a los datos de Firebase
            window.SeroaRealtime.subscribe((datos) => {
                if (datos) renderLectura(datos);
            });
        })
        .catch(err => {
            console.error('Error en iniciarInvitado:', err);
            mostrarErrorInvitado('No se pudo validar el acceso.');
        });
}

function mostrarErrorInvitado(mensaje) {
    const panelPrincipal = document.querySelector('.card');
    if (panelPrincipal) {
        panelPrincipal.innerHTML = `<div class="card-body py-5"><div class="alert alert-danger mx-auto" style="max-width: 500px;">${mensaje}</div></div>`;
    }
}

document.addEventListener('DOMContentLoaded', iniciarInvitado);
