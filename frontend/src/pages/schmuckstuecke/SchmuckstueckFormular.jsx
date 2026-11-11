import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faStar as faRegularStar } from "@fortawesome/free-regular-svg-icons";
import {
  faHashtag,
  faPen,
  faPlus,
  faBoxOpen,
  faMagnifyingGlass,
  faEuroSign,
  faPaperclip,
} from "@fortawesome/free-solid-svg-icons";
import PhotoUpload from "../../components/PhotoUpload";
import { istWahr } from "../../utils/status";
import { produktartCodeVon, zeigtFeldgruppe } from "../../utils/produktartFelder";
import { BULK_ZEILE } from "../../utils/schmuckstuecke";

const HERSTELLER_OPTIONS = [
  { code: "M", label: "Marina" },
  { code: "S", label: "Saskia" },
];

// Textfeld; mit `liste` und `optionen` (Schlüssel in filterOptions) als Vorschlagsliste
function Feld({ form, setForm, filterOptions, label, feld, liste, optionen, className = "form-group" }) {
  return (
    <div className={className}>
      <label>{label}</label>
      <input
        list={liste}
        className="form-control"
        placeholder=" "
        value={form[feld] || ""}
        onChange={(e) => setForm({ ...form, [feld]: e.target.value })}
      />
      {liste && (
        <datalist id={liste}>
          {filterOptions[optionen]?.map((o) => (
            <option key={o} value={o} />
          ))}
        </datalist>
      )}
    </div>
  );
}

// Zahlenfeld: hält den rohen Text, normalisiert wird erst beim Speichern
function ZahlFeld({ form, setForm, label, feld }) {
  return (
    <div className="form-group">
      <label>{label}</label>
      <input
        className="form-control"
        placeholder=" "
        type="text"
        inputMode="decimal"
        value={form[feld] ?? ""}
        onChange={(e) => setForm({ ...form, [feld]: e.target.value })}
      />
    </div>
  );
}

// Längen: Ohrringe in mm, sonst cm
const laengenEinheit = ({ Artikelnummer } = {}) =>
  String(Artikelnummer || "").charAt(2).toUpperCase() === "O" ? "mm" : "cm";

