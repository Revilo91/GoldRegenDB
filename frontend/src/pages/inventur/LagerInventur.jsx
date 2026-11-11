import { useCallback, useEffect, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faTimes, faPlus, faCheck, faSearch } from "@fortawesome/free-solid-svg-icons";
import { api } from "../../api";
import DataTable from "../../components/DataTable";
import { useToast } from "../../components/Toast";
import InventurDiffModal from "./InventurDiffModal";

const summeStueck = (data) =>
  Object.values(data || {}).reduce((sum, count) => sum + count, 0);

const entwurfStand = (d) => JSON.stringify({ data: d.data, kommentar: d.kommentar });

function LagerInventurEditor({ draftId, onBack }) {
  const toast = useToast();
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);
  const [inputNr, setInputNr] = useState("");
  const [allArticleNumbers, setAllArticleNumbers] = useState([]);
  const [showDiff, setShowDiff] = useState(false);
  const [draftLoaded, setDraftLoaded] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);
  const lastSavedDraftStr = useRef(null);

  useEffect(() => {
    api
      .getInventurDraft(draftId)
      .then((d) => {
        if (!d.data) d.data = {};
        setDraft(d);
        lastSavedDraftStr.current = entwurfStand(d);
        setTimeout(() => setDraftLoaded(true), 100);
      })
      .catch((err) => {
        toast.fehler(err.message);
        onBack();
      });

    // Lade Artikelnummern für Autovervollständigung
    api
      .getUniqueArtikelnummern({
        ausgelagert: "0",
        verkauft: "0",
        ausschuss: "0",
      })
      .then((res) => {
        if (res && Array.isArray(res)) {
          setAllArticleNumbers(res);
        }
      })
      .catch((err) =>
        toast.fehler("Fehler beim Laden der Artikelnummern: " + err.message)
      );
  }, [draftId, onBack, toast]);

  const performSave = async () => {
    const currentStr = entwurfStand(draft);
    if (currentStr === lastSavedDraftStr.current) return;

    setSaving(true);
    try {
      await api.updateInventurDraft(draftId, {
        data: draft.data,
        kommentar: draft.kommentar,
      });
      lastSavedDraftStr.current = currentStr;
    } catch (err) {
      toast.fehler("Automatische Speicherung fehlgeschlagen: " + err.message);
      throw err;
    } finally {
      setSaving(false);
    }
  };

  // Autosave
  useEffect(() => {
    if (!draftLoaded || !draft) return;
    const timer = setTimeout(() => {
      performSave().catch(() => {});
    }, 800);
    return () => clearTimeout(timer);
  }, [draft, draftLoaded, draftId]);

  // Ändert eine Kopie der Zählstände
  const aendereData = (fn) =>
    setDraft((prev) => {
      const data = { ...prev.data };
      fn(data);
      return { ...prev, data };
    });

  const handleScan = (e) => {
    e.preventDefault();
    const nr = inputNr.trim().toUpperCase();
    if (!nr) return;

    aendereData((data) => {
      data[nr] = (data[nr] || 0) + 1;
    });
    setInputNr("");
  };

  const handleCountChange = (nr, count) =>
    aendereData((data) => {
      const val = parseInt(count, 10);
      if (isNaN(val) || val <= 0) {
        delete data[nr];
      } else {
        data[nr] = val;
      }
    });

  const handleRemove = (nr) =>
    aendereData((data) => {
      delete data[nr];
    });

  const completeDraft = async () => {
    if (
      !window.confirm(
        "Möchtest du diese Inventur wirklich abschließen? Sie kann danach nicht mehr bearbeitet werden.",
      )
    )
      return;

    try {
      await performSave();
      await api.completeInventurDraft(draftId);
      setIsCompleted(true);
      setShowDiff(true); // Fehlbestand automatisch anzeigen
    } catch (err) {
      toast.fehler("Fehler beim Abschließen: " + err.message);
    }
  };

  const handleShowDiff = async () => {
    try {
      await performSave();
      setShowDiff(true);
    } catch (err) {
      toast.fehler("Fehler vor Auswertung: " + err.message);
    }
  };

  if (!draft)
    return (
      <div className="loading">
        <div className="spinner"></div>
      </div>
    );

  const entries = Object.entries(draft.data).sort((a, b) =>
    a[0].localeCompare(b[0]),
  );

  return (
    <>
      {showDiff && (
        <InventurDiffModal
          draftId={draftId}
          onClose={() => {
            setShowDiff(false);
            if (isCompleted) {
              onBack();
            }
          }}
        />
      )}
      <div className="card">
        <div
          className="card-header inventur-flex-gap-16-ai-center">
          <button className="btn btn-secondary" onClick={onBack}>
            &larr; Zurück
          </button>
          <h3 className="inventur-m-0">Lager-Inventur #{draft.id}</h3>
        </div>
        <div className="card-body">
          <div className="inventur-mb-20">
            <label>Kommentar:</label>
            <input
              type="text"
              className="input inventur-w-100-maxw-400-mt-4"
              value={draft.kommentar || ""}
              onChange={(e) =>
                setDraft((prev) => ({ ...prev, kommentar: e.target.value }))
              }
              placeholder="Optionale Notiz..."
            />
          </div>

          <form
            onSubmit={handleScan} className="inventur-scan-form">
            <input
              type="text"
              className="input inventur-flex-1-maxw-300"
              list="artikelnummer-autocomplete"
              value={inputNr}
              onChange={(e) => setInputNr(e.target.value)}
              placeholder="Artikelnummer scannen..."
              autoFocus
            />
            <datalist id="artikelnummer-autocomplete">
              {allArticleNumbers.map((nr) => (
                <option key={nr} value={nr} />
              ))}
            </datalist>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={!inputNr.trim()}>
              Hinzufügen
            </button>
          </form>

          <h4 className="inventur-mb-12">
            Erfasste Artikel (
            {summeStueck(draft.data)} Stück gesamt)
          </h4>
          {entries.length === 0 ? (
            <p className="inventur-color-text-muted">
              Noch keine Artikel gescannt.
            </p>
          ) : (
            <div className="inventur-ox-auto-mb-20">
              <table
                className="table inventur-tabelle">
                <thead>
                  <tr className="inventur-border-b-2-solid-border">
                    <th className="inventur-p-8">Artikelnummer</th>
                    <th className="inventur-w-120-p-8">Anzahl</th>
                    <th className="inventur-w-80-p-8-text-center">
                      Aktion
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map(([nr, count]) => (
                    <tr
                      key={nr} className="inventur-border-b-1-solid-border">
                      <td className="inventur-p-8">
                        <strong>{nr}</strong>
                      </td>
                      <td className="inventur-p-8">
                        <input
                          type="number"
                          className="input inventur-w-80"
                          min="1"
                          value={count}
                          onChange={(e) =>
                            handleCountChange(nr, e.target.value)
                          }
                        />
                      </td>
                      <td className="inventur-p-8-text-center">
                        <button
                          className="btn btn-danger btn-sm"
                          onClick={() => handleRemove(nr)}
                          title="Löschen">
                          <FontAwesomeIcon icon={faTimes} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="inventur-aktionsleiste">
            <button
              className="btn btn-primary"
              onClick={handleShowDiff}
              disabled={saving || entries.length === 0}
              title="Vergleiche gescannte Artikel mit dem Lagerbestand">
              <FontAwesomeIcon icon={faSearch} className="mr-8" />
              Auswertung anzeigen
            </button>
            <button
              className="btn btn-success ml-auto"
              onClick={completeDraft}
              disabled={saving}>
              <FontAwesomeIcon icon={faCheck} className="mr-8" />
              Abschließen
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

export default function LagerInventurUI() {
  const toast = useToast();
  const [drafts, setDrafts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeDraftId, setActiveDraftId] = useState(null);

  const loadDrafts = useCallback(() => {
    api
      .getInventurDrafts()
      .then(setDrafts)
      .catch((err) => toast.fehler("Fehler beim Laden der Inventuren: " + err.message))
      .finally(() => setLoading(false));
  }, [toast]);

  useEffect(() => {
    if (!activeDraftId) {
      loadDrafts();
    }
  }, [activeDraftId, loadDrafts]);

  const createDraft = async () => {
    try {
      const draft = await api.createInventurDraft({ data: {}, kommentar: "" });
      setActiveDraftId(draft.id);
    } catch (err) {
      toast.fehler(err.message);
    }
  };

  if (activeDraftId) {
    return (
      <LagerInventurEditor
        draftId={activeDraftId}
        onBack={() => setActiveDraftId(null)}
      />
    );
  }

  return (
    <div className="card">
      <div className="card-header">
        <h3>Offene Inventuren</h3>
        <button className="btn btn-primary" onClick={createDraft}>
          <FontAwesomeIcon icon={faPlus} className="mr-8" />
          Neue Inventur
        </button>
      </div>
      <div className="card-body">
        {loading ? (
          <div className="loading">
            <div className="spinner"></div>Lade Inventuren...
          </div>
        ) : drafts.length === 0 ? (
          <p className="inventur-color-text-muted-p-10">
            Keine offenen Inventuren vorhanden.
          </p>
        ) : (
          <DataTable
            data={drafts}
            getRowKey={(d) => d.id}
            onRowClick={(d) => setActiveDraftId(d.id)}
            columns={[
              { key: "id", label: "ID", render: (d) => `#${d.id}` },
              {
                key: "created_at",
                label: "Erstellt am",
                render: (d) => new Date(d.created_at).toLocaleString("de-DE"),
              },
              {
                key: "updated_at",
                label: "Zuletzt geändert",
                render: (d) => new Date(d.updated_at).toLocaleString("de-DE"),
              },
              {
                key: "kommentar",
                label: "Kommentar",
                render: (d) =>
                  d.kommentar || (
                    <span className="inventur-color-text-muted">
                      Kein Kommentar
                    </span>
                  ),
              },
              {
                key: "item_count",
                label: "Gescannte Artikel",
                render: (d) => summeStueck(d.data) + " Stück",
              },
            ]}
          />
        )}
      </div>
    </div>
  );
}
