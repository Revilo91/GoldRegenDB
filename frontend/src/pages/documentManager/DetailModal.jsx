import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { formatEur } from "../../utils/zahlen";
import { empfaengerZeile } from "../../utils/empfaenger";

const DetailItem = ({ label, wert, valueClass = "detail-value" }) => (
  <div className="detail-item">
    <label>{label}</label>
    <div className={valueClass}>{wert}</div>
  </div>
);

// Beleg-Details: Kopfaktionen, Aufteilung Marina & Saskia, Stückliste
export default function DetailModal({
  detail,
  datum, // formatiertes Belegdatum
  type,
  labels,
  icons,
  eRechnungFormate,
  istAdmin,
  onEdit,
  onFinalize,
  onExcel,
  onERechnung,
  onZuruecksetzen,
  onDelete,
  onSchmuck,
  onClose,
}) {
  const istRechnung = type === "rechnung";
  const istLieferschein = type === "lieferschein";
  const istFinal = detail.status === "final";
  // Finale Rechnungen sind gesperrt (#283): nur ein Admin kann sie zurücksetzen
  const finalGesperrt = istRechnung && istFinal;
  // Befund G7: Summen kommen aus SQL (utils/rabatt.js), nicht aus rohen Preisen
  const summen = detail.summen || {};
  const n = (key) => Number(summen[key]) || 0;
  const provisionPercent = Number(detail.Provision) || 0;
  const totalBrutto = n("summe_nach_rabatt");
  const totalNetto = n("ueberweisungsbetrag");
  const rabattGesamt = n("rabatt_gesamt");
  const versandkosten = n("versandkosten");

  return (
    <div className="modal-overlay">
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>
            <FontAwesomeIcon icon={icons.modal} /> {labels.header}{" "}
            {detail.Nummer}
            {detail.status === 'entwurf' && (
              <span className="badge modal-header-badge">
                Entwurf
              </span>
            )}
          </h3>
          {detail.status === 'entwurf' && (
            <>
              <button
                className="btn btn-primary btn-sm header-action-btn"
                onClick={() => onEdit(detail)}>
                Bearbeiten
              </button>
              <button
                className="btn btn-success btn-sm mr-8"
                onClick={() => onFinalize(detail.ID)}>
                Abschließen
              </button>
            </>
          )}
          {istFinal && (
            <>
              <button
                className="btn btn-primary btn-sm header-action-btn"
                onClick={() => onExcel(detail.ID, detail.Nummer)}>
                {labels.excel}
              </button>
              {eRechnungFormate.map((f) => (
                <button
                  key={f.format}
                  className="btn btn-secondary btn-sm header-action-btn"
                  title="E-Rechnung nach EN 16931 – wird vor dem Download automatisch geprüft"
                  onClick={() => onERechnung(detail.ID, detail.Nummer, f)}>
                  {f.label}
                </button>
              ))}
            </>
          )}
          {finalGesperrt && istAdmin && (
            <button
              className="btn btn-secondary btn-sm header-delete-btn"
              onClick={onZuruecksetzen}>
              Zurücksetzen
            </button>
          )}
          {!finalGesperrt && (
            <button
              className="btn btn-danger btn-sm header-delete-btn"
              onClick={() => onDelete(detail.ID)}>
              <FontAwesomeIcon icon={icons.trash} /> {labels.delete}
            </button>
          )}
          <button className="modal-close" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="modal-body">
          <div className="detail-grid">
            <DetailItem label="Kunde" wert={detail.KundenName} />
            <DetailItem label="Datum" wert={datum} />
            {detail.empfaenger && (
              <DetailItem label="Rechnungsempfänger" wert={empfaengerZeile(detail.empfaenger)} />
            )}
            {istRechnung && Number(detail.rabatt_gesamt) > 0 && (
              <DetailItem
                label="Gesamtrabatt"
                valueClass="detail-value detail-value-warning"
                wert={`${Number(detail.rabatt_gesamt)}%`}
              />
            )}
            {istRechnung && Number(detail.versandkosten) > 0 && (
              <DetailItem label="Versandkosten" wert={formatEur(Number(detail.versandkosten))} />
            )}
          </div>
          {detail.schmuckstuecke?.length > 0 && (
            <>
              <div className="docmgr-vorschau-box">
                <label className="docmgr-fs-0_9em-mb-0-block-color-888-fw-600">
                  {/* #241: der Lieferschein zeigt, welcher Wert an den
                      Kunden ging -- abgerechnet wird erst per Rechnung */}
                  {istLieferschein
                    ? "An Kunde gesendet (Netto nach Provision):"
                    : "Aufteilung (Netto nach Provision):"}
                </label>
                <div className="docmgr-flex-dir-column-gap-8">
                  <div className="docmgr-pb-8-border-b-1-solid-ddd">
                    <div className="docmgr-flex-jc-space-between-mb-4">
                      {/* Dieselbe Bezeichnung wie auf dem Beleg (Befund G7) */}
                      <span>
                        {istLieferschein
                          ? "Gesendet brutto:"
                          : rabattGesamt > 0 ? "Summe nach Rabatt:" : "Gesamtwert:"}
                      </span>
                      <strong>{formatEur(totalBrutto)}</strong>
                    </div>
                    {provisionPercent > 0 && (
                      <div className="docmgr-flex-jc-space-between-mb-4-color-d9534f">
                        <span>Provision ({provisionPercent}%):</span>
                        <strong>-{formatEur(n("provision_betrag"))}</strong>
                      </div>
                    )}
                    {/* Versand gehört keiner Herstellerin, deshalb nur
                        im Überweisungsbetrag, nicht in der Aufteilung */}
                    {versandkosten > 0 && (
                      <div className="aufteilung-zeile">
                        <span>Versandkosten:</span>
                        <strong>+{formatEur(versandkosten)}</strong>
                      </div>
                    )}
                    {(provisionPercent > 0 || versandkosten > 0) && (
                      <div className="docmgr-flex-jc-space-between-fw-600">
                        <span>
                          {istLieferschein ? "Gesendet netto:" : "Überweisungsbetrag:"}
                        </span>
                        <strong>{formatEur(totalNetto)}</strong>
                      </div>
                    )}
                  </div>

                  <div className="docmgr-flex-jc-space-between-gap-12-wrap-wrap">
                    {["marina", "saskia"].map((wer) =>
                      n(`${wer}_brutto`) > 0 && (
                        <div key={wer}>
                          <strong>{wer === "marina" ? "Marina" : "Saskia"}:</strong>{" "}
                          {formatEur(n(`${wer}_netto`))}
                          <span className="docmgr-fs-0_9em-color-999-ml-4">
                            ({formatEur(n(`${wer}_brutto`))} brutto)
                          </span>
                        </div>
                      ))}
                  </div>
                </div>
              </div>
              <h4 className="modal-body h4">
                Zugehörige Schmuckstücke ({detail.schmuckstuecke.length})
              </h4>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Artikelnr.</th>
                    <th>Art</th>
                    <th>Preis</th>
                    {istRechnung && <th>Rabatt</th>}
                  </tr>
                </thead>
                <tbody>
                  {detail.schmuckstuecke
                    .sort((a, b) =>
                      a.Artikelnummer.split("_")[0].localeCompare(
                        b.Artikelnummer.split("_")[0],
                      ),
                    )
                    .map((s) => {
                      const basis = s.Artikelnummer.split("_")[0];
                      const itemRabatt = istRechnung
                        ? Number(detail.rabatt_positionen?.[basis] || 0)
                        : 0;
                      return (
                        <tr key={s.Artikelnummer}>
                          <td>
                            <button
                              className="schmuck-table-btn"
                              onClick={(e) => {
                                e.stopPropagation();
                                onSchmuck(s.Artikelnummer);
                              }}>
                              <span className="badge gold">{basis}</span>
                            </button>
                          </td>
                          <td>{s.Art}</td>
                          <td>
                            {itemRabatt > 0 ? (
                              <span>
                                <span className="schmuck-item-row-price-original">
                                  {formatEur(s.Verkaufspreis)}
                                </span>
                                <span className="schmuck-item-row-price">
                                  {formatEur(Number(s.Verkaufspreis) * (1 - itemRabatt / 100))}
                                </span>
                              </span>
                            ) : (
                              formatEur(s.Verkaufspreis)
                            )}
                          </td>
                          {istRechnung && (
                            <td className={itemRabatt > 0 ? "schmuck-item-row-rabatt" : "schmuck-item-row-rabatt no-rabatt"}>
                              {itemRabatt > 0 ? `-${itemRabatt}%` : "–"}
                            </td>
                          )}
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
