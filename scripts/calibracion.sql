-- ============================================================
-- Migración: Calibración dinámica de tanques de oxígeno
-- Ejecutar una sola vez en producción.
-- El servidor (server.js) también ejecuta CREATE TABLE IF NOT EXISTS
-- de forma automática al arrancar.
-- ============================================================

CREATE TABLE IF NOT EXISTS calibraciones_tanque (
    id_calibracion    INT AUTO_INCREMENT PRIMARY KEY,
    id_paciente       INT NOT NULL
                      COMMENT 'Paciente/dispositivo al que corresponde esta calibración',
    max_psi_baseline  FLOAT NOT NULL
                      COMMENT 'Presión máxima (bar) registrada al calibrar — equivale al 100%',
    fecha_calibracion DATETIME DEFAULT CURRENT_TIMESTAMP
                      COMMENT 'Fecha y hora de la última calibración',
    UNIQUE KEY unique_paciente (id_paciente)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  COMMENT='Baseline de presión máxima por paciente/dispositivo para cálculo de nivel de tanque';

-- Índice para consultas por fecha
CREATE INDEX IF NOT EXISTS idx_calib_fecha
    ON calibraciones_tanque (fecha_calibracion);

-- Vista de diagnóstico (opcional)
CREATE OR REPLACE VIEW v_calibraciones_activas AS
SELECT
    c.id_calibracion,
    c.id_paciente,
    c.max_psi_baseline,
    ROUND(c.max_psi_baseline * 14.5038, 1) AS max_psi_psi,
    c.fecha_calibracion,
    DATEDIFF(NOW(), c.fecha_calibracion) AS dias_desde_calibracion
FROM calibraciones_tanque c
ORDER BY c.fecha_calibracion DESC;
