import { useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import DataTable from "../../components/DataTable";
import EmpfaengerModal from "../../components/EmpfaengerModal";
import { useToast } from "../../components/Toast";
import { formatEur } from "../../utils/zahlen";
import { empfaengerZeile } from "../../utils/empfaenger";

const prozent = (wert) => Math.min(100, Math.max(0, Number(wert) || 0));

// Neues Dokument anlegen bzw. Entwurf bearbeiten (Kopf, Stückauswahl, Rabatte)
export default function BearbeitenModal({
  type,
  labels,
  icons,
  pieceSelectMode,
  editing,
  form,
  setForm,
  kunden,
  availablePieces,
  saving,
  onSave,
  onClose,
}) {
  const toast = useToast();
  const [pieceSearch, setPieceSearch] = useState("");
  const [artikelnummerInput, setArtikelnummerInput] = useState("");
  const [empfaengerOffen, setEmpfaengerOffen] = useState(false);
  const istRechnung = type === "rechnung";
  const ohneKunde = pieceSelectMode === "byKunde" && !form.Kundennummer;
  const gewaehlterKunde = kunden.find((k) => String(k.ID) === String(form.Kundennummer));

  const addPiece = (nr) => {
    if (!form.Artikelnummern.includes(nr)) {
      setForm({ ...form, Artikelnummern: [...form.Artikelnummern, nr] });
    }
  };

  const togglePiece = (nr) => {
    if (!form.Artikelnummern.includes(nr)) {
      addPiece(nr);
      return;
    }
    // Einzelrabatt entfernen, wenn kein Stück derselben Basis-Artikelnummer bleibt
    const basis = nr.split("_")[0];
    const rest = form.Artikelnummern.filter((n) => n !== nr);
    const rabattPositionen = { ...form.rabatt_positionen };
    if (!rest.some((n) => n.split("_")[0] === basis)) {
      delete rabattPositionen[basis];
    }
    setForm({ ...form, Artikelnummern: rest, rabatt_positionen: rabattPositionen });
  };

  const addByArtikelnummer = () => {
    const nr = artikelnummerInput.trim();
    if (!nr) return;
    const piece = availablePieces.find(
      (p) => p.Artikelnummer.toUpperCase() === nr.toUpperCase(),
    );
    if (!piece) {
      toast.fehler(labels.pieceNotFound(nr));
      return;
    }
    addPiece(piece.Artikelnummer);
    setArtikelnummerInput("");
  };

  return (
    <>
      <div className="modal-overlay">
        <div
          className="modal modal-lg modal-edit-document"
          onClick={(e) => e.stopPropagation()}>
          <div className="modal-header">
            <h3>
              {editing === 'new' ? labels.modalTitle : `${labels.header} ${form.Nummer} bearbeiten`}
              {editing !== 'new' && (
                <span className="badge modal-header-badge">
                  Entwurf
                </span>
              )}
            </h3>
            <button className="modal-close" onClick={onClose}>
              ×
            </button>
          </div>
          <div className="modal-body">
            <div className="form-row">
              <div className="form-group">
                <label>Kunde*</label>
                <select
                  className="form-control"
                  value={form.Kundennummer}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      Kundennummer: e.target.value,
                      ...(pieceSelectMode === "byKunde"
                        ? { Artikelnummern: [] }
                        : {}),
                    })
                  }>
                  <option value="">Bitte wählen...</option>
                  {kunden.filter((k) => k.Aktiv === true || k.Aktiv === 1).map((k) => (
                    <option key={k.ID} value={k.ID}>
                      {k.Name}
                    </option>
                  ))}
                </select>
                {pieceSelectMode === "byKunde" && gewaehlterKunde?.Direktverkauf && (
                  <small className="form-hinweis">
                    Direktverkauf: Stücke aus dem Lager und bei diesem Kunden, kein Lieferschein nötig.
                  </small>
                )}
              </div>
              {istRechnung && (
                <div className="form-group">
                  <label>Rechnungsempfänger (Onlineshop)</label>
                  {form.empfaenger ? (
                    <div className="empfaenger-summary">
                      <span>{empfaengerZeile(form.empfaenger)}</span>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => setEmpfaengerOffen(true)}>
                        Bearbeiten
                      </button>
                      <button
                        type="button"
                        className="btn btn-danger btn-sm"
                        title="Rechnungsempfänger entfernen"
                        aria-label="Rechnungsempfänger entfernen"
                        onClick={() => setForm({ ...form, empfaenger: null })}>
                        <FontAwesomeIcon icon={icons.times} />
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => setEmpfaengerOffen(true)}>
                      Einmalkunde erfassen…
                    </button>
                  )}
                </div>
              )}
            </div>

            <div className="piece-selection piece-selection-wrapper">
              <div className="piece-selection-flex">
                {/* Linke Seite: Stückauswahl */}
                <div className="piece-side">
                  <h5>Alle Schmuckstücke</h5>
                  <input
                    className="form-control search-input piece-search-input"
                    placeholder="Schmuckstücke suchen..."
                    value={pieceSearch}
                    onChange={(e) => setPieceSearch(e.target.value)}
                    disabled={ohneKunde}
                  />
                  <div className="piece-container">
                    <DataTable
                      data={availablePieces.filter((p) =>
                        pieceSearch.trim() === ""
                          ? true
                          : [p.Artikelnummer, p.Art, String(p.Verkaufspreis)]
                              .join(" ")
                              .toLowerCase()
                              .includes(pieceSearch.trim().toLowerCase()),
                      )}
                      columns={[
                        {
                          key: "select",
                          label: "",
                          render: (p) => (
                            <input
                              type="checkbox"
                              className="form-checkbox"
                              checked={form.Artikelnummern.includes(p.Artikelnummer)}
                              readOnly
                            />
                          ),
                          width: 40,
                        },
                        { key: "Artikelnummer", label: "Artikelnr.", sortable: true },
                        { key: "Art", label: "Art", sortable: true },
                        {
                          key: "Verkaufspreis",
                          label: "Preis",
                          sortable: true,
                          render: (p) => formatEur(p.Verkaufspreis),
                        },
                      ]}
                      onRowClick={(p) => togglePiece(p.Artikelnummer)}
                      rowProps={(p) => ({
                        draggable: true,
                        onDragStart: (e) =>
                          e.dataTransfer.setData("artikelnummer", p.Artikelnummer),
                      })}
                    />
                  </div>
                </div>
                {/* Rechte Seite: Selektierte Stücke */}
                <div className="piece-side">
                  <h5>
                    Ausgewählte Schmuckstücke ({form.Artikelnummern.length})
                  </h5>
                  <div className="piece-add-controls">
                    <input
                      className="form-control piece-add-input"
                      placeholder="Artikelnummer eingeben..."
                      value={artikelnummerInput}
                      onChange={(e) => setArtikelnummerInput(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && addByArtikelnummer()}
                      disabled={ohneKunde}
                    />
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={addByArtikelnummer}
                      disabled={ohneKunde}>
                      Hinzufügen
                    </button>
                  </div>
                  <div
                    className="piece-container"
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      const nr = e.dataTransfer.getData("artikelnummer");
                      if (nr) addPiece(nr);
                    }}>
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Artikelnr.</th>
                          <th>Art</th>
                          <th>Preis</th>
                          {istRechnung && <th className="docmgr-minw-90">Rabatt %</th>}
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {form.Artikelnummern.map((nr) => {
                          const piece = availablePieces.find((p) => p.Artikelnummer === nr);
                          if (!piece) return null;
                          const basis = nr.split("_")[0];
                          return (
                            <tr key={nr}>
                              <td>{piece.Artikelnummer}</td>
                              <td>{piece.Art}</td>
                              <td>{formatEur(piece.Verkaufspreis)}</td>
                              {istRechnung && (
                                <td>
                                  <input
                                    type="number"
                                    min="0"
                                    max="100"
                                    step="1"
                                    value={Number(form.rabatt_positionen?.[basis] || 0)}
                                    className="rabatt-input-piece form-control"
                                    onClick={(e) => e.stopPropagation()}
                                    onChange={(e) =>
                                      setForm({
                                        ...form,
                                        rabatt_positionen: {
                                          ...form.rabatt_positionen,
                                          [basis]: prozent(e.target.value),
                                        },
                                      })
                                    }
                                  />
                                </td>
                              )}
                              <td>
                                <button
                                  className="btn btn-danger btn-sm"
                                  title="Entfernen"
                                  onClick={() => togglePiece(nr)}>
                                  <FontAwesomeIcon icon={icons.times} />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          </div>
          {istRechnung && (
            <div className="rabatt-section">
              <div className="rabatt-form-group">
                <label className="rabatt-label">Gesamtrabatt auf Rechnung:</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="1"
                  value={form.rabatt_gesamt || 0}
                  className="form-control rabatt-input"
                  onChange={(e) => setForm({ ...form, rabatt_gesamt: prozent(e.target.value) })}
                />
                <label className="rabatt-label">%</label>
              </div>
              <div className="rabatt-form-group">
                <label className="rabatt-label" htmlFor="versandkosten">Versandkosten:</label>
                {/* Leer = keine Versandkosten; das Backend speichert dann NULL */}
                <input
                  id="versandkosten"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="optional"
                  value={form.versandkosten ?? ""}
                  className="form-control rabatt-input"
                  onChange={(e) => setForm({ ...form, versandkosten: e.target.value })}
                />
                <label className="rabatt-label">€</label>
              </div>
            </div>
          )}
          <div className="modal-footer">
            <button className="btn btn-secondary" onClick={onClose}>
              Abbrechen
            </button>
            <button
              className="btn btn-secondary ml-auto"
              disabled={saving}
              onClick={() => onSave('entwurf')}>
              {saving ? 'Speichert…' : 'Als Entwurf speichern'}
            </button>
            <button
              className="btn btn-primary"
              disabled={saving}
              onClick={() => onSave('final')}>
              {saving ? 'Speichert…' : 'Speichern & Abschließen'}
            </button>
          </div>
        </div>
      </div>
      {/* Außerhalb des Bearbeiten-Modals: dessen transform-Animation und
          overflow: hidden würden das fixierte Overlay sonst beschneiden */}
      {empfaengerOffen && (
        <EmpfaengerModal
          empfaenger={form.empfaenger}
          onClose={() => setEmpfaengerOffen(false)}
          onSave={(empfaenger) => {
            setForm({ ...form, empfaenger });
            setEmpfaengerOffen(false);
          }}
        />
      )}
    </>
  );
}
