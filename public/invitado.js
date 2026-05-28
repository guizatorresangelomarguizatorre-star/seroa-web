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

    // Guardar el código de invitación pendiente para poder procesarlo incluso si redirigimos a login
    localStorage.setItem('pendingAccessId', acceso);

    // Si el visitante está autenticado en esta sesión, enviar userId y nombre para permitir el vínculo de acceso
    const userId = localStorage.getItem('userId');
    const userName = localStorage.getItem('nombrePaciente');
    const userParam = userId ? `&userId=${encodeURIComponent(userId)}${userName ? `&userName=${encodeURIComponent(userName)}` : ''}` : '';
    fetch(`/api/invitado?acceso=${encodeURIComponent(acceso)}${userParam}`)
        .then(res => res.json().then(data => ({ status: res.status, ok: res.ok, data })))
        .then(({ status, ok, data }) => {
            if (!ok) {
                console.error(`Error ${status}:`, data);
                mostrarErrorInvitado(data.error || `Error HTTP ${status}`);
                return;
            }
            
            if (!data || data.error) {
                mostrarErrorInvitado(data.error || 'Acceso inválido.');
                return;
            }
            
            // Si el servidor indica que el acceso fue elevado, pedir login al usuario
            if (data.requireLogin) {
                try {
                    alert(data.message || 'Acceso elevado: por favor inicia sesión.');
                } catch (e) {
                    console.warn('No se pudo mostrar alerta amigable:', e);
                }
                window.location.href = `login.html?acceso=${encodeURIComponent(acceso)}`;
                return;
            }

            // Guardar datos del paciente en localStorage
            localStorage.setItem('selectedPatientId', data.id_paciente);
            localStorage.setItem('selectedPatientName', data.nombre);
            localStorage.setItem('selectedPatientRole', data.tipo_permiso || 'Invitado');
            localStorage.setItem('selectedPatientPeso', data.peso_kg || 'N/A');
            localStorage.setItem('selectedPatientEdad', data.edad || 'N/A');
            localStorage.setItem('selectedPatientSexo', data.sexo || 'N/A');
            localStorage.setItem('selectedPatientPadecimiento', data.padecimiento || 'N/A');
            localStorage.setItem('selectedPatientSpo2Min', data.rango_spo2_min || 'N/A');
            localStorage.setItem('selectedPatientSpo2Max', data.rango_spo2_max || 'N/A');
            localStorage.setItem('selectedPatientRole', data.tipo_permiso || 'Invitado');
            
            if (tituloPaciente) {
                tituloPaciente.textContent = data.nombre;
            }
            
            // Actualizar badge del paciente compartido
            if (typeof actualizarBadgePaciente === 'function') actualizarBadgePaciente();
            
            // Si el usuario tiene sesión, enviarlo a la pestaña de pacientes para que su lista se refresque.
            if (userId) {
                localStorage.removeItem('pendingAccessId');
                window.location.href = 'pacientes.html';
                return;
            }

            // Suscribirse únicamente a la ruta privada del paciente en Firebase
            try {
                const idPaciente = data.id_paciente;
                if (idPaciente) {
                    const ref = database.ref(`Seroa/Pacientes/${idPaciente}/Actual`);
                    ref.on('value', snapshot => {
                        try {
                            const datos = snapshot.val() || null;
                            if (datos) renderLectura(datos);
                        } catch (e) {
                            console.error('Error procesando snapshot invitado:', e);
                        }
                    });
                }
            } catch (susErr) {
                console.error('Error suscribiendo a Firebase en invitado:', susErr);
            }
        })
        .catch(err => {
            console.error('Error en iniciarInvitado:', err);
            mostrarErrorInvitado('No se pudo conectar con el servidor.');
        });
}

function mostrarErrorInvitado(mensaje) {
    const panelPrincipal = document.querySelector('.card');
    if (panelPrincipal) {
        panelPrincipal.innerHTML = `<div class="card-body py-5"><div class="alert alert-danger mx-auto" style="max-width: 500px;">${mensaje}</div></div>`;
    }
}

document.addEventListener('DOMContentLoaded', iniciarInvitado);
