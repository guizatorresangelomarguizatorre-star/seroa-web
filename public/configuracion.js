const database = window.database || firebase.database();

async function cargarDispositivos() {
    const userId = localStorage.getItem('userId');
    if (!userId) return;
    const lista = document.getElementById('listaDispositivos');
    try {
        const response = await fetch(`/api/dispositivos?id_usuario=${userId}`);
        const dispositivos = await response.json();
        if (!response.ok) return;
        lista.innerHTML = dispositivos.map(device => `
            <div class="card shadow-sm border-0 mb-3">
                <div class="card-body d-flex justify-content-between align-items-center gap-3 flex-wrap">
                    <div>
                        <h6 class="fw-bold mb-1">ID: ${device.id_dispositivo}</h6>
                        <p class="mb-0 text-muted">SSID: ${device.ssid_wifi}</p>
                        <p class="mb-0 text-muted">Estado de emergencia: ${device.estado_paro_emergencia}</p>
                    </div>
                    <button class="btn btn-outline-teal rounded-pill" onclick="mostrarConfigDispositivo(${device.id_dispositivo}, '${device.ssid_wifi}', '${device.password_wifi}', '${device.estado_paro_emergencia}', '${device.usuario_paro_emergencia || ''}')">Configurar</button>
                </div>
            </div>
        `).join('');
    } catch (error) {
        console.error(error);
    }
}

window.mostrarConfigDispositivo = (id, ssid, password, estado, usuario) => {
    document.getElementById('dispositivoConfigId').value = id;
    document.getElementById('dispositivoConfigSSID').value = ssid;
    document.getElementById('dispositivoConfigPassword').value = password;
    document.getElementById('dispositivoConfigEstado').value = estado;
    document.getElementById('dispositivoConfigUsuario').value = usuario;
};

function mostrarMensajeConfiguracion(texto, tipo = 'success') {
    const alerta = document.getElementById('alertaConfig');
    if (!alerta) return;
    alerta.className = `alert alert-${tipo}`;
    alerta.textContent = texto;
    alerta.classList.remove('d-none');
}

async function guardarDispositivo(event) {
    event.preventDefault();
    const ssid = document.getElementById('nuevoDispositivoSSID').value.trim();
    const password = document.getElementById('nuevoDispositivoPassword').value.trim();
    const userId = localStorage.getItem('userId');
    if (!ssid || !password || !userId) return mostrarMensajeConfiguracion('Completa SSID y contraseña.', 'danger');

    try {
        const response = await fetch('/api/dispositivos', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                ssid_wifi: ssid,
                password_wifi: password,
                estado_paro_emergencia: 'Desactivado',
                usuario_paro_emergencia: localStorage.getItem('nombrePaciente') || null,
                id_usuario: parseInt(userId, 10)
            })
        });
        const data = await response.json();
        if (!response.ok) return mostrarMensajeConfiguracion(data.error || 'No se pudo agregar el dispositivo.', 'danger');
        mostrarMensajeConfiguracion('Dispositivo agregado correctamente.');
        document.getElementById('formAgregarDispositivo').reset();
        cargarDispositivos();
    } catch (error) {
        console.error(error);
        mostrarMensajeConfiguracion('Error al registrar el dispositivo.', 'danger');
    }
}

async function actualizarDispositivo(event) {
    event.preventDefault();
    const id = document.getElementById('dispositivoConfigId').value;
    const ssid = document.getElementById('dispositivoConfigSSID').value.trim();
    const password = document.getElementById('dispositivoConfigPassword').value.trim();
    const estado = document.getElementById('dispositivoConfigEstado').value;
    const usuario = document.getElementById('dispositivoConfigUsuario').value.trim();
    if (!id || !ssid || !password) return mostrarMensajeConfiguracion('Completa la configuración del dispositivo.', 'danger');

    try {
        const response = await fetch(`/api/dispositivos/${id}/configurar`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                ssid_wifi: ssid,
                password_wifi: password,
                estado_paro_emergencia: estado,
                usuario_paro_emergencia: usuario
            })
        });
        const data = await response.json();
        if (!response.ok) return mostrarMensajeConfiguracion(data.error || 'No se pudo actualizar el dispositivo.', 'danger');
        mostrarMensajeConfiguracion('Dispositivo actualizado con éxito.');
        cargarDispositivos();
    } catch (error) {
        console.error(error);
        mostrarMensajeConfiguracion('Error al guardar la configuración.', 'danger');
    }
}

