import { useState, useEffect, useMemo } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import DataTable from "../components/DataTable";
import SchmuckstueckModal from "../components/SchmuckstueckModal";
import { useToast } from "../components/Toast";
import RechnungZuruecksetzenModal from "../components/RechnungZuruecksetzenModal";
import { useAuth } from "../context/AuthContext";
import DetailModal from "./documentManager/DetailModal";
import BearbeitenModal from "./documentManager/BearbeitenModal";

// Bei Einmalkunden (Onlineshop) steht der Empfänger hinter dem Sammelkunden: "Online · Erika Mustermann"
const kundenAnzeige = (d) => {
  const kunde = d.KundenName || `Kunde ${d.Kundennummer}`;
  return d.empfaenger?.Name ? `${kunde} · ${d.empfaenger.Name}` : kunde;
};

const datumDE = (datum) =>
  new Date(datum).toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

const leeresForm = (nummer = "") => ({
  Nummer: nummer,
  Kundennummer: "",
  Artikelnummern: [],
  rabatt_gesamt: 0,
  rabatt_positionen: {},
  empfaenger: null,
  versandkosten: "",
});

export default function DocumentManager({
  type,
  api,
  icons,
  labels,
  pieceFilter,
  pieceSelectMode = "all",
  eRechnungFormate = [], // nur Rechnungen: [{ format, label, dateiSuffix, endung }]
}) {
  const toast = useToast();
  // Ohne AuthProvider (Tests) liefert der Hook null
  const istAdmin = useAuth()?.user?.role === "admin";
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState(null);
  const [kunden, setKunden] = useState([]);
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState({});
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(leeresForm());
  const [geladenePieces, setAvailablePieces] = useState([]);
  const [groupByKunde, setGroupByKunde] = useState(false);
  const [saving, setSaving] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState(new Set());
  const [schmuckstueckOverlay, setSchmuckstueckOverlay] = useState(null);
  const [zuruecksetzenOffen, setZuruecksetzenOffen] = useState(false);

  // Jedes Öffnen mountet das Bearbeiten-Modal neu und leert so dessen Suchfelder.
  const [oeffnung, setOeffnung] = useState(0);

  // Fehler eines API-Aufrufs als Toast zeigen
  const fehlerToast = (err) => toast.fehler(err.message);

  // Entwurf bearbeiten
  const openEditDraft = async (doc) => {
    try {
      const d = await api.getDetail(doc.ID);
      const neuesForm = {
        Nummer: d.Nummer,
        Kundennummer: d.Kundennummer,
        Artikelnummern: d.schmuckstuecke?.map(s => s.Artikelnummer) || [],
        rabatt_gesamt: Number(d.rabatt_gesamt) || 0,
        rabatt_positionen: d.rabatt_positionen || {},
        empfaenger: d.empfaenger || null,
        versandkosten: d.versandkosten ?? "",
      };
      setForm(neuesForm);
      setEditing(doc.ID); // Edit mode with document ID
      setOeffnung((n) => n + 1);
      setDetail(null); // Close detail modal
      await loadAvailablePieces(neuesForm, doc.ID);
    } catch (err) {
      fehlerToast(err);
    }
  };

  // Entwurf finalisieren
  const finalizeDraft = async (id) => {
    if (!confirm('Möchten Sie diesen Entwurf wirklich abschließen? Nach dem Abschließen werden die Schmuckstücke zugewiesen und der Status kann nicht mehr geändert werden.')) {
      return;
    }
    try {
      const d = await api.getDetail(id);
      await api.updateItem(id, {
        Nummer: d.Nummer,
        Kundennummer: d.Kundennummer,
        Artikelnummern: d.schmuckstuecke?.map(s => s.Artikelnummer) || [],
        status: 'final',
        rabatt_gesamt: Number(d.rabatt_gesamt) || 0,
        rabatt_positionen: d.rabatt_positionen || {},
        empfaenger: d.empfaenger ?? null,
        versandkosten: d.versandkosten ?? null,
      });
      setDetail(null);
      load();
    } catch (err) {
      fehlerToast(err);
    }
  };

  // Laden
  const load = () => {
    setLoading(true);
    api
      .getList()
      .then(setData)
      .catch((err) => toast.fehler("Fehler beim Laden der Dokumente: " + err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    api.getKunden().then(setKunden).catch((err) => toast.fehler("Fehler beim Laden der Kunden: " + err.message));
  }, [toast]);

  const openDetail = async (id) => {
    try {
      setDetail(await api.getDetail(id));
    } catch (err) {
      fehlerToast(err);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm(labels.deleteConfirm)) return;
    try {
      await api.deleteItem(id);
      setDetail(null);
      load();
    } catch (err) {
      fehlerToast(err);
    }
  };

  const zuruecksetzen = async (begruendung) => {
    await api.resetItem(detail.ID, begruendung);
    toast.erfolg(`${labels.excelFilePrefix} ${detail.Nummer} ist wieder ein Entwurf.`);
    setZuruecksetzenOffen(false);
    setDetail(null);
    load();
  };

  const dateiBasis = (id, nummer) =>
    `${labels.excelFilePrefix}_${String(nummer || id).replace(/[\\/:*?"<>|]+/g, "_")}`;

  const downloadDatei = async (ladeBlob, dateiname) => {
    try {
      const blob = await ladeBlob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = dateiname;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      // E-Rechnung: Backend liefert bei fehlenden Pflichtangaben eine Liste (422)
      const fehler = err.payload?.fehler;
      toast.fehler(
        Array.isArray(fehler) && fehler.length > 0
          ? `${err.payload.error}\n\n${fehler.map((f) => `• ${f.meldung} (${f.bt})`).join("\n")}`
          : err.message,
      );
    }
  };

  // Stückauswahl laden (unterschiedlich je nach Dokumenttyp).
  //
  // Form und Editing-Zustand werden übergeben, nicht aus der Closure gelesen:
  // openNew und openEditDraft rufen setForm/setEditing und direkt danach diese
  // Funktion auf. Aus der Closure kam dann noch der ALTE Zustand, für
  // Rechnungen also `{ ausgelagert: "" }` – das ging als `ausgelagert=` ans
  // Backend und endete als 500er (NaN-Parameter, Befund G5). Weil die Liste
  // danach leer blieb, zählte der Kopf Positionen über einer leeren Tabelle,
  // und Speichern schrieb die unsichtbaren Positionen trotzdem (Befund G6).
  const loadAvailablePieces = async (formToUse = form, editingToUse = editing) => {
    try {
      const kunde = kunden.find((k) => String(k.ID) === String(formToUse.Kundennummer));
      const resp = await api.getPieces(pieceFilter(formToUse, editingToUse, kunde));
      setAvailablePieces(resp.data);
    } catch (err) {
      setAvailablePieces([]);
      toast.fehler("Fehler beim Laden der verfügbaren Schmuckstücke: " + err.message);
    }
  };

  // Neues Dokument anlegen
  const openNew = async () => {
    let nummer = "";
    if (typeof api.getNextNumber === "function") {
      try {
        const response = await api.getNextNumber();
        nummer = String(response?.Nummer || "").trim();
      } catch (err) {
        toast.fehler("Nächste Nummer konnte nicht abgerufen werden: " + err.message);
      }
    }

    const neuesForm = leeresForm(nummer);
    setForm(neuesForm);
    setEditing("new");
    setOeffnung((n) => n + 1);
    // Nur im Modus "all" (Lieferschein) sofort laden. Bei "byKunde" (Rechnung)
    // wäre die Kundennummer hier noch leer und pieceFilter baute `ausgelagert=`
    // (500er im Backend, Befund G5). Sobald ein Kunde gewählt ist, lädt der
    // useEffect unten nach. handleSave prüft genau so.
    if (pieceSelectMode === "all") {
      loadAvailablePieces(neuesForm, "new");
    } else {
      setAvailablePieces([]);
    }
  };

  // Stückauswahl nach Kunde (nur für Rechnungen): jeder Bearbeitungszustand
  // lädt nach, sobald ein Kunde gesetzt ist, auch ein geöffneter Entwurf (G5/G6).
  useEffect(() => {
    if (pieceSelectMode === "byKunde" && editing && form.Kundennummer) {
      loadAvailablePieces(form, editing);
    }
  }, [form.Kundennummer, editing, kunden]);

  // Rechnung ohne Kunde: keine Stückliste. Abgeleitet statt im Effekt geleert,
  // damit nach dem Abwählen des Kunden nicht die Stücke des vorigen bleiben.
  const availablePieces =
    pieceSelectMode === "byKunde" && !(editing && form.Kundennummer)
      ? []
      : geladenePieces;

  const handleSave = async (status = 'final') => {
    if (!form.Kundennummer) {
      toast.fehler(labels.kundeRequired);
      return;
    }
    // Die Nummer wurde vorher per getNextNumber geholt. Ohne diese Sperre
    // erzeugte ein Doppelklick zwei Dokumente mit identischer Nummer (Befund G4).
    if (saving) return;
    setSaving(true);
    try {
      if (editing === 'new') {
        await api.createItem({ ...form, status });
      } else {
        await api.updateItem(editing, { ...form, status });
      }
      setEditing(null);
      setDetail(null);
      load();
      if (pieceSelectMode === "all") loadAvailablePieces();
    } catch (err) {
      fehlerToast(err);
    } finally {
      setSaving(false);
    }
  };

  // Filter, Sortierung, Gruppierung
  const years = useMemo(() => {
    const y = new Set();
    data.forEach((d) => {
      if (d.Datum) y.add(new Date(d.Datum).getFullYear());
    });
    return Array.from(y).sort((a, b) => b - a);
  }, [data]);

  const setFilter = (key, wert) => {
    const rest = { ...filters };
    delete rest[key];
    setFilters(wert !== "" ? { ...rest, [key]: wert } : rest);
  };

  // Vorsortierung nach Datum absteigend bestimmt die Reihenfolge bei Gleichstand;
  // DataTable sortiert danach ein zweites Mal (Befund G14).
  const sortedData = useMemo(() => {
    const s = search.toUpperCase();
    return data
      .filter((d) => {
        if (search) {
          const match =
            d.Nummer?.toUpperCase().includes(s) ||
            d.KundenName?.toUpperCase().includes(s) ||
            d.empfaenger?.Name?.toUpperCase().includes(s) ||
            String(d.ID).includes(s);
          if (!match) return false;
        }
        if (filters.kundennummer && d.Kundennummer !== parseInt(filters.kundennummer)) return false;
        if (filters.jahr) {
          if (!d.Datum) return false;
          if (String(new Date(d.Datum).getFullYear()) !== String(filters.jahr)) return false;
        }
        return true;
      })
      .sort((a, b) => (a.Datum < b.Datum ? 1 : a.Datum > b.Datum ? -1 : 0));
  }, [data, search, filters]);

  const toggleGroup = (groupKey) => {
    const newExpanded = new Set(expandedGroups);
    if (newExpanded.has(groupKey)) newExpanded.delete(groupKey);
    else newExpanded.add(groupKey);
    setExpandedGroups(newExpanded);
  };

  const groupedData = useMemo(() => {
    if (!groupByKunde) return null;
    const groups = [];
    const seen = new Map();
    for (const d of sortedData) {
      const key = d.Kundennummer;
      const name = d.KundenName || `Kunde ${d.Kundennummer}`;
      if (!seen.has(key)) {
        seen.set(key, groups.length);
        groups.push({ key, name, items: [] });
      }
      groups[seen.get(key)].items.push(d);
    }
    return groups.sort((a, b) => a.name.localeCompare(b.name));
  }, [sortedData, groupByKunde]);

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>{labels.header}</h2>
          <p>
            {data.length} {labels.header}
          </p>
        </div>
        <button className="btn btn-primary" onClick={openNew}>
          {labels.newBtn}
        </button>
      </div>

      <div className="toolbar">
        <input
          className="form-control search-input"
          placeholder="Suche nach Nummer, Kunde, ID..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="filter-group">
          <select
            className="form-control doc-filter-select"
            value={filters.kundennummer ?? ""}
            onChange={(e) => setFilter("kundennummer", e.target.value)}>
            <option value="">Alle Kunden</option>
            {kunden.map((k) => (
              <option key={k.ID} value={k.ID}>
                {k.Name}
              </option>
            ))}
          </select>
          <select
            className="form-control doc-filter-select-year"
            value={filters.jahr ?? ""}
            onChange={(e) => setFilter("jahr", e.target.value)}>
            <option value="">Alle Jahre</option>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
          <label className="doc-group-checkbox-label">
            <input
              type="checkbox"
              className="form-checkbox"
              checked={groupByKunde}
              onChange={(e) => setGroupByKunde(e.target.checked)}
            />
            Nach Kunde gruppieren
          </label>
        </div>
      </div>

      <div className="card">
        <div className="card-body">
          {loading ? (
            <div className="loading">
              <div className="spinner"></div>Lade...
            </div>
          ) : groupByKunde ? (
            <table className="data-table">
              <thead>
                <tr>
                  <th className="docmgr-cursor-pointer">Nummer</th>
                  <th className="docmgr-cursor-pointer">Kunde</th>
                  <th className="hide-on-mobile docmgr-cursor-pointer">
                    Datum
                  </th>
                </tr>
              </thead>
              <tbody>
                {groupedData.flatMap((group) => {
                  const isExpanded = expandedGroups.has(group.key);
                  return [
                    <tr
                      key={`group-${group.key}`}
                      className="group-header-row docmgr-cursor-pointer"
                      onClick={() => toggleGroup(group.key)}
                      aria-label={`Kundengruppe: ${group.name}`}>
                      <td colSpan={4}>
                        <span className="mr-8">
                          {isExpanded ? "▼" : "▶"}
                        </span>
                        <FontAwesomeIcon icon={icons.user} /> {group.name}{" "}
                        <span className="docmgr-fw-normal-color-text-muted-fs-0_9em">
                          ({group.items.length})
                        </span>
                      </td>
                    </tr>,
                    ...(isExpanded
                      ? group.items.map((d) => (
                          <tr
                            key={d.ID}
                            onClick={(e) => {
                              e.stopPropagation();
                              openDetail(d.ID);
                            }} className="docmgr-cursor-pointer">
                            <td>{d.Nummer}</td>
                            <td>{kundenAnzeige(d)}</td>
                            <td className="hide-on-mobile">
                              {d.Datum ? datumDE(d.Datum) : ""}
                            </td>
                          </tr>
                        ))
                      : []),
                  ];
                })}
              </tbody>
            </table>
          ) : (
            <DataTable
              data={sortedData}
              defaultSort={{ key: "Datum", direction: "desc" }}
              onRowClick={(r) => openDetail(r.ID)}
              columns={[
                { key: "Nummer", label: "Nummer", sortable: true },
                {
                  key: "KundenName",
                  label: "Kunde",
                  sortable: true,
                  render: kundenAnzeige,
                },
                {
                  key: "Datum",
                  label: "Datum",
                  className: "hide-on-mobile",
                  sortable: true,
                  render: (r) => (r.Datum ? datumDE(r.Datum) : ""),
                },
                {
                  key: "status",
                  label: "Status",
                  sortable: true,
                  render: (r) =>
                    r.status === 'entwurf' ? (
                      <span className="badge data-table-status-badge">
                        Entwurf
                      </span>
                    ) : (
                      <span className="badge data-table-status-badge success">
                        Abgeschlossen
                      </span>
                    ),
                },
              ]}
            />
          )}
        </div>
      </div>

      {detail && (
        <DetailModal
          detail={detail}
          datum={datumDE(detail.Datum)}
          type={type}
          labels={labels}
          icons={icons}
          eRechnungFormate={eRechnungFormate}
          istAdmin={istAdmin}
          onEdit={openEditDraft}
          onFinalize={finalizeDraft}
          onExcel={(id, nummer) =>
            downloadDatei(() => api.exportExcel(id), `${dateiBasis(id, nummer)}.xlsx`)
          }
          onERechnung={(id, nummer, f) =>
            downloadDatei(
              () => api.exportERechnung(id, f.format),
              `${dateiBasis(id, nummer)}_${f.dateiSuffix}.${f.endung}`,
            )
          }
          onZuruecksetzen={() => setZuruecksetzenOffen(true)}
          onDelete={handleDelete}
          onSchmuck={setSchmuckstueckOverlay}
          onClose={() => setDetail(null)}
        />
      )}

      {zuruecksetzenOffen && detail && (
        <RechnungZuruecksetzenModal
          nummer={detail.Nummer}
          onBestaetigt={zuruecksetzen}
          onClose={() => setZuruecksetzenOffen(false)}
        />
      )}

      {editing && (
        <BearbeitenModal
          key={oeffnung}
          type={type}
          labels={labels}
          icons={icons}
          pieceSelectMode={pieceSelectMode}
          editing={editing}
          form={form}
          setForm={setForm}
          kunden={kunden}
          availablePieces={availablePieces}
          saving={saving}
          onSave={handleSave}
          onClose={() => setEditing(null)}
        />
      )}
      {schmuckstueckOverlay && (
        <SchmuckstueckModal
          artikelnummer={schmuckstueckOverlay}
          onClose={() => setSchmuckstueckOverlay(null)}
        />
      )}
    </div>
  );
}
