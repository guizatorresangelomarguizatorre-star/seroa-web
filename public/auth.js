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

// Inicializar
generateCaptcha();