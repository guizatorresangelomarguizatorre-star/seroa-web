(function () {
    const footerHTML = `
<!-- ===== FOOTER LEGAL SEROA ===== -->
<footer class="seroa-footer">
  <div class="container">
    <div class="d-flex flex-wrap justify-content-between align-items-center gap-3">
      <div>
        <span class="footer-brand">
          <i class="bi bi-lungs-fill me-1" style="color:var(--color-seroa-teal)"></i>Sistema Seroa
        </span>
        <small class="d-block mt-1">Prototipo de desarrollo académico y escolar sujeto a mejoras futuras.</small>
      </div>
      <div class="d-flex flex-wrap gap-3 align-items-center">
        <small>© 2026 El equipo desarrollador de Seroa. Todos los derechos reservados.</small>
        <button type="button"
                class="btn btn-sm btn-outline-light rounded-pill px-3"
                data-bs-toggle="modal" data-bs-target="#modalTerminosSeroa">
          <i class="bi bi-file-earmark-text me-1"></i>Términos y Condiciones
        </button>
      </div>
    </div>
    <hr class="footer-divider">
    <p class="mb-0 text-center" style="font-size:.74rem;opacity:.55;">
      Seroa es un prototipo experimental. No constituye un dispositivo médico certificado.
      Para emergencias, contacte servicios médicos profesionales.
      Fundamentos basados en NOM-178-SSA1-1998.
    </p>
  </div>
</footer>

<!-- ===== MODAL TÉRMINOS Y CONDICIONES ===== -->
<div class="modal fade modal-tc" id="modalTerminosSeroa" tabindex="-1"
     aria-labelledby="modalTerminosSeroaLabel" aria-hidden="true">
  <div class="modal-dialog modal-lg modal-dialog-scrollable">
    <div class="modal-content">
      <div class="modal-header">
        <div>
          <h5 class="modal-title fw-bold mb-0" id="modalTerminosSeroaLabel">
            <i class="bi bi-file-earmark-text-fill me-2"></i>Términos y Condiciones de Uso
          </h5>
          <small style="opacity:.8;">Sistema Seroa &mdash; Versión vigente: Junio 2026</small>
        </div>
        <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button>
      </div>
      <div class="modal-body">

        <div class="tc-disclaimer-box">
          <i class="bi bi-exclamation-triangle-fill me-2"></i>
          <strong>IMPORTANTE:</strong> Seroa es un <strong>prototipo de desarrollo académico y escolar
          sujeto a mejoras futuras</strong>. No constituye un dispositivo médico comercial certificado
          (aún). El equipo desarrollador queda totalmente eximido de responsabilidad legal, médica o
          civil derivada de fallas o uso indebido. Lea estos términos antes de utilizar el sistema.
        </div>

        <p class="mt-3"><strong>Propietario y Operador:</strong> El equipo desarrollador de Seroa.</p>

        <div class="tc-section-title">1. Aceptación de Términos de Uso</div>
        <p>Al acceder, instalar o utilizar cualquier componente del Sistema Seroa —incluyendo la
        interfaz web, la aplicación web progresiva (PWA), el firmware del dispositivo ESP32 y
        cualquier servicio de datos asociado— usted declara haber leído, comprendido y aceptado
        en su totalidad los presentes Términos y Condiciones. Si no está de acuerdo con alguna
        disposición, le rogamos abstenerse de utilizar el sistema.</p>

        <div class="tc-section-title">2. Restricciones de Edad y Capacidad Legal</div>
        <p>El uso del Sistema Seroa está reservado a personas mayores de <strong>dieciocho (18) años</strong>
        de edad con plena capacidad legal según la legislación vigente en su lugar de residencia.
        Queda expresamente prohibido el uso por parte de menores de edad sin supervisión y consentimiento
        expreso de su tutor legal. El acceso al sistema implica la declaración tácita del usuario de
        cumplir con este requisito.</p>

        <div class="tc-section-title">3. Ausencia de Garantías Médicas — Disclaimer Médico Estricto</div>
        <div class="tc-disclaimer-box">
          <i class="bi bi-hospital-fill me-2"></i>
          ⚠️ <strong>AVISO MÉDICO CRÍTICO:</strong> El Sistema Seroa <strong>NO</strong> debe ser
          interpretado como sustituto del criterio médico profesional, de equipos médicos certificados
          ni de dispositivos de diagnóstico clínico aprobados. Los datos, alertas, lecturas biométricas
          e indicadores de presión de oxígeno que el sistema genera son meramente orientativos y
          experimentales. El equipo desarrollador de Seroa no garantiza la exactitud, integridad,
          oportunidad ni confiabilidad clínica de ninguna lectura. Las decisiones médicas deben recaer
          exclusivamente en profesionales de salud habilitados. El uso de este prototipo en contextos
          de emergencia médica real puede resultar en <strong>daños graves o irreversibles a la salud
          y/o la vida</strong>.
        </div>
        <div class="tc-nom-box">
          <i class="bi bi-bookmark-check-fill me-2"></i>
          <strong>Cumplimiento normativo de referencia:</strong> "Este prototipo basa sus fundamentos
          y diseño en los lineamientos establecidos por la <strong>NOM-178-SSA1-1998</strong>, Que
          establece los requisitos mínimos de infraestructura y equipamiento de establecimientos para
          la atención médica de pacientes ambulatorios."
        </div>

        <div class="tc-section-title">4. Reserva del Derecho a Suspender o Modificar el Servicio</div>
        <p>El equipo desarrollador de Seroa se reserva el derecho, en cualquier momento y
        <strong>sin previo aviso</strong>, a: (a) modificar, actualizar, suspender temporal o
        permanentemente el servicio o cualquiera de sus funcionalidades; (b) interrumpir el acceso
        por razones de mantenimiento, seguridad o cualquier otra causa pertinente; (c) modificar los
        presentes Términos y Condiciones. El uso continuado del sistema tras la publicación de cambios
        constituirá la aceptación automática de dichos cambios.</p>

        <div class="tc-section-title">5. Propiedad Intelectual</div>
        <p>Todo el contenido del Sistema Seroa —código fuente del software de interfaz web, firmware
        del dispositivo (C++/Arduino), diseño de hardware, arquitectura del sistema, logotipos,
        gráficas y nombre comercial "Seroa"— es propiedad exclusiva del equipo desarrollador de Seroa.
        <strong>Todos los derechos de software, hardware y marca están reservados a Seroa.</strong>
        Queda estrictamente prohibida la reproducción, distribución, modificación, ingeniería inversa,
        sublicencia o cualquier otra forma de explotación de estos materiales sin autorización expresa
        y por escrito del equipo desarrollador.</p>

        <div class="tc-section-title">6. Indemnidad Total hacia los Desarrolladores</div>
        <p>Usted acepta defender, indemnizar y mantener indemne al equipo desarrollador de Seroa, sus
        integrantes académicos, asesores, instituciones educativas vinculadas y cualquier colaborador,
        frente a toda reclamación, pérdida, daño, responsabilidad, costo o gasto (incluyendo honorarios
        legales razonables) que surja de: (a) el uso o la imposibilidad de uso del Sistema Seroa;
        (b) la violación de estos Términos; (c) la violación de derechos de terceros; o (d) decisiones
        médicas o de salud tomadas con base en los datos del sistema.</p>

        <div class="tc-section-title">7. Limitación Máxima de Responsabilidad por Pérdida de Datos o Daños</div>
        <p>En la máxima medida permitida por la ley aplicable, el equipo desarrollador de Seroa
        <strong>no será responsable</strong> por ningún daño directo, indirecto, incidental, especial,
        consecuente o punitivo, incluyendo, sin limitación: pérdida de datos, pérdida de ingresos,
        interrupción del servicio, daños a la salud o lesiones físicas, derivados del uso o la
        imposibilidad de uso del Sistema Seroa, aunque el equipo desarrollador hubiera sido informado
        de la posibilidad de dichos daños. La responsabilidad total máxima del equipo desarrollador,
        en cualquier caso, <strong>no excederá el monto de cero pesos (MXN $0.00)</strong>, dado que
        el sistema se provee gratuitamente como prototipo académico.</p>

      </div>
      <div class="modal-footer justify-content-between align-items-center">
        <small class="text-muted">
          <i class="bi bi-shield-check me-1 text-success"></i>
          Documento generado para uso académico exclusivo.
        </small>
        <button type="button"
                class="btn btn-sm text-white fw-bold px-4"
                style="background-color:var(--color-seroa-teal);border-radius:10px;"
                data-bs-dismiss="modal">
          <i class="bi bi-check-circle me-1"></i>Entendido
        </button>
      </div>
    </div>
  </div>
</div>`;

    document.addEventListener('DOMContentLoaded', function () {
        document.body.insertAdjacentHTML('beforeend', footerHTML);
    });
})();
