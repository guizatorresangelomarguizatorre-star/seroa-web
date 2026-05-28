let captchaCorrectAnswer;
let verificacionInterval; // Variable para controlar el reloj que pregunta a la BD

// Capturar código de acceso (invitación) desde URL o localStorage
function captureAccessCode() {
    const params = new URLSearchParams(window.location.search);
    const urlAcceso = params.get('acceso');
    if (urlAcceso) {
        localStorage.setItem('pendingAccessId', urlAcceso);
        return urlAcceso;
    }
    return localStorage.getItem('pendingAccessId') || null;
}

async function procesarAccesoPendiente(userId, userName) {
    const accessId = localStorage.getItem('pendingAccessId');
    if (!accessId || !userId) return false;

    try {
        const response = await fetch(`/api/invitado?acceso=${encodeURIComponent(accessId)}&userId=${encodeURIComponent(userId)}&userName=${encodeURIComponent(userName || '')}`);
        const data = await response.json();
        if (!response.ok || data.error) {
            console.warn('procesarAccesoPendiente falló:', data.error || response.status);
            return false;
        }

        localStorage.setItem('selectedPatientId', data.id_paciente);
        localStorage.setItem('selectedPatientName', data.nombre);
        localStorage.setItem('selectedPatientRole', 'Invitado');
        localStorage.setItem('selectedPatientPeso', data.peso_kg || 'N/A');
        localStorage.setItem('selectedPatientEdad', data.edad || 'N/A');
        localStorage.setItem('selectedPatientSexo', data.sexo || 'N/A');
        localStorage.setItem('selectedPatientPadecimiento', data.padecimiento || 'N/A');
        localStorage.setItem('selectedPatientSpo2Min', data.rango_spo2_min || 'N/A');
        localStorage.setItem('selectedPatientSpo2Max', data.rango_spo2_max || 'N/A');
        localStorage.setItem('pacienteActivoSeroa', data.nombre);
        localStorage.removeItem('pendingAccessId');
        return true;
    } catch (error) {
        console.error('Error procesando acceso pendiente:', error);
        return false;
    }
}

function generateCaptcha() {
    const n1 = Math.floor(Math.random() * 10) + 1;
    const n2 = Math.floor(Math.random() * 10) + 1;
    captchaCorrectAnswer = n1 + n2;
    document.getElementById('captchaQuestion').innerText = `Seguridad: ${n1} + ${n2} =`;
    document.getElementById('captchaAnswer').value = '';
}

function toggleForm(type) {
    // Si el usuario se desespera y cambia de pantalla, detenemos el reloj del servidor
    if (verificacionInterval) clearInterval(verificacionInterval);

    // Ocultamos las 3 secciones por defecto
    document.getElementById('login-section').style.display = 'none';
    document.getElementById('register-section').style.display = 'none';
    const waitingSection = document.getElementById('waiting-section');
    if (waitingSection) waitingSection.style.display = 'none';

    // Mostramos solo la que necesitamos
    if (type === 'register') {
        document.getElementById('register-section').style.display = 'block';
        generateCaptcha();
    } else {
        document.getElementById('login-section').style.display = 'block';
    }
}

// === LÓGICA DE REGISTRO ===
document.getElementById('registerForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const pass = document.getElementById('regPass').value;
    const emailIngresado = document.getElementById('regEmail').value;
    
    // Llamamos a la función modular que vive en utils.js
    const errorPass = validarPasswordSeguro(pass);
    
    if (parseInt(document.getElementById('captchaAnswer').value) !== captchaCorrectAnswer) {
        alert("Captcha incorrecto. Intenta de nuevo.");
        generateCaptcha();
        return;
    }
    
    if (errorPass) {
        alert(errorPass);
        return;
    }

    const data = {
        nombre: document.getElementById('regNombre').value,
        email: emailIngresado,
        password: pass
    };

    // Adjuntar código de acceso (invitación) si existe
    const accessId = captureAccessCode();
    if (accessId) {
        data.id_acceso = accessId;
    }

    try {
        const res = await fetch('/api/registro', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(data)
        });
        const result = await res.json();
        
        if (res.ok) {
            // ¡EL CAMBIO CRÍTICO! Ocultamos el registro y mostramos la pantalla de espera
            document.getElementById('register-section').style.display = 'none';
            document.getElementById('waiting-section').style.display = 'block';
            document.getElementById('registerForm').reset();
            
            // Limpiar el código de acceso pendiente ya que fue procesado
            localStorage.removeItem('pendingAccessId');
            
            // Arrancamos el monitoreo silencioso
            iniciarMonitoreoVerificacion(emailIngresado);
        } else {
            alert("Error: " + result.error);
        }
    } catch (error) {
        alert("Error de conexión con el servidor.");
    }
});

