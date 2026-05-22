const express = require('express');
const router = express.Router();

module.exports = (db) => {
    
    // Ruta que escuchará al ESP32
    router.post('/guardar-biometricos', (req, res) => {
        const spo2 = parseInt(req.body.spo2) || 0;
        const bpm = parseInt(req.body.bpm) || 0;

        // Solo guardamos si los datos son reales
        if (spo2 > 0 && bpm > 0) {
            let es_critico = "Normal";
            
            // Lógica de triaje médico
            if (spo2 < 85 || bpm < 50 || bpm > 140) {
                es_critico = "Peligro";
            } else if (spo2 < 90 || bpm < 60 || bpm > 100) {
                es_critico = "Precaucion";
            }

            // Datos estáticos por ahora (puedes volverlos dinámicos después)
            const id_paciente = 1;
            const id_dispositivo = 1;

            // La consulta exacta para tus columnas
            const query = 'INSERT INTO registros_biomedicos (id_paciente, id_dispositivo, saturacion_oxigeno, ritmo_cardiaco, es_critico, fecha_hora) VALUES (?, ?, ?, ?, ?, NOW())';
            
            db.query(query, [id_paciente, id_dispositivo, spo2, bpm, es_critico], (err, result) => {
                if (err) {
                    console.error("Error guardando datos biomédicos en MySQL:", err);
                    return res.status(500).send("Error interno BD");
                }
                res.status(200).send("Guardado con éxito");
            });
        } else {
            res.status(400).send("Datos omitidos (estaban en 0)");
        }
    });

    return router;
};