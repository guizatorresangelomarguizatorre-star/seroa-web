const database = window.database || firebase.database();

// ==========================================
// === SINCRONIZACIÓN BLUETOOTH (ALEXA STYLE)
// ==========================================

// UUIDs únicos generados para el proyecto Seroa
const SEROA_SERVICE_UUID = "4fafc201-1fb5-459e-8fcc-c5c9c331914b";
const SEROA_CHARACTERISTIC_UUID = "beb5483e-36e1-4688-b7f5-ea07361b26a8";

async function iniciarVinculacionBluetooth() {
    const ssid = document.getElementById('wifiSsidInput').value.trim();
    const pass = document.getElementById('wifiPassInput').value.trim();
    const pacienteId = localStorage.getItem('selectedPatientId');
    const msgBox = document.getElementById('btStatusMsg');

    if (!ssid || !pass) {
        msgBox.className = 'alert alert-danger';
        msgBox.textContent = 'Por favor, ingresa el nombre de tu WiFi y la contraseña.';
        msgBox.classList.remove('d-none');
        return;
    }

    if (!pacienteId) {
        msgBox.className = 'alert alert-warning';
        msgBox.textContent = 'Selecciona un paciente en el menú lateral antes de sincronizar.';
        msgBox.classList.remove('d-none');
        return;
    }

    if (!navigator.bluetooth) {
        msgBox.className = 'alert alert-danger';
        msgBox.textContent = 'Tu navegador no soporta Web Bluetooth. Usa Chrome o Edge.';
        msgBox.classList.remove('d-none');
        return;
    }

    try {
        msgBox.className = 'alert alert-info';
        msgBox.textContent = 'Buscando Monitor Seroa... Enciende el dispositivo y acércalo.';
        msgBox.classList.remove('d-none');

        const device = await navigator.bluetooth.requestDevice({
            filters: [{ namePrefix: 'SEROA_ESP32' }],
            optionalServices: [SEROA_SERVICE_UUID]
        });

        msgBox.textContent = `Conectando a ${device.name}...`;

        const server = await device.gatt.connect();
        const service = await server.getPrimaryService(SEROA_SERVICE_UUID);
        const characteristic = await service.getCharacteristic(SEROA_CHARACTERISTIC_UUID);

        // Formato exacto que espera el ESP32
        const payload = `${ssid}|${pass}|${pacienteId}`;
        const encoder = new TextEncoder();
        const dataArray = encoder.encode(payload);

        msgBox.textContent = 'Transfiriendo credenciales...';

        await characteristic.writeValue(dataArray);

        msgBox.textContent = 'Registrando dispositivo en el sistema...';

        const backendRes = await fetch('/api/dispositivos', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                ssid_wifi: ssid,
                password_wifi: pass,
                estado_paro_emergencia: 'Desactivado',
                id_paciente: parseInt(pacienteId, 10)
            })
        });
        const backendData = await backendRes.json();
        if (!backendRes.ok) {
            console.warn('Advertencia al registrar dispositivo en BD:', backendData.error);
        }

        msgBox.className = 'alert alert-success fw-bold';
        msgBox.innerHTML = '<i class="bi bi-check-circle-fill me-2"></i>¡Sincronización Exitosa! El ESP32 se reiniciará para conectarse.';

        cargarDispositivoVinculado();

        setTimeout(() => {
            if (device.gatt.connected) device.gatt.disconnect();
        }, 3000);

    } catch (error) {
        console.error('Error Bluetooth:', error);
        msgBox.className = 'alert alert-danger';
        msgBox.textContent = `Error de conexión: ${error.message}`;
        msgBox.classList.remove('d-none');
    }
}

async function cargarDispositivoVinculado() {
    const pacienteId = localStorage.getItem('selectedPatientId');
    const display = document.getElementById('dispositivoIdDisplay');
    if (!display) return;

    if (!pacienteId) {
        display.innerHTML = '<span class="text-muted fst-italic">Sin paciente seleccionado</span>';
        return;
    }

    try {
        const response = await fetch(`/api/pacientes/${pacienteId}/dispositivo`);
        const data = await response.json();

        if (data.vinculado) {
            display.innerHTML = `<span class="badge px-3 py-2 fs-6 rounded-pill text-white" style="background:linear-gradient(135deg,#3b8b88,#00b4d8);"><i class="bi bi-cpu-fill me-2"></i>Seroa ID: #${data.id_dispositivo}</span>`;
        } else {
            display.innerHTML = `<span class="text-warning fw-semibold"><i class="bi bi-exclamation-circle-fill me-1"></i>Ningún dispositivo vinculado</span><span class="d-block text-muted small mt-1">Usa "Añadir Dispositivo" para vincular tu Seroa ESP32.</span>`;
        }
    } catch (error) {
        display.innerHTML = '<span class="text-muted small">No se pudo verificar el dispositivo.</span>';
    }
}

