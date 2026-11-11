import { useEffect, useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faFileExcel,
  faFileInvoice,
  faTimes,
  faBox,
} from "@fortawesome/free-solid-svg-icons";
import { api } from "../../api";
import { formatEur, summeEur } from "../../utils/zahlen";
import { istWahr } from "../../utils/status";
import TablePhoto from "../../components/TablePhoto";
import DataTable from "../../components/DataTable";
import SchmuckstueckModal from "../../components/SchmuckstueckModal";
import { useToast } from "../../components/Toast";

const TABS = [
  { id: "aktiv", label: "Nicht verkauft" },
  { id: "verkauft", label: "Verkauft" },
  { id: "ausschuss", label: "Ausschuss" },
  { id: "alle", label: "Alle" },
];

const TAB_FILTER = {
  aktiv: (i) => !istWahr(i.Verkauft) && !istWahr(i.Ausschuss),
  verkauft: (i) => istWahr(i.Verkauft),
  ausschuss: (i) => istWahr(i.Ausschuss),
  alle: () => true,
};

const STAT_KARTEN = [
  { label: "Gesamt", key: "gesamt", colorClass: "gold" },
  { label: "Nicht verkauft", key: "aktiv", colorClass: "success" },
  { label: "Verkauft", key: "verkauft", colorClass: "info" },
  { label: "Ausschuss", key: "ausschuss", colorClass: "danger" },
];

function formatDateDE(dateValue) {
  if (!dateValue) return "–";
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return "–";
  return date.toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

// Setzt den Ladezustand um eine Aktion und meldet Fehler als Toast
async function mitLadezustand(setBusy, toast, aktion) {
  setBusy(true);
  try {
    await aktion();
  } catch (err) {
    toast.fehler(err.message);
  } finally {
    setBusy(false);
  }
}

// auswahl: Checkbox-Spalten [{ key, label, alleTitel, selected, toggle, selectAll }]
function ItemsTable({ items, tab, auswahl, onItemClick, pausePhotoLoading }) {
  const total = summeEur(items.map((item) => item.Verkaufspreis));
  // Verkauft-Tab zeigt das Rechnungsdatum, alle anderen das Lieferscheindatum
  const datumFeld = tab === "verkauft" ? "Rechnung_Datum" : "Lieferschein_Datum";
  const datumMs = (item) =>
    item[datumFeld] ? new Date(item[datumFeld]).getTime() : null;

  const checkboxSpalten = auswahl.map((a) => {
    const alleGewaehlt = items.length > 0 && a.selected.size === items.length;
    return {
      key: a.key,
      label: (
        <>
          <div className="inventur-fs-8">{a.label}</div>
          <input
            type="checkbox"
            className="table-checkbox table-checkbox-header"
            checked={alleGewaehlt}
            onChange={a.selectAll}
            title={alleGewaehlt ? "Alle abwählen" : a.alleTitel}
            onClick={(e) => e.stopPropagation()}
          />
        </>
      ),
      headerClassName: "inventur-th-checkbox",
      render: (item) => (
        <input
          type="checkbox"
          className="table-checkbox"
          checked={a.selected.has(item.Artikelnummer)}
          onChange={() => a.toggle(item.Artikelnummer)}
          onClick={(e) => e.stopPropagation()}
        />
      ),
    };
  });

  return (
    <div className="inventur-ox-auto">
      <DataTable
        data={items}
        className="inventur-items-table"
        getRowKey={(item) => item.Artikelnummer}
        defaultSort={{ key: "Artikelnummer", direction: "asc" }}
        columns={[
          ...checkboxSpalten,
          {
            key: "foto",
            label: "Foto",
            className: "photo-col",
            render: (item) => (
              <TablePhoto
                hatFoto={item.hatFoto}
                artikelnummer={item.Artikelnummer}
                pauseLoading={pausePhotoLoading}
              />
            ),
          },
          {
            key: "Artikelnummer",
            label: "Artikelnummer",
            sortable: true,
            comparator: (a, b) =>
              String(a.Artikelnummer || "").localeCompare(
                String(b.Artikelnummer || ""),
                undefined,
                { numeric: true },
              ),
            render: (item) => {
              const [basis, exemplar] = String(item.Artikelnummer || "").split("_");
              return (
                <button
                  className="btn-link inventur-link-button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onItemClick(item.Artikelnummer);
                  }}>
                  <strong>{basis}</strong>
                  {Number(exemplar) > 0 && (
                    <span className="badge warning">{exemplar}</span>
                  )}
                </button>
              );
            },
          },
          {
            key: "Verkaufspreis",
            label: "Verkaufspreis",
            className: "hide-on-mobile",
            sortable: true,
            comparator: (a, b) =>
              (Number(a.Verkaufspreis) || 0) - (Number(b.Verkaufspreis) || 0),
            render: (item) => formatEur(item.Verkaufspreis),
          },
          {
            key: "Erstelldatum",
            label: tab === "verkauft" ? "Rechnungsdatum" : "Lieferscheindatum",
            sortable: true,
            comparator: (a, b) => {
              const aMs = datumMs(a);
              const bMs = datumMs(b);
              if (aMs === null && bMs === null) return 0;
              if (aMs === null) return 1;
              if (bMs === null) return -1;
              return aMs - bMs;
            },
            render: (item) => formatDateDE(item[datumFeld]),
          },
        ]}
        footer={
          <tr>
            {auswahl.map((a) => (
              <td key={a.key} />
            ))}
            <td className="photo-col" />
            <td className="inventur-fw-600-text-right-p-8-12">Gesamtwert:</td>
            <td className="inventur-fw-600">{formatEur(total)}</td>
            <td className="hide-on-mobile" />
          </tr>
        }
      />
    </div>
  );
}

