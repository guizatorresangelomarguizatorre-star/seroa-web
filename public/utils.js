// Validar la contraseña
function validarPasswordSeguro(pass) {
    if (!/(?=.*[A-Za-z])(?=.*\d)/.test(pass)) return "La contraseña debe tener letras y números.";
    
    const seq = "0123456789876543210";
    for (let i = 0; i < pass.length - 2; i++) {
        if (seq.includes(pass.substring(i, i + 3)) && /^\d+$/.test(pass.substring(i, i + 3))) {
            return "La contraseña no puede tener números consecutivos (ej. 123 o 321).";
        }
    }
    return null; // Retorna null si la contraseña esta bien
}