function solicitarPermisoNotificaciones() {
    if (!('Notification' in window)) {
        return mostrarMensajeConfiguracion('Tu navegador no soporta notificaciones.', 'danger');
    }
    Notification.requestPermission().then(permission => {
        if (permission === 'granted') {
            mostrarMensajeConfiguracion('Notificaciones activadas.');
            localStorage.setItem('seroaNotificaciones', 'true');
        } else {
            mostrarMensajeConfiguracion('Notificaciones denegadas.', 'warning');
            localStorage.setItem('seroaNotificaciones', 'false');
        }
    });
}

function cargarPreferenciasNotificaciones() {
    const activo = localStorage.getItem('seroaNotificaciones') === 'true';
    const switchNoti = document.getElementById('toggleNotificaciones');
    if (switchNoti) switchNoti.checked = activo;
}

function notificar(titulo, cuerpo) {
    if (Notification.permission !== 'granted') return;
    if (!navigator.serviceWorker) return;
    navigator.serviceWorker.ready.then(reg => {
        reg.showNotification(titulo, {
            body: cuerpo,
            icon: 'img/icon-192x192.png'
        });
    });
}

function formatDate(value) {
    return new Date(value).toLocaleString('es-MX');
}

function crearFilaAcceso(access, canEdit, esPropio) {
    const permisoOpciones = ['Administrador', 'Doctor', 'Invitado'];
    const rolActual = access.tipo_permiso || 'Invitado';
    const selectDisabled = (!canEdit || esPropio) ? 'disabled' : '';
    const buttonDisabled = (!canEdit || esPropio) ? 'disabled' : '';
    const uid = access.id_acceso;

    return `
        <tr>
            <td>
                <div class="d-flex align-items-center gap-3">
                    <div class="avatar-circle bg-light text-secondary fw-bold" style="width: 42px; height: 42px; line-height: 42px; font-size: 1rem;">
                        ${access.usuario_nombre ? access.usuario_nombre.split(' ').map(part => part.charAt(0).toUpperCase()).slice(0,2).join('') : 'IN'}
                    </div>
                    <div>
                        <div class="fw-bold mb-1">${access.usuario_nombre || 'Invitado'}</div>
                        <small class="text-muted">${access.id_usuario === 0 ? 'Acceso invitado' : esPropio ? 'Tu propio acceso' : `Usuario #${access.id_usuario}`}</small>
                    </div>
                </div>
            </td>
            <td>
                <select class="form-select form-select-sm" data-acceso-id="${uid}" ${selectDisabled}>
                    ${permisoOpciones.map(op => `<option value="${op}" ${op === rolActual ? 'selected' : ''}>${op}</option>`).join('')}
                </select>
            </td>
            <td>${formatDate(access.fecha_asignacion)}</td>
            <td>
                <button class="btn btn-sm btn-danger btn-revocar-acceso" data-acceso-id="${uid}" ${buttonDisabled}>
                    <i class="bi bi-trash3"></i>
                </button>
            </td>
        </tr>
    `;
}

async function cargarAccesos() {
    const pacienteId = localStorage.getItem('selectedPatientId');
    const userId = localStorage.getItem('userId');
    const tabla = document.getElementById('tablaAccesos');
    const badge = document.getElementById('configRoleBadge');
    const infoPaciente = document.getElementById('accesosSeleccionPaciente');
    const role = localStorage.getItem('selectedPatientRole') || 'Invitado';

    if (badge) {
        badge.textContent = `Tu rol: ${role}`;
    }
    if (infoPaciente) {
        infoPaciente.textContent = pacienteId ? `Accesos para el paciente seleccionado: ${localStorage.getItem('selectedPatientName') || 'Sin selección'}` : 'Selecciona un paciente para ver sus accesos.';
    }

    if (!pacienteId) {
        if (tabla) tabla.innerHTML = `<tr><td colspan="4" class="text-center text-muted py-4">No hay paciente seleccionado.</td></tr>`;
        return;
    }

    try {
        const response = await fetch(`/api/accesos?id_paciente=${encodeURIComponent(pacienteId)}`);
        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error || 'No se pudo cargar la lista de accesos.');
        }

        const canEdit = ['Administrador', 'Doctor'].includes(role);
        if (tabla) {
            tabla.innerHTML = data.length > 0 ? data.map(access => {
                const esPropio = access.id_usuario && String(access.id_usuario) === String(userId);
                return crearFilaAcceso(access, canEdit, esPropio);
            }).join('') : `<tr><td colspan="4" class="text-center text-muted py-4">No hay accesos registrados para este paciente.</td></tr>`;
        }

        if (canEdit) {
            document.querySelectorAll('select[data-acceso-id]').forEach(select => {
                select.addEventListener('change', async () => {
                    const idAcceso = select.dataset.accesoId;
                    const nuevoPermiso = select.value;
                    await cambiarPermisoAcceso(idAcceso, nuevoPermiso);
                });
            });
            document.querySelectorAll('button.btn-revocar-acceso').forEach(button => {
                button.addEventListener('click', async () => {
                    const idAcceso = button.dataset.accesoId;
                    await revocarAcceso(idAcceso);
                });
            });
        }
    } catch (error) {
        console.error(error);
        if (tabla) tabla.innerHTML = `<tr><td colspan="4" class="text-center text-danger py-4">${error.message || 'Error al cargar accesos.'}</td></tr>`;
    }
}

async function generarLinkInvitadoConfig() {
    const pacienteId = localStorage.getItem('selectedPatientId');
    const userId = localStorage.getItem('userId');
    const nombrePaciente = localStorage.getItem('selectedPatientName') || 'Sin selección';
    const sharePatientName = document.getElementById('shareConfigPatientName');
    const shareLinkInput = document.getElementById('shareConfigLinkInput');
    const shareQr = document.getElementById('shareConfigQrImage');
    const modal = new bootstrap.Modal(document.getElementById('modalInvitacionConfig'));

    if (!pacienteId || !userId) {
        return alert('Selecciona un paciente y asegúrate de tener sesión iniciada para generar el enlace.');
    }

    try {
        console.log(`[generarLinkInvitadoConfig] Enviando: pacienteId=${pacienteId}, userId=${userId}`);
        
        const response = await fetch('/api/pacientes/compartir', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id_paciente: pacienteId, id_usuario: parseInt(userId, 10) })
        });
        
        const data = await response.json();
        console.log(`[generarLinkInvitadoConfig] Respuesta:`, data, `status: ${response.status}`);
        
        if (!response.ok) {
            throw new Error(data.error || `HTTP ${response.status}`);
        }

        if (!data.id_acceso) {
            throw new Error('No se recibió el ID de acceso del servidor.');
        }

        const url = `${window.location.origin}/invitado.html?acceso=${data.id_acceso}`;
        console.log(`[generarLinkInvitadoConfig] URL generada: ${url}`);
        
        if (sharePatientName) sharePatientName.textContent = nombrePaciente;
        if (shareLinkInput) shareLinkInput.value = url;
        if (shareQr) shareQr.src = `https://api.qrserver.com/v1/create-qr-code/?size=260x260&data=${encodeURIComponent(url)}`;
        modal.show();
    } catch (error) {
        console.error('[generarLinkInvitadoConfig] Error:', error);
        alert(error.message || 'Error generando invitación.');
    }
}