export default function DetailModal({ kundeId, kundeName, kundeAktiv, onClose, onRestock }) {
  const toast = useToast();
  const [data, setData] = useState(null);
  // Kunde, zu dem zuletzt fertig geladen wurde; daraus ergibt sich "lädt"
  const [geladenFuer, setGeladenFuer] = useState(null);
  const loading = geladenFuer !== kundeId;
  const [tab, setTab] = useState("aktiv");
  const [exporting, setExporting] = useState(false);
  const [restocking, setRestocking] = useState(false);
  const [selectedForReturn, setSelectedForReturn] = useState(new Set());
  const [selectedForRechnung, setSelectedForRechnung] = useState(new Set());
  const [creatingRechnung, setCreatingRechnung] = useState(false);
  const [schmuckstueckOverlay, setSchmuckstueckOverlay] = useState(null);

  useEffect(() => {
    api
      .getInventurKunde(kundeId)
      .then(setData)
      .catch((err) => toast.fehler(err.message))
      .finally(() => setGeladenFuer(kundeId));
  }, [kundeId, toast]);

  const tabItems = useMemo(
    () => (data ? data.items.filter(TAB_FILTER[tab]) : []),
    [data, tab],
  );

  const handleExcel = () =>
    mitLadezustand(setExporting, toast, async () => {
      const blob = await api.exportInventurExcel(kundeId);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const safeName = String(kundeName || kundeId).replace(
        /[\\/:*?"<>|]+/g,
        "_",
      );
      a.download = `Inventur_${safeName}.xlsx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    });

  const handleRestock = () => {
    if (selectedForReturn.size === 0) {
      toast.fehler("Bitte wähle mindestens einen Artikel aus");
      return;
    }
    const confirm_msg = `Möchtest du ${selectedForReturn.size} Artikel von "${kundeName}" zurück ins Lager lagern?`;
    if (!window.confirm(confirm_msg)) return;

    return mitLadezustand(setRestocking, toast, async () => {
      await api.restockKundeSelective(kundeId, Array.from(selectedForReturn));
      toast.erfolg("Artikel erfolgreich zurückgelagert!");
      onRestock?.();
      onClose();
    });
  };

  const handleCreateRechnung = () => {
    if (selectedForRechnung.size === 0) {
      toast.fehler("Bitte wähle mindestens einen Artikel für die Rechnung aus");
      return;
    }
    const totalValue = summeEur(
      tabItems
        .filter((i) => selectedForRechnung.has(i.Artikelnummer))
        .map((i) => i.Verkaufspreis),
    );
    const confirmMsg = `Rechnung für ${selectedForRechnung.size} Artikel (${formatEur(totalValue)}) für "${kundeName}" erstellen?`;
    if (!window.confirm(confirmMsg)) return;

    return mitLadezustand(setCreatingRechnung, toast, async () => {
      const created = await api.createRechnung({
        Kundennummer: kundeId,
        Artikelnummern: Array.from(selectedForRechnung),
      });
      toast.erfolg(`Rechnung "${created?.Nummer}" erfolgreich erstellt!`);
      onRestock?.();
      onClose();
    });
  };

  const toggleIn = (setter) => (artikelnummer) =>
    setter((prev) => {
      const next = new Set(prev);
      if (next.has(artikelnummer)) {
        next.delete(artikelnummer);
      } else {
        next.add(artikelnummer);
      }
      return next;
    });

  const selectAllIn = (selected, setter) => () => {
    if (tabItems.length === 0) return;
    setter(
      selected.size === tabItems.length
        ? new Set()
        : new Set(tabItems.map((i) => i.Artikelnummer)),
    );
  };

  // Auswahl-Spalten gibt es nur im Tab "Nicht verkauft"
  const auswahl =
    tab === "aktiv"
      ? [
          {
            key: "zurueck",
            label: "Zurück",
            alleTitel: "Alle auswählen",
            selected: selectedForReturn,
            toggle: toggleIn(setSelectedForReturn),
            selectAll: selectAllIn(selectedForReturn, setSelectedForReturn),
          },
          {
            key: "rechnung",
            label: "Rechnung",
            alleTitel: "Alle für Rechnung auswählen",
            selected: selectedForRechnung,
            toggle: toggleIn(setSelectedForRechnung),
            selectAll: selectAllIn(selectedForRechnung, setSelectedForRechnung),
          },
        ]
      : [];

  return (
    <div className="modal-overlay">
      <div
        className="modal inventur-maxw-960-w-95"
        onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>
            Inventur – {kundeName}
            {!kundeAktiv && (
              <span
                className="badge danger inventur-ml-8-fs-12">
                Inaktiv
              </span>
            )}
          </h3>

          <button className="modal-close" onClick={onClose}>
            <FontAwesomeIcon icon={faTimes} />
          </button>
        </div>

        <div className="modal-body">
          {loading ? (
            <div className="loading">
              <div className="spinner"></div>Lade…
            </div>
          ) : (
            data && (
              <>
                <div className="stats-grid inventur-mb-10">
                  {STAT_KARTEN.map((s) => (
                    <div key={s.label} className={`stat-card ${s.colorClass}`}>
                      <div className="stat-value">{data.stats[s.key]}</div>
                      <div className="stat-label">{s.label}</div>
                    </div>
                  ))}
                </div>

                <div className="inventur-flex-gap-12-mb-20-wrap-wrap">
                  <span className="inventur-color-text-secondary-fs-13">
                    Warenwert (aktiv):{" "}
                    <strong className="inventur-color-success">
                      {formatEur(data.stats.wert_aktiv)}
                    </strong>
                  </span>
                  <span className="inventur-color-text-secondary-fs-13">
                    Warenwert (verkauft):{" "}
                    <strong className="inventur-color-info">
                      {formatEur(data.stats.wert_verkauft)}
                    </strong>
                  </span>
                </div>

                <div className="inventur-flex-gap-4-mb-16-wrap-wrap">
                  {TABS.map((t) => (
                    <button
                      key={t.id}
                      className={`btn btn-sm ${tab === t.id ? "btn-primary" : "btn-secondary"}`}
                      onClick={() => {
                        setTab(t.id);
                        setSelectedForReturn(new Set());
                        setSelectedForRechnung(new Set());
                      }}>
                      {t.label}
                      {t.id !== "alle" && (
                        <span className="inventur-zaehler-badge">
                          {data.stats[t.id]}
                        </span>
                      )}
                    </button>
                  ))}
                </div>

                <ItemsTable
                  items={tabItems}
                  tab={tab}
                  auswahl={auswahl}
                  onItemClick={setSchmuckstueckOverlay}
                  pausePhotoLoading={schmuckstueckOverlay !== null}
                />
              </>
            )
          )}
        </div>

        <div
          className="modal-footer inventur-modal-footer inventur-jc-space-between">
          <div className="inventur-flex-gap-8">
            <button
              className="btn btn-warning"
              onClick={handleRestock}
              disabled={restocking || loading || selectedForReturn.size === 0}
              title={
                selectedForReturn.size === 0
                  ? "Wähle Artikel (↩) aus um zurückzulagern"
                  : `${selectedForReturn.size} Artikel zurücklagern`
              }>
              <FontAwesomeIcon icon={faBox} className="inventur-mr-6" />
              {restocking
                ? "Lagere zurück…"
                : `Zurücklagern (${selectedForReturn.size})`}
            </button>
            <button
              className="btn btn-success"
              onClick={handleCreateRechnung}
              disabled={
                creatingRechnung || loading || selectedForRechnung.size === 0
              }
              title={
                selectedForRechnung.size === 0
                  ? "Wähle Artikel (🧾) aus um eine Rechnung zu erstellen"
                  : `Rechnung für ${selectedForRechnung.size} Artikel erstellen`
              }>
              <FontAwesomeIcon
                icon={faFileInvoice} className="inventur-mr-6"/>
              {creatingRechnung
                ? "Erstelle Rechnung…"
                : `Rechnung erstellen (${selectedForRechnung.size})`}
            </button>
          </div>
          <div
            className="inventur-modal-actions inventur-flex-gap-8">
            <button
              className="btn btn-primary"
              onClick={handleExcel}
              disabled={exporting || loading}>
              <FontAwesomeIcon icon={faFileExcel} className="inventur-mr-6" />
              {exporting ? "Exportiere…" : "Excel Export"}
            </button>
            <button className="btn btn-secondary" onClick={onClose}>
              Schließen
            </button>
          </div>
        </div>
      </div>
      {schmuckstueckOverlay && (
        <SchmuckstueckModal
          artikelnummer={schmuckstueckOverlay}
          onClose={() => setSchmuckstueckOverlay(null)}
        />
      )}
    </div>
  );
}