// === EL MOTOR DE SONDEO (NUEVO) ===
function iniciarMonitoreoVerificacion(email) {
    if (verificacionInterval) clearInterval(verificacionInterval);

    // Le preguntamos a la base de datos cada 3 segundos (3000 ms)
    verificacionInterval = setInterval(async () => {
        try {
            const response = await fetch(`/api/status-verificacion?email=${encodeURIComponent(email)}`);
            
            if (response.ok) {
                const data = await response.json();
                
                // Si la BD nos dice que el usuario ya le dio clic al correo...
                if (data.verificado) {
                    clearInterval(verificacionInterval); // Apagamos el reloj
                    
                    alert("¡Excelente! Tu correo electrónico ha sido confirmado. Iniciando sesión automáticamente...");
                    
                    // Iniciamos su sesión automáticamente
                    localStorage.setItem('nombrePaciente', data.nombre);
                    localStorage.setItem('userId', data.id);
                    
                    // Si había una invitación pendiente, la procesamos en silencio antes de redirigir
                    const accessId = localStorage.getItem('pendingAccessId');
                    if (accessId) {
                        const success = await procesarAccesoPendiente(data.id, data.nombre);
                        if (success) {
                            window.location.href = 'pacientes.html';
                            return;
                        }
                    }
                    window.location.href = 'index.html';
                }
            }
        } catch (err) {
            console.error("Error consultando el estado de verificación:", err);
        }
    }, 3000);
}

// === LÓGICA DE LOGIN ===
document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault(); // Evita que la página recargue al instante

    // Capturamos los datos de tus inputs (usando los IDs de tu HTML)
    const email = document.getElementById('loginUser').value;
    const password = document.getElementById('loginPass').value;
    const loginBody = { email, password };

    // Adjuntar código de acceso (invitación) si existe
    const accessId = captureAccessCode();
    if (accessId) {
        loginBody.id_acceso = accessId;
    }

    try {
        // Hacemos la llamada a nuestro servidor
        const response = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(loginBody)
        });

        const data = await response.json();

        // Si el servidor nos dice que las credenciales son correctas...
        if (response.ok) {
            
            // Guardamos los datos de sesión para el usuario actual
            localStorage.setItem('nombrePaciente', data.nombre);
            localStorage.setItem('userId', data.id);
            
            // Si hay un acceso pendiente, procesarlo y guardar el paciente compartido
            const pending = localStorage.getItem('pendingAccessId');
            if (pending) {
                const success = await procesarAccesoPendiente(data.id, data.nombre);
                if (success) {
                    window.location.href = 'pacientes.html';
                    return;
                }
            }

            // Limpiar el código de acceso pendiente ya que fue procesado
            localStorage.removeItem('pendingAccessId');
            
            // Movemos al usuario al Dashboard
            window.location.href = 'index.html'; 
            
        } else {
            // Si el servidor rechaza la entrada (contraseña incorrecta o no verificado), mostramos el error
            alert(data.error);
        }
        
    } catch (error) {
        console.error("Error de red:", error);
        alert("Ocurrió un error al intentar conectar con el servidor Seroa.");
    }
});

// Inicializar la primera vez
generateCaptcha();
// Capturar código de acceso desde URL al cargar la página
window.addEventListener('DOMContentLoaded', () => {
    captureAccessCode();
});