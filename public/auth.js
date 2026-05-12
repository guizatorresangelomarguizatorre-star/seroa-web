let captchaCorrectAnswer;

function generateCaptcha() {
    const n1 = Math.floor(Math.random() * 10) + 1;
    const n2 = Math.floor(Math.random() * 10) + 1;
    captchaCorrectAnswer = n1 + n2;
    document.getElementById('captchaQuestion').innerText = `Seguridad: ${n1} + ${n2} =`;
    document.getElementById('captchaAnswer').value = '';
}

function toggleForm(type) {
    if (type === 'register') {
        document.getElementById('login-section').style.display = 'none';
        document.getElementById('register-section').style.display = 'block';
        generateCaptcha();
    } else {
        document.getElementById('register-section').style.display = 'none';
        document.getElementById('login-section').style.display = 'block';
    }
}

document.getElementById('registerForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const pass = document.getElementById('regPass').value;
    
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
        email: document.getElementById('regEmail').value,
        password: pass
    };

    try {
        const res = await fetch('/api/registro', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(data)
        });
        const result = await res.json();
        
        if (res.ok) {
            alert(result.mensaje);
            document.getElementById('registerForm').reset();
            toggleForm('login');
        } else {
            alert("Error: " + result.error);
        }
    } catch (error) {
        alert("Error de conexión con el servidor.");
    }
});
document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault(); // Evita que la página recargue al instante

    // Capturamos los datos de tus inputs (usando los IDs de tu HTML)
    const email = document.getElementById('loginUser').value;
    const password = document.getElementById('loginPass').value;

    try {
        // Hacemos la llamada a nuestro servidor
        const response = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });

        const data = await response.json();

        // Si el servidor nos dice que las credenciales son correctas...
        if (response.ok) {
            
            // 1. Opcional pero recomendado: Guardamos el nombre del paciente en la memoria 
            // del navegador para poder mostrarlo arriba a la derecha en el Dashboard
            localStorage.setItem('nombrePaciente', data.nombre);
            
            // 2. ¡LA INSTRUCCIÓN CRÍTICA! Movemos al usuario al Dashboard
            window.location.href = 'index.html'; 
            
        } else {
            // Si el servidor rechaza la entrada (contraseña incorrecta), mostramos el error
            alert(data.error);
        }
        
    } catch (error) {
        console.error("Error de red:", error);
        alert("Ocurrió un error al intentar conectar con el servidor Seroa.");
    }
});
// Inicializar
generateCaptcha();