import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faHashtag, faPen, faTrash, faPlus, faCopy } from "@fortawesome/free-solid-svg-icons";
import DataTable from "../../components/DataTable";

// Textspalten der Tabelle: Feld, Überschrift, Vorschlagsliste (Schlüssel in filterOptions)
const TEXTSPALTEN = [
  { key: "Name", label: "Name" },
  { key: "Art", label: "Art", liste: "arten" },
  { key: "Material", label: "Material", liste: "materialien" },
  { key: "Farbe", label: "Farbe", liste: "farben" },
  { key: "Verkaufspreis", label: "VK (€)" },
  { key: "Form", label: "Form", liste: "formen" },
  { key: "Fassung", label: "Fassung", liste: "fassungen" },
];
const LISTEN_IDS = { arten: "bulk-arten-list", materialien: "bulk-material-list", farben: "bulk-farbe-list", formen: "bulk-formen-list", fassungen: "bulk-fassung-list" };

// Fenster "Aus Vorlage anlegen": Vorlage laden, Zeilen bearbeiten, gesammelt speichern
export default function BulkErfassungModal({
  rows,
  vorlage,
  setVorlage,
  ladeVorlage,
  laedtVorlage,
  saving,
  filterOptions,
  onAbbrechen,
  onSpeichern,
  onWert,
  onZeileBearbeiten,
  onZeileKopieren,
  onZeileLoeschen,
}) {
  const spalte = ({ key, label, liste }) => ({
    key,
    label,
    render: (row) =>
      key === "Verkaufspreis" ? (
        <input
          className="form-control"
          type="number"
          step="0.01"
          value={row.Verkaufspreis || 0}
          onChange={(e) => onWert(row._rowId, key, parseFloat(e.target.value) || 0)}
        />
      ) : (
        <input
          list={liste && LISTEN_IDS[liste]}
          className="form-control"
          value={row[key] || ""}
          onChange={(e) => onWert(row._rowId, key, e.target.value)}
        />
      ),
  });

  return (
    <div className="modal-overlay">
      <div
        className="modal modal-lg schmuckstuecke-maxw-100"
        onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>
            <FontAwesomeIcon icon={faPlus} /> Schmuckstücke aus Vorlage
            anlegen
          </h3>
          <button className="modal-close" onClick={onAbbrechen}>
            ×
          </button>
        </div>
        <div className="modal-body">
          <div className="form-section">
            <h4>
              <FontAwesomeIcon icon={faCopy} /> Vorlage
            </h4>
            <div className="form-row schmuckstuecke-cols-1fr-220-ai-end">
              <div className="form-group">
                <label>Bestehendes Schmuckstück laden</label>
                <input
                  className="form-control"
                  value={vorlage}
                  onChange={(e) => setVorlage(e.target.value.toUpperCase())}
                  placeholder="z.B. MBH001_1"
                />
              </div>
              <div className="form-group">
                <button
                  className="btn btn-secondary"
                  onClick={ladeVorlage}
                  disabled={laedtVorlage}>
                  {laedtVorlage ? "Lade Vorlage..." : "Als neue Zeile übernehmen"}
                </button>
              </div>
            </div>
          </div>

          <div className="form-section">
            <h4>
              <FontAwesomeIcon icon={faHashtag} /> Tabelle für
              Mehrfach-Erfassung
            </h4>
            <div className="table-container schmuckstuecke-ox-auto">
              <DataTable
                className="table"
                data={rows}
                defaultSort={{ key: null, direction: "asc" }}
                getRowKey={(row) => row._rowId}
                columns={[
                  {
                    key: "rownum",
                    label: "#",
                    render: (row) => rows.findIndex((r) => r._rowId === row._rowId) + 1,
                  },
                  {
                    key: "Artikelnummer",
                    label: "Artikelnummer*",
                    render: (row) => (
                      <input
                        className="form-control"
                        value={row.Artikelnummer || ""}
                        onChange={(e) =>
                          onWert(row._rowId, "Artikelnummer", e.target.value.toUpperCase())
                        }
                        placeholder="MBH001_2"
                      />
                    ),
                  },
                  ...TEXTSPALTEN.map(spalte),
                  {
                    key: "aktion",
                    label: "Aktion",
                    render: (row) => (
                      <div className="schmuckstuecke-flex-gap-6">
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => onZeileBearbeiten(row)}
                          disabled={saving}
                          title="Alle Felder bearbeiten">
                          <FontAwesomeIcon icon={faPen} />
                        </button>
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => onZeileKopieren(row._rowId)}
                          disabled={saving}
                          title="Zeile kopieren">
                          <FontAwesomeIcon icon={faCopy} />
                        </button>
                        <button
                          className="btn btn-danger btn-sm"
                          onClick={() => onZeileLoeschen(row._rowId)}
                          disabled={saving}
                          title="Zeile löschen">
                          <FontAwesomeIcon icon={faTrash} />
                        </button>
                      </div>
                    ),
                  },
                ]}
              />
            </div>
            {rows.length === 0 && (
              <p className="schmuckstuecke-mt-12">
                Noch keine Zeile. Lade oben ein bestehendes Schmuckstück
                als Vorlage.
              </p>
            )}
          </div>

          {Object.entries(LISTEN_IDS).map(([schluessel, id]) => (
            <datalist key={id} id={id}>
              {filterOptions[schluessel]?.map((o) => (
                <option key={o} value={o} />
              ))}
            </datalist>
          ))}
        </div>
        <div className="modal-footer">
          <button
            className="btn btn-secondary"
            onClick={onAbbrechen}
            disabled={saving}>
            Abbrechen
          </button>
          <button
            className="btn btn-primary"
            onClick={onSpeichern}
            disabled={saving || rows.length === 0}>
            {saving ? "Speichere..." : "Mehrfach speichern"}
          </button>
        </div>
      </div>
    </div>
  );
}
