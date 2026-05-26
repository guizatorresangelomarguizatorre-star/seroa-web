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

function cargarAccesos() {
    const userId = localStorage.getItem('userId');
    if (!userId) return;
    const tabla = document.getElementById('tablaAccesos');
    fetch(`/api/accesos?id_usuario=${userId}`)
        .then(res => res.json())
        .then(data => {
            tabla.innerHTML = data.map(access => `
                <tr>
                    <td>${access.paciente_nombre}</td>
                    <td>${access.tipo_permiso}</td>
                    <td>${new Date(access.fecha_asignacion).toLocaleString('es-MX')}</td>
                    <td>${access.id_acceso > 0 ? `<span class="badge bg-success">Compartido</span>` : '<span class="badge bg-secondary">Privado</span>'}</td>
                </tr>
            `).join('');
        })
        .catch(err => console.error(err));
}

async function cargarPacienteDatos() {
    const patientId = localStorage.getItem('selectedPatientId');
    const nombre = localStorage.getItem('selectedPatientName');
    const rol = localStorage.getItem('selectedPatientRole') || 'Invitado';

    document.getElementById('datosPacienteNombre').value = nombre || '';
    document.getElementById('datosPacienteRol').textContent = rol;
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
    cargarDispositivos();
    cargarPreferenciasNotificaciones();
    cargarAccesos();
    cargarPacienteDatos();
}

document.addEventListener('DOMContentLoaded', iniciarConfiguracion);
