// onTrotzdem: startet den Druck; onAbbrechen: schließt ohne zu drucken
export default function MaterialhinweisRueckfrageModal({ onTrotzdem, onAbbrechen }) {
  return (
    <div className="modal-overlay modal-overlay-nested">
      <div
        className="modal etikett-rueckfrage-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="etikett-rueckfrage-titel"
        onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 id="etikett-rueckfrage-titel">Ohne Materialhinweise?</h3>
        </div>
        <div className="modal-body">
          <p>Es ist kein Materialhinweis gewählt. Die Etiketten werden ohne Hinweis gedruckt.</p>
        </div>
        <div className="modal-footer">
          <button type="button" className="btn btn-secondary" onClick={onAbbrechen}>
            Abbrechen
          </button>
          <button type="button" className="btn btn-primary" autoFocus onClick={onTrotzdem}>
            Trotzdem drucken
          </button>
        </div>
      </div>
    </div>
  );
}
