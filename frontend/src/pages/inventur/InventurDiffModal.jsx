import { useEffect, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faTimes,
  faSearch,
  faExclamationTriangle,
  faQuestionCircle,
  faCheckCircle,
} from "@fortawesome/free-solid-svg-icons";
import { api } from "../../api";
import { useToast } from "../../components/Toast";

const SPALTE_ZENTRIERT = "inventur-p-8-text-center";

// farbe: Stat-Karte, Umrandung und Artikelnummer; spalten: Zahlenspalten nach Artikelnummer/Name
const ABSCHNITTE = [
  {
    id: "fehlend",
    label: "Fehlend",
    farbe: "danger",
    icon: faExclamationTriangle,
    titel: "Fehlende Artikelnummern",
    titelClass: "inventur-color-danger-flex-ai-center-gap-8-mb-12",
    anzahl: (diff) => diff.stats.fehlend,
    hinweis: "– Im Lager erwartet, aber nicht gescannt",
    leer: "✓ Keine Artikel fehlen – alles vollständig erfasst!",
    leerClass: "inventur-color-success-fw-600",
    zeileClass: "inventur-zeile-fehlend",
    spalten: [
      { kopf: "Soll", feld: "Soll" },
      { kopf: "Ist", feld: "Ist" },
      { kopf: "Fehlend", feld: "Fehlt", zelleClass: "inventur-p-8-text-center-fw-bold-color-danger" },
    ],
  },
  {
    id: "unbekannt",
    label: "Unbekannt",
    farbe: "warning",
    icon: faQuestionCircle,
    titel: "Unbekannte Artikel",
    titelClass: "inventur-titel-unbekannt",
    anzahl: (diff) => diff.unbekannt.length,
    hinweis: "– Gescannt, aber nicht im Lager-Soll",
    leer: "✓ Keine unbekannten Artikel gescannt.",
    leerClass: "inventur-color-success-fw-600",
    zeileClass: "inventur-zeile-unbekannt",
    spalten: [
      { kopf: "Soll", feld: "Soll" },
      { kopf: "Ist", feld: "Ist" },
      { kopf: "Überschuss", feld: "Zuviel", zelleClass: "inventur-p-8-text-center-fw-bold-color-warning" },
    ],
  },
  {
    id: "gefunden",
    label: "Gefunden",
    farbe: "success",
    icon: faCheckCircle,
    titel: "Gefundene Artikel",
    titelClass: "inventur-titel-gefunden",
    anzahl: (diff) => diff.gefunden.length,
    hinweis: "– Im Soll und auch gescannt",
    leer: "Keine Artikel übereinstimmend.",
    leerClass: "inventur-color-text-muted",
    zeileClass: "inventur-border-b-1-solid-border",
    spalten: [
      { kopf: "Soll", feld: "Soll" },
      { kopf: "Gefunden", feld: "Gefunden" },
    ],
  },
];

function AbschnittTabelle({ abschnitt, zeilen }) {
  return (
    <div className="inventur-ox-auto">
      <table className="table inventur-w-100-border-collapse-collapse">
        <thead>
          <tr className="inventur-border-b-2-solid-border">
            <th className="inventur-p-8-text-left">Artikelnummer</th>
            <th className="inventur-p-8-text-left">Name</th>
            {abschnitt.spalten.map((s) => (
              <th key={s.kopf} className={SPALTE_ZENTRIERT}>
                {s.kopf}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {zeilen.map((item) => (
            <tr key={item.Artikelnummer} className={abschnitt.zeileClass}>
              <td className="inventur-p-8">
                <strong className={`inventur-color-${abschnitt.farbe}`}>
                  {item.Artikelnummer}
                </strong>
              </td>
              <td className="inventur-p-8">{item.Name || "–"}</td>
              {abschnitt.spalten.map((s) => (
                <td key={s.kopf} className={s.zelleClass || SPALTE_ZENTRIERT}>
                  {item[s.feld]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function InventurDiffModal({ draftId, onClose }) {
  const toast = useToast();
  const [diff, setDiff] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeSection, setActiveSection] = useState("fehlend");

  useEffect(() => {
    api
      .getInventurDiff(draftId)
      .then(setDiff)
      .catch((err) => toast.fehler("Fehler beim Laden der Auswertung: " + err.message))
      .finally(() => setLoading(false));
  }, [draftId, toast]);

  const abschnitt = ABSCHNITTE.find((a) => a.id === activeSection);

  return (
    <div className="modal-overlay">
      <div
        className="modal inventur-modal-diff"
        onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="inventur-flex-ai-center-gap-10">
            <FontAwesomeIcon icon={faSearch} />
            Inventur-Auswertung #{draftId}
          </h3>
          <button className="modal-close" onClick={onClose}>
            <FontAwesomeIcon icon={faTimes} />
          </button>
        </div>

        <div className="modal-body inventur-flex-1-oy-auto">
          {loading ? (
            <div className="loading">
              <div className="spinner"></div>Lade Auswertung…
            </div>
          ) : (
            diff && (
              <>
                <div className="stats-grid inventur-mb-20">
                  {ABSCHNITTE.map((a) => (
                    <div
                      key={a.id}
                      className={`stat-card ${a.farbe} inventur-stat-klickbar${activeSection === a.id ? ` inventur-outline-${a.farbe}` : ""}`}
                      onClick={() => setActiveSection(a.id)}>
                      <div className="stat-value">{diff.stats[a.id]}</div>
                      <div className="stat-label">{a.label}</div>
                    </div>
                  ))}
                  <div className="stat-card gold">
                    <div className="stat-value">{diff.stats.soll}</div>
                    <div className="stat-label">Soll-Bestand</div>
                  </div>
                </div>

                <h4 className={abschnitt.titelClass}>
                  <FontAwesomeIcon icon={abschnitt.icon} />
                  {abschnitt.titel} ({abschnitt.anzahl(diff)})
                  <span className="inventur-fs-12-fw-400-color-text-secondary">
                    {abschnitt.hinweis}
                  </span>
                </h4>
                {diff[abschnitt.id].length === 0 ? (
                  <p className={abschnitt.leerClass}>{abschnitt.leer}</p>
                ) : (
                  <AbschnittTabelle abschnitt={abschnitt} zeilen={diff[abschnitt.id]} />
                )}
              </>
            )
          )}
        </div>

        <div className="modal-footer inventur-jc-flex-end">
          <button className="btn btn-secondary" onClick={onClose}>
            Schließen
          </button>
        </div>
      </div>
    </div>
  );
}