function suscribirEstadoNube() {
    const pacienteId = localStorage.getItem('selectedPatientId');
    const statusBox = document.getElementById('statusNubeFirebase');
    if(!pacienteId || !statusBox) return;

    database.ref(`Seroa/Pacientes/${pacienteId}/Actual`).on('value', (snapshot) => {
        const datos = snapshot.val();
        
        if (datos) {
            if (datos.estado === 'ACTIVO' || datos.estado === 'SIN_DEDO' || datos.estado === 'CALIBRANDO') {
                statusBox.innerHTML = '<span class="badge bg-success px-3 py-2"><i class="bi bi-cloud-check me-2"></i>En Línea (Conectado)</span>';
            } else if (datos.estado === 'SIN_SENSOR') {
                // AQUÍ ESTÁ LA MAGIA: El ESP32 está en línea, pero avisa que le falta el hardware
                statusBox.innerHTML = '<span class="badge bg-warning text-dark px-3 py-2"><i class="bi bi-exclamation-triangle me-2"></i>En Línea (Sensor Desconectado)</span>';
            } else {
                statusBox.innerHTML = '<span class="badge bg-secondary px-3 py-2"><i class="bi bi-cloud-slash me-2"></i>Sin conexión activa</span>';
            }
        } else {
            statusBox.innerHTML = '<span class="badge bg-secondary px-3 py-2"><i class="bi bi-cloud-slash me-2"></i>Sin conexión activa</span>';
        }
    });
}

// ==========================================
// === FUNCIONES ORIGINALES DEL SISTEMA
// ==========================================

async function cargarDispositivos() {
    const userId = localStorage.getItem('userId');
    if (!userId) return;
    const lista = document.getElementById('listaDispositivos');
    if (!lista) return; 
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
    if(document.getElementById('dispositivoConfigId')) document.getElementById('dispositivoConfigId').value = id;
    if(document.getElementById('dispositivoConfigSSID')) document.getElementById('dispositivoConfigSSID').value = ssid;
    if(document.getElementById('dispositivoConfigPassword')) document.getElementById('dispositivoConfigPassword').value = password;
    if(document.getElementById('dispositivoConfigEstado')) document.getElementById('dispositivoConfigEstado').value = estado;
    if(document.getElementById('dispositivoConfigUsuario')) document.getElementById('dispositivoConfigUsuario').value = usuario;
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
    const ssid = document.getElementById('nuevoDispositivoSSID')?.value.trim();
    const password = document.getElementById('nuevoDispositivoPassword')?.value.trim();
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
        document.getElementById('formAgregarDispositivo')?.reset();
        cargarDispositivos();
    } catch (error) {
        console.error(error);
        mostrarMensajeConfiguracion('Error al registrar el dispositivo.', 'danger');
    }
}

async function actualizarDispositivo(event) {
    event.preventDefault();
    const id = document.getElementById('dispositivoConfigId')?.value;
    const ssid = document.getElementById('dispositivoConfigSSID')?.value.trim();
    const password = document.getElementById('dispositivoConfigPassword')?.value.trim();
    const estado = document.getElementById('dispositivoConfigEstado')?.value;
    const usuario = document.getElementById('dispositivoConfigUsuario')?.value.trim();
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
    // Master y los 6 tipos — default: todos activados
    const claves = ['master', 'spo2_peligro', 'spo2_precaucion', 'bpm_peligro', 'bpm_precaucion', 'tanque_mitad', 'tanque_critico'];
    claves.forEach(key => {
        const val = localStorage.getItem('seroaNotif_' + key);
        const el  = document.querySelector(`.notif-toggle[data-key="${key}"]`);
        if (el) el.checked = val === null ? true : val === 'true';
    });
}

function iniciarEventosNotificaciones() {
    document.querySelectorAll('.notif-toggle').forEach(toggle => {
        toggle.addEventListener('change', () => {
            const key = toggle.dataset.key;
            if (!key) return;
            localStorage.setItem('seroaNotif_' + key, toggle.checked ? 'true' : 'false');
            if (window.SeroaNotif) window.SeroaNotif.setPreferencia(key, toggle.checked);
        });
    });
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
    const modalEl = document.getElementById('modalInvitacionConfig');
    if(!modalEl) return;
    const modal = new bootstrap.Modal(modalEl);

    if (!pacienteId || !userId) {
        return alert('Selecciona un paciente y asegúrate de tener sesión iniciada para generar el enlace.');
    }

    try {
        const response = await fetch('/api/pacientes/compartir', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id_paciente: pacienteId, id_usuario: parseInt(userId, 10) })
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || `HTTP ${response.status}`);
        }

        if (!data.id_acceso) {
            throw new Error('No se recibió el ID de acceso del servidor.');
        }

        const url = `${window.location.origin}/invitado.html?acceso=${data.id_acceso}`;
        
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
        setTimeout(() => { window.location.reload(); }, 1200);

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
        setTimeout(() => { window.location.reload(); }, 1200);

    } catch (error) {
        console.error(error);
        alert(error.message || 'Error revocando el acceso.');
    }
}

async function cargarPacienteDatos() {
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

function iniciarConfiguracion() {
    document.getElementById('formAgregarDispositivo')?.addEventListener('submit', guardarDispositivo);
    document.getElementById('formConfigDispositivo')?.addEventListener('submit', actualizarDispositivo);
    document.getElementById('btnPermitirNotificaciones')?.addEventListener('click', solicitarPermisoNotificaciones);
    document.getElementById('btnGenerarInvitacionConfig')?.addEventListener('click', generarLinkInvitadoConfig);
    document.getElementById('btnVincularBluetooth')?.addEventListener('click', iniciarVinculacionBluetooth);
    
    cargarDispositivoVinculado();
    cargarDispositivos();
    cargarPreferenciasNotificaciones();
    iniciarEventosNotificaciones();
    cargarPacienteDatos();
    cargarAccesos();
    suscribirEstadoNube();
}

document.addEventListener('DOMContentLoaded', iniciarConfiguracion);