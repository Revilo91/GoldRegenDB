import { useCallback, useEffect, useMemo, useState } from "react";
import { formatEur } from "../utils/zahlen";
import { MOBILE_BREAKPOINT } from "../utils/breakpoints";
import { useMediaQuery } from "../hooks/useMediaQuery";
import { api } from "../api";
import DataTable from "../components/DataTable";
import TableToolbar from "../components/TableToolbar";
import { useToast } from "../components/Toast";
import DetailModal from "./inventur/DetailModal";
import LagerInventurUI from "./inventur/LagerInventur";

const ZAEHLER_FELDER = ["gesamt", "aktiv", "verkauft", "ausschuss"];
const WERT_FELDER = ["wert_aktiv", "wert_verkauft"];

const ANSICHTEN = [
  { id: "kunden", label: "Kunden-Inventur" },
  { id: "lager", label: "Lager-Inventur" },
];

// Zahlenspalte: rechtsbündig-neutrale Kopfzeile, optional mit Farbklasse
const zahlSpalte = (key, label, extra) => ({
  key,
  label,
  headerClassName: "inventur-th-links",
  ...extra,
});

export default function Inventur() {
  const toast = useToast();
  const [summary, setSummary] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [aktivFilter, setAktivFilter] = useState("1"); // "" = alle
  const [selectedKunde, setSelectedKunde] = useState(null);
  const [activeTab, setActiveTab] = useState("kunden");
  const isMobile = useMediaQuery(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);

  const load = useCallback(() => {
    api
      .getInventur()
      .then(setSummary)
      .catch((err) => toast.fehler(err.message))
      .finally(() => setLoading(false));
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const s = search.toUpperCase();
    return summary.filter((k) => {
      if (search.trim()) {
        const match =
          k.Name?.toUpperCase().includes(s) || k.Ort?.toUpperCase().includes(s);
        if (!match) return false;
      }
      return aktivFilter === "" || k.Aktiv === (aktivFilter === "1");
    });
  }, [summary, search, aktivFilter]);

  // Bestimmt die Reihenfolge bei Gleichstand, wenn DataTable nach einer anderen Spalte sortiert.
  const sorted = useMemo(() => {
    const gross = (k) => (typeof k.Name === "string" ? k.Name.toUpperCase() : k.Name);
    return [...filtered].sort((a, b) => (gross(a) < gross(b) ? -1 : gross(a) > gross(b) ? 1 : 0));
  }, [filtered]);

  const totals = useMemo(
    () =>
      summary.reduce(
        (acc, k) => {
          ZAEHLER_FELDER.forEach((f) => (acc[f] += k[f] || 0));
          WERT_FELDER.forEach((f) => (acc[f] += Number(k[f]) || 0));
          return acc;
        },
        Object.fromEntries([...ZAEHLER_FELDER, ...WERT_FELDER].map((f) => [f, 0])),
      ),
    [summary],
  );

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Inventur</h2>
          <p>Ausgelagerte Schmuckstücke pro Kunde oder Lager</p>
        </div>
      </div>

      <div className="inventur-flex-gap-8-mb-16">
        {ANSICHTEN.map((a) => (
          <button
            key={a.id}
            className={`btn btn-sm ${activeTab === a.id ? "btn-primary" : "btn-secondary"}`}
            onClick={() => setActiveTab(a.id)}>
            {a.label}
          </button>
        ))}
      </div>

      {activeTab === "kunden" && (
        <>
          <TableToolbar
            search={search}
            onSearchChange={setSearch}
            placeholder="Suche nach Kunde, Ort…"
            right={
              <div className="filter-group">
                <select
                  className="form-control"
                  value={aktivFilter}
                  onChange={(e) => setAktivFilter(e.target.value)}>
                  <option value="">Alle Status</option>
                  <option value="1">Aktiv</option>
                  <option value="0">Inaktiv</option>
                </select>
              </div>
            }
          />

          <div className="card">
            <div className="card-body">
              {loading ? (
                <div className="loading">
                  <div className="spinner"></div>Lade…
                </div>
              ) : filtered.length === 0 ? (
                <p className="inventur-color-text-muted">
                  {summary.length === 0
                    ? "Keine ausgelagerten Artikel vorhanden."
                    : "Keine Ergebnisse für diese Suche."}
                </p>
              ) : (
                <>
                  <DataTable
                    data={sorted}
                    getRowKey={(r) => r.ID}
                    defaultSort={{ key: "Name", direction: "asc" }}
                    onRowClick={(k) => setSelectedKunde(k)}
                    className="inventur-table"
                    footer={
                      <tr className="inventur-fw-600-bg-bg-hover">
                        <td
                          colSpan={isMobile ? 1 : 2} className="inventur-p-8-12">
                          Gesamt
                        </td>
                        <td className="inventur-text-left">{totals.gesamt}</td>
                        <td className="inventur-text-left-color-success">
                          {totals.aktiv}
                        </td>
                        <td
                          className="hide-on-mobile inventur-text-left-color-info">
                          {totals.verkauft}
                        </td>
                        <td
                          className="hide-on-mobile inventur-text-left-color-warning">
                          {totals.ausschuss}
                        </td>
                        <td
                          className="hide-on-mobile inventur-text-left">
                          {formatEur(totals.wert_aktiv)}
                        </td>
                        <td
                          className="hide-on-mobile inventur-text-left">
                          {formatEur(totals.wert_verkauft)}
                        </td>
                      </tr>
                    }
                    columns={[
                      {
                        key: "Name",
                        label: "Kunde",
                        sortable: true,
                        render: (r) => (
                          <>
                            <strong>{r.Name}</strong>
                            {!r.Aktiv && (
                              <span
                                className="badge danger inventur-ml-8-fs-10">
                                Inaktiv
                              </span>
                            )}
                          </>
                        ),
                      },
                      {
                        key: "Ort",
                        label: "Ort",
                        className: "hide-on-mobile",
                        sortable: true,
                      },
                      zahlSpalte("gesamt", "Gesamt", {
                        sortable: true,
                        render: (r) => (
                          <span className="inventur-text-left">{r.gesamt}</span>
                        ),
                      }),
                      zahlSpalte("aktiv", "Nicht verkauft", {
                        sortable: true,
                        render: (r) => (
                          <span className="inventur-color-success">{r.aktiv}</span>
                        ),
                      }),
                      zahlSpalte("verkauft", "Verkauft", {
                        className: "hide-on-mobile",
                        sortable: true,
                        render: (r) => (
                          <span className="inventur-color-info">{r.verkauft}</span>
                        ),
                      }),
                      zahlSpalte("ausschuss", "Ausschuss", {
                        className: "hide-on-mobile",
                        sortable: true,
                        render: (r) => (
                          <span className="inventur-color-warning">{r.ausschuss}</span>
                        ),
                      }),
                      zahlSpalte("wert_aktiv", "Warenwert (aktiv)", {
                        className: "hide-on-mobile",
                        render: (r) => formatEur(r.wert_aktiv),
                      }),
                      zahlSpalte("wert_verkauft", "Warenwert (verkauft)", {
                        className: "hide-on-mobile",
                        render: (r) => formatEur(r.wert_verkauft),
                      }),
                    ]}
                  />
                  {selectedKunde && (
                    <DetailModal
                      kundeId={selectedKunde.ID}
                      kundeName={selectedKunde.Name}
                      kundeAktiv={selectedKunde.Aktiv}
                      onClose={() => setSelectedKunde(null)}
                      onRestock={load}
                    />
                  )}
                </>
              )}
            </div>
          </div>
        </>
      )}

      {activeTab === "lager" && <LagerInventurUI />}
    </div>
  );
}