async function cambiarPermisoAcceso(idAcceso, nuevoPermiso) {
    const pacienteId = localStorage.getItem('selectedPatientId');
    const userId = localStorage.getItem('userId');
    if (!pacienteId || !userId) return;

    try {
        const response = await fetch(`/api/accesos/${idAcceso}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id_usuario: parseInt(userId, 10), id_paciente: parseInt(pacienteId, 10), nuevo_permiso: nuevoPermiso })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'No se pudo actualizar el permiso.');
        
        mostrarMensajeConfiguracion(`Permiso actualizado a ${nuevoPermiso}. Sincronizando sistema...`, 'success');
        
        // Recarga automática para aplicar el RBAC
        setTimeout(() => {
            window.location.reload();
        }, 1200);

    } catch (error) {
        console.error(error);
        alert(error.message || 'Error actualizando el permiso.');
    }
}

async function revocarAcceso(idAcceso) {
    const pacienteId = localStorage.getItem('selectedPatientId');
    const userId = localStorage.getItem('userId');
    if (!pacienteId || !userId) return;

    if (!confirm('¿Estás seguro de revocar este acceso permanentemente?')) return;

    try {
        const response = await fetch(`/api/accesos/${idAcceso}?id_usuario=${encodeURIComponent(userId)}&id_paciente=${encodeURIComponent(pacienteId)}`, {
            method: 'DELETE'
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'No se pudo revocar el acceso.');
        
        mostrarMensajeConfiguracion('Acceso revocado correctamente. Sincronizando...', 'warning');
        
        // Recarga automática para expulsar al usuario si estaba conectado
        setTimeout(() => {
            window.location.reload();
        }, 1200);

    } catch (error) {
        console.error(error);
        alert(error.message || 'Error revocando el acceso.');
    }
}

async function cargarPacienteDatos() {
    const patientId = localStorage.getItem('selectedPatientId');
    const nombre = localStorage.getItem('selectedPatientName') || 'Sin selección';
    const rol = localStorage.getItem('selectedPatientRole') || 'Invitado';
    const peso = localStorage.getItem('selectedPatientPeso') || 'N/A';
    const edad = localStorage.getItem('selectedPatientEdad') || 'N/A';
    const sexo = localStorage.getItem('selectedPatientSexo') || 'N/A';
    const padecimiento = localStorage.getItem('selectedPatientPadecimiento') || 'N/A';
    const spo2min = localStorage.getItem('selectedPatientSpo2Min') || 'N/A';
    const spo2max = localStorage.getItem('selectedPatientSpo2Max') || 'N/A';

    const nombreInput = document.getElementById('datosPacienteNombre');
    const rolLabel = document.getElementById('datosPacienteRol');
    const detallePaciente = document.getElementById('datosPacienteDetalles');

    if (nombreInput) nombreInput.value = nombre;
    if (rolLabel) rolLabel.textContent = rol;
    if (detallePaciente) {
        detallePaciente.innerHTML = `
            <p class="mb-1"><strong>Edad:</strong> ${edad}</p>
            <p class="mb-1"><strong>Peso:</strong> ${peso} kg</p>
            <p class="mb-1"><strong>Sexo:</strong> ${sexo}</p>
            <p class="mb-1"><strong>Padecimiento:</strong> ${padecimiento}</p>
            <p class="mb-0"><strong>Rango SpO2:</strong> ${spo2min}% - ${spo2max}%</p>
        `;
    }
}

function bluetoothAgregarDispositivo() {
    if (!navigator.bluetooth) {
        mostrarMensajeConfiguracion('Bluetooth no es compatible en este navegador.', 'danger');
        return;
    }
    navigator.bluetooth.requestDevice({ acceptAllDevices: true, optionalServices: ['battery_service'] })
        .then(device => {
            mostrarMensajeConfiguracion(`Dispositivo detectado: ${device.name || device.id}`);
        })
        .catch(error => {
            console.error(error);
            mostrarMensajeConfiguracion('No se pudo conectar por Bluetooth.', 'danger');
        });
}

function iniciarConfiguracion() {
    document.getElementById('formAgregarDispositivo')?.addEventListener('submit', guardarDispositivo);
    document.getElementById('formConfigDispositivo')?.addEventListener('submit', actualizarDispositivo);
    document.getElementById('btnPermitirNotificaciones')?.addEventListener('click', solicitarPermisoNotificaciones);
    document.getElementById('btnDetectarBluetooth')?.addEventListener('click', bluetoothAgregarDispositivo);
    document.getElementById('btnGenerarInvitacionConfig')?.addEventListener('click', generarLinkInvitadoConfig);
    cargarDispositivos();
    cargarPreferenciasNotificaciones();
    cargarPacienteDatos();
    cargarAccesos();
}

document.addEventListener('DOMContentLoaded', iniciarConfiguracion);