// Großes Formular für Neuanlage, Bearbeiten und eine Zeile der Vorlagen-Tabelle
export default function SchmuckstueckFormular({
  editing,
  form,
  setForm,
  filterOptions,
  kunden,
  saving,
  nextArtikelnummerPreview,
  onAbbrechen,
  onUebernehmen,
  onSpeichern,
}) {
  const istNeu = editing === "new";
  const istBulkZeile = editing === BULK_ZEILE;
  const f = { form, setForm, filterOptions };
  // Welche Feldgruppen das Formular je Produktart zeigt (Werte ausgeblendeter
  // Felder bleiben im Formular erhalten und werden mitgespeichert)
  const formProduktart = produktartCodeVon(form);
  const zeigeLaenge = zeigtFeldgruppe(formProduktart, "laenge");
  const zeigeAnhaenger = zeigtFeldgruppe(formProduktart, "anhaenger");
  const zeigeZwischenstueck = zeigtFeldgruppe(formProduktart, "zwischenstueck");

  // Hersteller, Grundmaterial und Produktart ergeben zusammen das Präfix der Artikelnummer
  const codeFelder = [
    { feld: "HerstellerCode", label: "Hersteller*", platzhalter: "Hersteller", optionen: HERSTELLER_OPTIONS },
    { feld: "GrundmaterialCode", label: "Grundmaterial*", platzhalter: "Grundmaterial", optionen: filterOptions.grundmaterialien || [] },
    { feld: "ProduktartCode", label: "Produktart*", platzhalter: "Produktart", optionen: filterOptions.produktarten || [] },
  ];
  const setzeCode = (feld, wert) => {
    const codes = { ...form, [feld]: wert };
    const [hersteller, grundmaterial, produktart] = codeFelder.map((c) => codes[c.feld]);
    setForm({
      ...codes,
      Artikelnummer:
        hersteller && grundmaterial && produktart
          ? `${hersteller}${grundmaterial}${produktart}`
          : "",
    });
  };

  return (
    <div className="modal-overlay">
      <div
        className="modal schmuckstuecke-form-modal"
        onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>
            {istNeu ? (
              <>
                <FontAwesomeIcon icon={faPlus} /> Neues Schmuckstück
                {nextArtikelnummerPreview && (
                  <span className="schmuckstuecke-form-nummer">
                    {nextArtikelnummerPreview}
                    {form.Anzahl > 1 && ` × ${form.Anzahl}`}
                  </span>
                )}
              </>
            ) : istBulkZeile ? (
              <>
                <FontAwesomeIcon icon={faPen} /> Alle Felder:{" "}
                {form.Artikelnummer || "ohne Artikelnummer"}
              </>
            ) : (
              <>
                <FontAwesomeIcon icon={faPen} /> {editing} bearbeiten
              </>
            )}
          </h3>
          <button className="modal-close" onClick={onAbbrechen}>
            ×
          </button>
        </div>
        <div className="modal-body schmuckstuecke-form-body">
          <div className="form-section">
            <h4>
              <FontAwesomeIcon icon={faHashtag} /> Artikelnummer
            </h4>
            {istNeu ? (
              <div className="form-row schmuckstuecke-cols-1fr-1fr-1fr-120-ai-end">
                {codeFelder.map(({ feld, label, platzhalter, optionen }) => (
                  <div className="form-group" key={feld}>
                    <label>{label}</label>
                    <select
                      className="form-control"
                      value={form[feld] || ""}
                      onChange={(e) => setzeCode(feld, e.target.value)}>
                      <option value="">{platzhalter}</option>
                      {optionen.map((option) => (
                        <option key={option.code} value={option.code}>
                          {option.code} - {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
                <div className="form-group">
                  <label>Anzahl</label>
                  <input
                    className="form-control"
                    placeholder=" "
                    type="number"
                    min="1"
                    value={form.Anzahl || 1}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        Anzahl: parseInt(e.target.value) || 1,
                      })
                    }
                  />
                </div>
              </div>
            ) : (
              <div className="form-row">
                <div className="form-group">
                  <label>Artikelnummer*</label>
                  <input
                    className="form-control"
                    placeholder=" "
                    disabled
                    value={form.Artikelnummer || ""}
                  />
                </div>
              </div>
            )}
          </div>
          <div className="form-section">
            <h4>
              <FontAwesomeIcon icon={faBoxOpen} /> Basis-Informationen
            </h4>
            <div className="form-row">
              <Feld {...f} label="Name" feld="Name" />
            </div>
            <div className="form-row">
              <Feld {...f} label="Art" feld="Art" liste="arten-list" optionen="arten" />
              <Feld {...f} label="Material" feld="Material" liste="material-list" optionen="materialien" />
              <Feld {...f} label="Farbe" feld="Farbe" liste="farben-list" optionen="farben" />
            </div>
          </div>

          <div className="form-section schmuckstuecke-form-foto">
            <h4>Foto</h4>
            <PhotoUpload
              artikelnummer={
                istNeu ? nextArtikelnummerPreview : form.Artikelnummer
              }
              disabled={
                istNeu
                  ? !nextArtikelnummerPreview
                  : istBulkZeile && !form.Artikelnummer
              }
              hatFoto={
                istBulkZeile ? Boolean(form.fotoArtikelnummer) : form.hatFoto
              }
              onPhotoSelected={() => {
                setForm(
                  istBulkZeile
                    ? { ...form, fotoArtikelnummer: form.Artikelnummer }
                    : { ...form, hatFoto: true },
                );
              }}
            />
          </div>

          <div className="form-section">
            <h4>
              <FontAwesomeIcon icon={faMagnifyingGlass} /> Details
              (Hauptstück)
            </h4>
            <div className="form-row">
              <Feld {...f} label="Form" feld="Form" liste="formen-list" optionen="formen" />
              <ZahlFeld {...f} label="Größe" feld="Grösse" />
              {zeigeLaenge && (
                <ZahlFeld {...f} label={`Länge (${laengenEinheit(form)})`} feld="Länge" />
              )}
              <Feld {...f} label="Fassung" feld="Fassung" liste="fassungen-list" optionen="fassungen" />
            </div>
          </div>

          <div className="form-section">
            <h4>
              <FontAwesomeIcon icon={faRegularStar} /> Inhalt
            </h4>
            <div className="form-row">
              <Feld {...f} label="Inhalt Material" feld="Inhalt_Material" liste="inhalt-material-list" optionen="inhalt_materialien" />
              <Feld {...f} label="Inhalt Farbe" feld="Inhalt_Farbe" liste="inhalt-farbe-list" optionen="inhalt_farben" />
              <Feld {...f} label="Inhalt Farbakzent" feld="Inhalt_Farbakzent" liste="inhalt-farbakzent-list" optionen="inhalt_farbakzente" />
              <Feld {...f} label="Inhalt Zusatzmaterial" feld="Inhalt_Zusatzmaterial" liste="inhalt-zusatzmaterial-list" optionen="inhalt_zusatzmaterialien" />
            </div>
          </div>

          {(zeigeAnhaenger || zeigeZwischenstueck) && (
            <div className="form-section">
              <h4>
                <FontAwesomeIcon icon={faPaperclip} />{" "}
                {zeigeAnhaenger ? "Anhänger" : "Zwischenstück"}
              </h4>
              {zeigeAnhaenger && (
                <div className="schmuckstuecke-anhaenger-gruppen">
                  <div className="schmuckstuecke-anhaenger-gruppe">
                    <h5>Aussehen</h5>
                    <div className="form-row">
                      <Feld {...f} label="Fassung" feld="Anhänger_Fassung" liste="anhaenger-fassung-list" optionen="anhaenger_fassungen" />
                      <Feld {...f} label="Form" feld="Anhänger_Form" liste="anhaenger-form-list" optionen="anhaenger_formen" />
                      <Feld {...f} label="Farbe" feld="Anhänger_Farbe" liste="anhaenger-farbe-list" optionen="anhaenger_farben" />
                      <ZahlFeld {...f} label="Größe" feld="Anhänger_Grösse" />
                    </div>
                  </div>
                  <div className="schmuckstuecke-anhaenger-gruppe">
                    <h5>Inhalt</h5>
                    <div className="form-row">
                      <Feld {...f} label="Material" feld="Anhänger_Inhalt_Material" liste="anhaenger-inhalt-material-list" optionen="anhaenger_inhalt_materialien" />
                      <Feld {...f} label="Farbe" feld="Anhänger_Inhalt_Farbe" liste="anhaenger-inhalt-farbe-list" optionen="anhaenger_inhalt_farben" />
                      <Feld {...f} label="Farbakzent" feld="Anhänger_Inhalt_Farbakzente" liste="anhaenger-inhalt-farbakzent-list" optionen="anhaenger_inhalt_farbakzente" />
                      <Feld {...f} label="Zusatzmaterial" feld="Anhänger_Inhalt_Zusatzmaterial" liste="anhaenger-inhalt-zusatzmaterial-list" optionen="anhaenger_inhalt_zusatzmaterialien" />
                    </div>
                  </div>
                </div>
              )}
              <div
                className={
                  zeigeAnhaenger
                    ? "form-row schmuckstuecke-anhaenger-trenner"
                    : "form-row"
                }>
                {zeigeZwischenstueck && (
                  <Feld {...f} label="Zwischenstück" feld="Zwischenstück" liste="zwischenstuecke-list" optionen="zwischenstuecke" />
                )}
                {/* Ein zweites Feld "Fassung" schrieb hier früher auf form.Fassung
                    des Hauptstücks und duplizierte die datalist-ID (Befund G3);
                    der Anhänger hat sein eigenes "Fassung" im Block "Aussehen". */}
                {zeigeAnhaenger && (
                  <Feld {...f} label="Anhänger (Allg.)" feld="Anhänger" liste="anhaenger-list" optionen="anhaenger" />
                )}
              </div>
            </div>
          )}

          <div className="form-section">
            <h4>
              <FontAwesomeIcon icon={faEuroSign} /> Inventar & Preise
            </h4>
            <div className="form-row">
              <ZahlFeld {...f} label="Verkaufspreis (€)" feld="Verkaufspreis" />
              <ZahlFeld {...f} label="Herstellungskosten (€)" feld="Herstellungskosten" />
              {!istNeu && !istBulkZeile && (
                <div className="form-group">
                  <label>Standort / Ausgelagert</label>
                  <select
                    className="form-control"
                    value={form.Ausgelagert || 0}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        Ausgelagert: parseInt(e.target.value),
                      })
                    }>
                    <option value="0">Lager</option>
                    {kunden.map((k) => (
                      <option key={k.ID} value={k.ID}>
                        {k.Name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
            {!istNeu && !istBulkZeile && (
              <div className="form-row schmuckstuecke-mt-16">
                <div className="form-group">
                  <label className="form-label">Ausschuss</label>
                  <input
                    type="checkbox"
                    id="form-ausschuss"
                    className="form-checkbox"
                    checked={istWahr(form.Ausschuss)}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        Ausschuss: e.target.checked,
                        Ausschuss_Grund: e.target.checked
                          ? form.Ausschuss_Grund || "Defekt"
                          : "",
                      })
                    }
                  />
                </div>

                {istWahr(form.Ausschuss) && (
                  <div className="form-row schmuckstuecke-mt-12">
                    <Feld {...f} className="form-group schmuckstuecke-flex-1" label="Ausschuss Grund" feld="Ausschuss_Grund" liste="ausschussgruende-list" optionen="ausschussgruende" />
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onAbbrechen}>
            Abbrechen
          </button>
          {istBulkZeile ? (
            <button className="btn btn-primary" onClick={onUebernehmen}>
              Übernehmen
            </button>
          ) : istNeu ? (
            <>
              <button
                className="btn btn-primary"
                disabled={saving}
                onClick={() => onSpeichern({ closeAfterSave: true })}>
                {saving ? "Speichert…" : "Speichern + Schließen"}
              </button>
              <button
                className="btn btn-secondary"
                disabled={saving}
                onClick={() => onSpeichern({ closeAfterSave: false })}>
                {saving ? "Speichert…" : "Speichern + Weiter"}
              </button>
            </>
          ) : (
            <button
              className="btn btn-primary"
              disabled={saving}
              onClick={() => onSpeichern({ closeAfterSave: true })}>
              {saving ? "Speichert…" : "Speichern"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
