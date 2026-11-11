import { useState, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { formatEur } from "../utils/zahlen";
import { statusBadge, statusVon, STATUS } from "../utils/status";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faList, faTableList, faTableCellsLarge } from "@fortawesome/free-solid-svg-icons";
import { api } from "../api";
import DataTable from "../components/DataTable";
import TableToolbar from "../components/TableToolbar";
import StatusChips from "../components/StatusChips";
import SchmuckstueckModal from "../components/SchmuckstueckModal";
import SchmuckstueckDetailPanel from "../components/SchmuckstueckDetailPanel";
import { useMediaQuery } from "../hooks/useMediaQuery";
import { PANEL_QUERY } from "../utils/breakpoints";
import TablePhoto from "../components/TablePhoto";
import FotoRaster from "../components/FotoRaster";
import { ANSICHT, leseAnsicht, schreibeAnsicht } from "../utils/ansichtSpeicher";
import SchmuckstueckZeile from "../components/SchmuckstueckZeile";
import { useAuth } from "../context/AuthContext";
import Etiketten from "./Etiketten";
import { useToast } from "../components/Toast";
import { STATUS_ALLE, statusListenParams } from "../utils/statusFilter";
import { naechsteVorlagenNummer, naechstesExemplar } from "../utils/artikelnummer";
import {
  BULK_ZEILE,
  createRowId,
  createEmptyMehrfachRow,
  normalisierteZahlenfelder,
  klonbareFelderVon,
  fotoBasis,
  normalizeMehrfachArtikelnummer,
  nachArtikelnummer,
} from "../utils/schmuckstuecke";
import SchmuckstueckFormular from "./schmuckstuecke/SchmuckstueckFormular";
import BulkErfassungModal from "./schmuckstuecke/BulkErfassungModal";

// Pfeiltasten und Esc gehören einem Eingabefeld, solange der Fokus darin liegt.
const EINGABEFELD = 'input, select, textarea, [contenteditable=""], [contenteditable="true"]';
const liegtImEingabefeld = (element) => element instanceof Element && element.closest(EINGABEFELD) !== null;

const ANSICHTEN = [
  { wert: ANSICHT.LISTE, label: "Listenansicht", titel: "Liste", icon: faList },
  { wert: ANSICHT.TABELLE, label: "Tabellenansicht", titel: "Tabelle", icon: faTableList },
  { wert: ANSICHT.RASTER, label: "Rasteransicht", titel: "Foto-Raster", icon: faTableCellsLarge },
];

const TABS = [
  { wert: "schmuckstuecke", label: "Schmuckstücke" },
  { wert: "etiketten", label: "Etiketten" },
];

// Die Tabelle sortiert nach Artikelnummer; die Sortierung stand schon immer fest (Befund G14).
const STANDARD_SORTIERUNG = { key: "Artikelnummer", direction: "asc" };

const textSpalte = (key, label) => ({ key, label, className: "hide-on-mobile", sortable: true });

export default function Schmuckstuecke() {
  const toast = useToast();
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const canEdit = user && (user.role === "admin" || user.role === "bearbeiter");
  const [data, setData] = useState({ data: [], pagination: {} });
  // Anfrage, zu der zuletzt fertig geladen wurde; daraus ergibt sich "lädt"
  const [geladenFuer, setGeladenFuer] = useState(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({});
  const [status, setStatus] = useState(STATUS_ALLE);
  const [statusZahlen, setStatusZahlen] = useState(null);
  // Hersteller-, Grundmaterial- und Produktart-Codes kommen aus
  // backend/src/utils/constants.js und reisen über die Filter-Optionen mit.
  const [filterOptions, setFilterOptions] = useState({});
  const [selected, setSelected] = useState(null);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({});
  const [kunden, setKunden] = useState([]);
  const [activeTab, setActiveTab] = useState("schmuckstuecke");
  // Gespeicherte Wahl hat Vorrang; ohne sie gilt am Rechner (Panel-Breite) die Kompakt-Liste, sonst die Tabelle.
  const [gewaehlteAnsicht, setGewaehlteAnsicht] = useState(leseAnsicht);
  const waehleAnsicht = (neu) => {
    setGewaehlteAnsicht(neu);
    schreibeAnsicht(neu);
  };
  // Vorschau der nächsten freien Artikelnummer, gespeichert mit dem Präfix,
  // für das sie geladen wurde
  const [artikelnummerVorschau, setArtikelnummerVorschau] = useState({
    prefix: "",
    artikelnummer: "",
  });
  const [nextArtikelnummerRefreshKey, setNextArtikelnummerRefreshKey] =
    useState(0);
  // Nur beim Anlegen und nur mit vollständigem Präfix (z. B. "MHO"); sonst
  // gibt es keine Vorschau. Abgeleitet statt im Effekt zurückgesetzt.
  const vorschauPrefix =
    editing === "new"
      ? String(form.Artikelnummer || "").trim().toUpperCase()
      : "";
  const vorschauAktiv = /^[A-Z]{3}$/.test(vorschauPrefix);
  const nextArtikelnummerPreview =
    vorschauAktiv && artikelnummerVorschau.prefix === vorschauPrefix
      ? artikelnummerVorschau.artikelnummer
      : "";

  const [bulkModalOpen, setBulkModalOpen] = useState(false);
  const [bulkEditRowId, setBulkEditRowId] = useState(null);
  const [bulkTemplateArtikelnummer, setBulkTemplateArtikelnummer] =
    useState("");
  const [bulkLoadingTemplate, setBulkLoadingTemplate] = useState(false);
  const [bulkSaving, setBulkSaving] = useState(false);
  const [saving, setSaving] = useState(false);
  const [gebremsteSuche, setGebremsteSuche] = useState("");
  const [ladeZaehler, setLadeZaehler] = useState(0);
  const [bulkRows, setBulkRows] = useState([]);

  // Vorher feuerte jeder Tastendruck einen eigenen Request, ohne Debounce,
  // ohne Abbruch: antwortete Request 2 nach Request 4, ueberschrieb setData
  // die neueren Treffer, und das finally des ersten setzte loading=false,
  // waehrend der letzte noch lief (Befund G8). Das Muster hier ist das aus
  // Etiketten.jsx, das es von Anfang an richtig gemacht hat.
  //
  // neuLaden() erhoeht nur einen Zaehler, den der Lade-Effekt unten als
  // Abhaengigkeit hat – so laeuft auch ein Neuladen nach Speichern/Loeschen
  // durch dieselbe Abbruchlogik.
  const neuLaden = () => setLadeZaehler((n) => n + 1);

  // Löschen und Zurücklagern: erst bestätigen, dann Aufruf, dann Liste neu laden
  const stueckAktion = async (nr, verb, aufruf, { schliesseFormular = false } = {}) => {
    if (!confirm(`Schmuckstück ${nr} wirklich ${verb}?`)) return;
    try {
      await aufruf(nr);
      setSelected(null);
      if (schliesseFormular) setEditing(null);
      neuLaden();
    } catch (err) {
      toast.fehler(err.message);
    }
  };
  const handleDelete = (nr) =>
    stueckAktion(nr, "löschen", (n) => api.deleteSchmuckstueck(n), { schliesseFormular: true });
  const handleZuruecklagern = (nr) =>
    stueckAktion(nr, "zurücklagern", (n) => api.zuruecklagernSchmuckstueck(n));

  const handleSave = async ({ closeAfterSave = true } = {}) => {
    // Ohne diese Sperre erzeugte ein Doppelklick auf "Speichern + Weiter" zwei
    // POSTs mit derselben nextArtikelnummerPreview: sequenziell zwei Datensätze,
    // parallel ein Primary-Key-Konflikt mit rohem DB-Fehler im alert (Befund G4).
    if (saving) return;
    setSaving(true);
    try {
      const dataToSave = { ...form, ...normalisierteZahlenfelder(form) };

      if (editing === "new" && nextArtikelnummerPreview) {
        dataToSave.Artikelnummer = nextArtikelnummerPreview;
      }

      if (editing === "new" && !dataToSave.Artikelnummer) {
        toast.fehler(
          "Bitte Hersteller, Grundmaterial und Produktart auswählen, damit die Artikelnummer erzeugt werden kann.",
        );
        return;
      }

      if (editing === "new") {
        await api.createSchmuckstueck(dataToSave);
        if (!closeAfterSave) {
          setForm((prev) => ({ ...prev, hatFoto: false }));
          setNextArtikelnummerRefreshKey((prev) => prev + 1);
          toast.erfolg(`${dataToSave.Artikelnummer} wurde erstellt.`);
        }
      } else {
        await api.updateSchmuckstueck(editing, dataToSave);
      }
      if (closeAfterSave || editing !== "new") {
        setEditing(null);
      }
      neuLaden();
    } catch (err) {
      toast.fehler(err.message);
    } finally {
      setSaving(false);
    }
  };

  const openNew = () => {
    setForm({
      Artikelnummer: "",
      HerstellerCode: "",
      GrundmaterialCode: "",
      ProduktartCode: "",
      Anzahl: 1,
      Name: "",
      Art: "",
      Material: "",
      Farbe: "",
      Verkaufspreis: 0,
      Herstellungskosten: 0,
      Ausgelagert: 0,
      Verkauft: false,
      Ausschuss: false,
      Ausschuss_Grund: "",
    });
    setEditing("new");
  };

  const openBulkCreate = () => {
    setBulkTemplateArtikelnummer("");
    setBulkRows([]);
    setBulkModalOpen(true);
  };

  const setBulkRowValue = (rowId, field, value) => {
    setBulkRows((prev) =>
      prev.map((row) =>
        row._rowId === rowId ? { ...row, [field]: value } : row,
      ),
    );
  };

  const openBulkRowForm = (row) => {
    const { _rowId, ...felder } = row;
    setForm(felder);
    setBulkEditRowId(_rowId);
    setEditing(BULK_ZEILE);
  };

  // Fotos werden beim Hochladen sofort gespeichert. Wird die Erfassung
  // abgebrochen, müssen sie wieder weg, sonst bleiben sie ohne Schmuckstück liegen.
  // Fotos, die eine andere Zeile derselben Basisnummer noch braucht, bleiben.
  const loescheFotos = async (artikelnummern, verbleibendeZeilen = []) => {
    const gebraucht = new Set(
      verbleibendeZeilen
        .filter((row) => row.fotoArtikelnummer)
        .map((row) => fotoBasis(row.fotoArtikelnummer)),
    );
    const zuLoeschen = [
      ...new Set(
        artikelnummern.filter(Boolean).map(fotoBasis),
      ),
    ].filter((basis) => !gebraucht.has(basis));

    for (const basis of zuLoeschen) {
      try {
        await api.deleteFoto(basis);
      } catch (err) {
        if (err.status === 404) continue;
        toast.fehler(`Foto ${basis} konnte nicht gelöscht werden: ${err.message}`);
      }
    }
  };

  const closeBulkRowForm = () => {
    setEditing(null);
    setBulkEditRowId(null);
  };

  const cancelBulkRowForm = () => {
    const zeile = bulkRows.find((row) => row._rowId === bulkEditRowId);
    // Nur was in diesem Formular hochgeladen wurde, nicht das Foto einer früheren Übernahme.
    const neuHochgeladen =
      form.fotoArtikelnummer && form.fotoArtikelnummer !== zeile?.fotoArtikelnummer
        ? form.fotoArtikelnummer
        : null;
    if (neuHochgeladen) {
      setBulkRows((prev) =>
        prev.map((row) =>
          row._rowId === bulkEditRowId
            ? { ...row, fotoArtikelnummer: undefined }
            : row,
        ),
      );
      loescheFotos([neuHochgeladen], bulkRows.filter((row) => row._rowId !== bulkEditRowId));
    }
    closeBulkRowForm();
  };

  const cancelBulkCreate = () => {
    loescheFotos(bulkRows.map((row) => row.fotoArtikelnummer));
    setBulkModalOpen(false);
  };

  const applyBulkRowForm = () => {
    const felder = { ...form, ...normalisierteZahlenfelder(form) };
    setBulkRows((prev) =>
      prev.map((row) =>
        row._rowId === bulkEditRowId ? { ...row, ...felder } : row,
      ),
    );
    closeBulkRowForm();
  };

  const removeBulkRow = (rowId) => {
    const entfernt = bulkRows.find((row) => row._rowId === rowId);
    if (!entfernt) return;
    const verbleibend = bulkRows.filter((row) => row._rowId !== rowId);
    setBulkRows(verbleibend);
    loescheFotos([entfernt.fotoArtikelnummer], verbleibend);
  };

  const duplicateBulkRow = (rowId) => {
    setBulkRows((prev) => {
      const source = prev.find((row) => row._rowId === rowId);
      if (!source) return prev;

      const copiedRow = {
        ...source,
        _rowId: createRowId(),
        // Gleiche Basisnummer, nächstes Exemplar; das Foto gehört zur Basisnummer.
        Artikelnummer: naechstesExemplar(source.Artikelnummer, prev),
      };

      const insertIndex = prev.findIndex((row) => row._rowId === rowId);
      const next = [...prev];
      next.splice(insertIndex + 1, 0, copiedRow);
      return next;
    });
  };

  const loadBulkTemplate = async () => {
    const input = bulkTemplateArtikelnummer.trim().toUpperCase();
    if (!input) {
      toast.fehler("Bitte eine Artikelnummer als Vorlage eingeben.");
      return;
    }

    try {
      setBulkLoadingTemplate(true);
      let item = null;

      // 1) Direkter Treffer bzw. automatische _1-Ergänzung, falls kein Suffix eingegeben wurde.
      const candidateArtikelnummern = input.includes("_")
        ? [input]
        : [input, `${input}_1`];

      for (const candidate of candidateArtikelnummern) {
        try {
          item = await api.getSchmuckstueck(candidate);
          break;
        } catch {
          // Fallback folgt unten.
        }
      }

      // 2) Fallback: LIKE-ähnliche Suche nach Basisnummer + beliebigem Suffix.
      if (!item && !input.includes("_")) {
        const result = await api.getSchmuckstuecke({
          page: 1,
          limit: 200,
          search: input,
        });

        const suffixVon = (row) =>
          parseInt(String(row.Artikelnummer).split("_")[1] || "0", 10);
        const matchingItems = (result?.data || [])
          .filter((row) =>
            String(row.Artikelnummer || "").startsWith(`${input}_`),
          )
          .sort((a, b) => suffixVon(a) - suffixVon(b));

        if (matchingItems.length > 0) {
          item = await api.getSchmuckstueck(matchingItems[0].Artikelnummer);
        }
      }

      if (!item) {
        throw new Error(
          "Kein passendes Schmuckstück gefunden. Bitte Artikelnummer mit Suffix (z.B. _1) prüfen.",
        );
      }

      const neueZeile = {
        ...createEmptyMehrfachRow(),
        ...klonbareFelderVon(item),
      };

      // Neue Laufnummer vom Server holen. Schlägt das fehl, bleibt die Zeile
      // mit leerer Artikelnummer erhalten und wird von Hand ausgefüllt.
      let serverArtikelnummer = "";
      const prefix = String(item.Artikelnummer || "").slice(0, 3);
      try {
        if (!/^[A-Z]{3}$/.test(prefix)) {
          throw new Error(
            "Aus der Vorlage lässt sich keine neue Artikelnummer ableiten.",
          );
        }
        const next = await api.getNextArtikelnummer(prefix);
        serverArtikelnummer = next?.artikelnummer;
        if (!naechsteVorlagenNummer(prefix, serverArtikelnummer, [])) {
          throw new Error("Der Server lieferte keine gültige Artikelnummer.");
        }
      } catch (err) {
        serverArtikelnummer = "";
        toast.fehler(
          `Neue Artikelnummer konnte nicht vergeben werden: ${err.message}`,
        );
      }

      // Funktionale Form: Die Nummer wird gegen den aktuellen Stand der Zeilen
      // bestimmt, damit zwei schnell geladene Vorlagen nicht dieselbe bekommen.
      setBulkRows((prev) => [
        ...prev,
        {
          ...neueZeile,
          Artikelnummer: naechsteVorlagenNummer(prefix, serverArtikelnummer, prev),
        },
      ]);
    } catch (err) {
      toast.fehler(err.message);
    } finally {
      setBulkLoadingTemplate(false);
    }
  };

  const BULK_FEHLERLISTEN = [
    ["invalidArtikelnummern", "Ungültige Artikelnummern:"],
    ["existingArtikelnummern", "Diese Artikelnummern existieren bereits:"],
    ["duplicateArtikelnummern", "Diese Artikelnummern wurden doppelt eingegeben:"],
  ];

  const handleBulkSave = async () => {
    const items = bulkRows
      .map((row) => {
        const { _rowId, fotoArtikelnummer, ...payloadRow } = row;
        return {
          ...payloadRow,
          Artikelnummer: normalizeMehrfachArtikelnummer(row.Artikelnummer),
        };
      })
      .filter((row) => row.Artikelnummer);

    if (items.length === 0) {
      toast.fehler("Bitte mindestens eine Zeile mit Artikelnummer eintragen.");
      return;
    }

    try {
      setBulkSaving(true);
      const result = await api.createSchmuckstueckeBulk({ items });

      toast.erfolg(
        `${result.createdCount} Schmuckstücke wurden erfolgreich angelegt.`,
      );
      setBulkModalOpen(false);
      neuLaden();
    } catch (err) {
      const payload = err.payload || {};
      const liste = BULK_FEHLERLISTEN.find(([feld]) => Array.isArray(payload[feld]));
      toast.fehler(
        liste ? `${liste[1]}\n${payload[liste[0]].join("\n")}` : err.message,
      );
    } finally {
      setBulkSaving(false);
    }
  };

  const openEdit = (s) => {
    setForm({
      ...s,
      Ausschuss_Grund: s.Ausschuss_Grund || "",
    });
    setEditing(s.Artikelnummer);
  };

  const openDuplicate = (s) => {
    const {
      ID,
      Erstelldatum,
      Letzte_Änderung,
      Lieferschein_ID,
      Rechnung_ID,
      Grundmaterial,
      hatFoto,
      ...copyData
    } = s;
    const baseArtikelnummer = String(s.Artikelnummer || "").split("_")[0];

    setForm({
      ...copyData,
      Artikelnummer: baseArtikelnummer,
      HerstellerCode: baseArtikelnummer[0] || "",
      GrundmaterialCode: baseArtikelnummer[1] || "",
      ProduktartCode: baseArtikelnummer[2] || "",
      Anzahl: 1,
      hatFoto: false,
      Ausgelagert: 0,
      Verkauft: false,
      Ausschuss: false,
      Ausschuss_Grund: "",
    });
    setEditing("new");
  };

  useEffect(() => {
    api.getFilterOptions().then(setFilterOptions).catch((err) => toast.fehler("Fehler beim Laden der Filter-Optionen: " + err.message));
    api.getKunden().then(setKunden).catch((err) => toast.fehler("Fehler beim Laden der Kunden: " + err.message));
  }, [toast]);

  useEffect(() => {
    const timer = setTimeout(() => setGebremsteSuche(search.trim()), 250);
    return () => clearTimeout(timer);
  }, [search]);

  // Der Kunden-Filter kommt zuletzt und gewinnt über den Standort des Status-Chips.
  const listenFilter = useMemo(
    () => ({ ...statusListenParams(status), ...filters }),
    [status, filters],
  );
  const anfrage = JSON.stringify([page, gebremsteSuche, listenFilter, ladeZaehler]);
  const loading = geladenFuer !== anfrage;

  useEffect(() => {
    const abbruch = new AbortController();
    let verworfen = false;
    api
      .getSchmuckstuecke(
        { page, limit: 50, search: gebremsteSuche, ...listenFilter },
        { signal: abbruch.signal },
      )
      .then((antwort) => {
        if (!verworfen) setData(antwort);
      })
      .catch((err) => {
        // Ein abgebrochener Request ist kein Fehler, den der Nutzer sehen muss.
        if (verworfen || err?.name === "AbortError") return;
        toast.fehler("Fehler beim Laden der Schmuckstücke: " + err.message);
      })
      .finally(() => {
        if (!verworfen) setGeladenFuer(anfrage);
      });
    return () => {
      verworfen = true;
      abbruch.abort();
    };
  }, [anfrage, page, gebremsteSuche, listenFilter, ladeZaehler, toast]);

  // Die Zahlen hängen nur an Suche, Produktart und Standort, nicht am gewählten
  // Chip; ladeZaehler holt sie nach jeder Änderung an den Stücken neu.
  const zahlenProduktart = filters.artikelnummer_art;
  const zahlenStandort = filters.ausgelagert;
  useEffect(() => {
    let verworfen = false;
    const params = {
      ...(gebremsteSuche && { search: gebremsteSuche }),
      ...(zahlenProduktart && { artikelnummer_art: zahlenProduktart }),
      ...(zahlenStandort && { ausgelagert: zahlenStandort }),
    };
    api
      .getStatusZahlen(params)
      .then((zahlen) => {
        if (!verworfen) setStatusZahlen(zahlen);
      })
      .catch((err) => {
        if (!verworfen) toast.fehler("Fehler beim Laden der Status-Zahlen: " + err.message);
      });
    return () => {
      verworfen = true;
    };
  }, [gebremsteSuche, zahlenProduktart, zahlenStandort, ladeZaehler, toast]);

  useEffect(() => {
    if (!vorschauAktiv) return undefined;
    let isCancelled = false;
    api
      .getNextArtikelnummer(vorschauPrefix)
      .then((result) => {
        if (isCancelled) return;
        setArtikelnummerVorschau({
          prefix: vorschauPrefix,
          artikelnummer: result.artikelnummer || "",
        });
      })
      .catch(() => {
        if (isCancelled) return;
        setArtikelnummerVorschau({ prefix: vorschauPrefix, artikelnummer: "" });
      });

    return () => {
      isCancelled = true;
    };
  }, [vorschauAktiv, vorschauPrefix, nextArtikelnummerRefreshKey]);

  useEffect(() => {
    const openEditArtikelnummer = location.state?.openEdit;
    const openDuplicateArtikelnummer = location.state?.openDuplicate;
    const targetArtikelnummer =
      openEditArtikelnummer || openDuplicateArtikelnummer;

    if (!targetArtikelnummer) return;

    api
      .getSchmuckstueck(targetArtikelnummer)
      .then((item) => {
        if (openEditArtikelnummer) {
          openEdit(item);
        } else {
          openDuplicate(item);
        }
      })
      .catch((err) => toast.fehler("Fehler beim Laden des Schmuckstücks: " + err.message))
      .finally(() => {
        navigate(location.pathname, { replace: true, state: {} });
      });
  }, [location.pathname, location.state, navigate, toast]);

  const getKundenName = (id) => {
    const kunde = kunden.find((k) => k.ID === id);
    return kunde ? kunde.Name : `Kundennummer ${id}`;
  };

  const p = data.pagination;
  // Breit: Stück-Detail als Panel neben der Liste; schmal: als Fenster
  const panelModus = useMediaQuery(PANEL_QUERY);
  const ansicht = gewaehlteAnsicht ?? (panelModus ? ANSICHT.LISTE : ANSICHT.TABELLE);
  // Das Panel verdeckt die Liste nicht, deshalb pausieren ihre Fotos nur bei einem echten Fenster
  const isForegroundModalOpen =
    (selected !== null && !panelModus) || editing !== null;

  const sortedData = useMemo(() => [...data.data].sort(nachArtikelnummer), [data.data]);

  // Die Tabelle sortiert nach dem angeklickten Spaltenkopf selbst; Pfeiltasten folgen dieser sichtbaren Reihenfolge.
  // Liste und Raster zeigen die Seitenreihenfolge (sortedData).
  const [tabellenReihenfolge, setTabellenReihenfolge] = useState(null);
  const navigationsListe = useMemo(() => {
    if (ansicht !== ANSICHT.TABELLE || !tabellenReihenfolge) return sortedData;
    const nachNummer = new Map(sortedData.map((s) => [s.Artikelnummer, s]));
    const liste = tabellenReihenfolge.map((nr) => nachNummer.get(nr)).filter(Boolean);
    // Veraltet (Daten gerade gewechselt, Tabelle hat noch nicht gemeldet): Seitenreihenfolge nehmen
    return liste.length === sortedData.length ? liste : sortedData;
  }, [ansicht, tabellenReihenfolge, sortedData]);

  // Ist das gewählte Stück nach Filter, Suche oder Seitenwechsel nicht mehr in der Liste, wird die Auswahl aufgehoben.
  // Direkt im Render statt im Effekt (React-Muster "State beim Rendern anpassen").
  if (
    panelModus &&
    selected !== null &&
    !loading &&
    !sortedData.some((s) => s.Artikelnummer === selected.Artikelnummer)
  ) {
    setSelected(null);
  }

  // Pfeil hoch/runter wählt das vorige/nächste Stück, Esc hebt die Auswahl auf (nur mit Panel).
  // Bei offenem Formular oder Fenster und im Eingabefeld bleiben die Tasten unberührt.
  const modalOffen = editing !== null || bulkModalOpen;
  useEffect(() => {
    if (!panelModus || activeTab !== "schmuckstuecke" || modalOffen) return undefined;
    const beiTaste = (e) => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
      if (liegtImEingabefeld(e.target)) return;
      if (e.key === "Escape") {
        setSelected(null);
        return;
      }
      const schritt = e.key === "ArrowDown" ? 1 : e.key === "ArrowUp" ? -1 : 0;
      if (schritt === 0 || navigationsListe.length === 0) return;
      e.preventDefault();
      setSelected((aktuell) => {
        const index = aktuell
          ? navigationsListe.findIndex((s) => s.Artikelnummer === aktuell.Artikelnummer)
          : -1;
        // Ohne Auswahl: runter beginnt oben, hoch unten
        const ziel = index === -1 ? (schritt === 1 ? 0 : navigationsListe.length - 1) : index + schritt;
        return navigationsListe[Math.min(Math.max(ziel, 0), navigationsListe.length - 1)];
      });
    };
    document.addEventListener("keydown", beiTaste);
    return () => document.removeEventListener("keydown", beiTaste);
  }, [panelModus, activeTab, modalOffen, navigationsListe]);


  // Aktionen des gewählten Stücks, gleich für Fenster und Panel
  const stueckAktionen = {
    onClose: () => setSelected(null),
    onDuplicate: canEdit
      ? (item) => {
          setSelected(null);
          item && openDuplicate(item);
        }
      : undefined,
    onEdit: canEdit
      ? () => {
          setSelected(null);
          openEdit(selected);
        }
      : undefined,
    onDelete: canEdit ? () => handleDelete(selected.Artikelnummer) : undefined,
    onZuruecklagern: canEdit ? () => handleZuruecklagern(selected.Artikelnummer) : undefined,
  };

  // Ab Panel-Breite bleiben nur Suche/Filter und Status-Chips beim Scrollen oben stehen (Titel und Reiter scrollen mit);
  // das Panel liegt darunter, die Höhe des fixierten Teils kommt als CSS-Variable
  const kopfFixiert = panelModus && activeTab === "schmuckstuecke";
  const kopfRef = useRef(null);
  const [kopfHoehe, setKopfHoehe] = useState(0);
  useLayoutEffect(() => {
    const kopf = kopfRef.current;
    if (!kopfFixiert || !kopf) {
      setKopfHoehe(0);
      return undefined;
    }
    const messen = () => setKopfHoehe(kopf.offsetHeight);
    messen();
    if (typeof ResizeObserver === "undefined") return undefined;
    const beobachter = new ResizeObserver(messen);
    beobachter.observe(kopf);
    return () => beobachter.disconnect();
  }, [kopfFixiert]);

  return (
    <div style={{ "--schmuck-kopf-hoehe": `${kopfHoehe}px` }}>
      <div className="page-header">
        <div>
          <h2>Schmuckstücke</h2>
          <p>
            {activeTab === "schmuckstuecke"
              ? `${p.total || 0} Stücke insgesamt`
              : "Etiketten erstellen"}
          </p>
        </div>
        {activeTab === "schmuckstuecke" && (
          <div className="schmuckstuecke-flex-gap-10">
          {canEdit && (
            <button className="btn btn-secondary" onClick={openBulkCreate}>
              + Aus Vorlage anlegen
            </button>
          )}
            <button className="btn btn-primary" onClick={openNew}>
              + Neues Schmuckstück
            </button>
            <div className="ansicht-umschalter" role="group" aria-label="Ansicht">
              {ANSICHTEN.map(({ wert, label, titel, icon }) => (
                <button
                  key={wert}
                  type="button"
                  className={`btn btn-sm ${ansicht === wert ? "btn-primary" : "btn-secondary"}`}
                  aria-label={label}
                  title={titel}
                  aria-pressed={ansicht === wert}
                  onClick={() => waehleAnsicht(wert)}>
                  <FontAwesomeIcon icon={icon} />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="schmuckstuecke-flex-gap-8-mb-16">
        {TABS.map(({ wert, label }) => (
          <button
            key={wert}
            className={`btn btn-sm ${activeTab === wert ? "btn-primary" : "btn-secondary"}`}
            onClick={() => setActiveTab(wert)}>
            {label}
          </button>
        ))}
      </div>

      {activeTab === "schmuckstuecke" ? (
        <>
      <div ref={kopfRef} className={kopfFixiert ? "schmuck-kopf schmuck-kopf--fixiert" : "schmuck-kopf"}>
      <TableToolbar
        search={search}
        onSearchChange={(value) => {
          setSearch(value);
          setPage(1);
        }}
        placeholder="Suche nach Artikelnummer, Name, Art, Material..."
        right={
          <div className="filter-group">
            <select
              className="form-control"
              value={filters.artikelnummer_art ?? ""}
              onChange={(e) => {
                const { artikelnummer_art, ...rest } = filters;
                setFilters(
                  e.target.value !== ""
                    ? { ...rest, artikelnummer_art: e.target.value }
                    : rest,
                );
                setPage(1);
              }}>
              <option value="">Alle Arten</option>
              {(filterOptions.produktarten || []).map((option) => (
                <option key={option.code} value={option.code}>
                  {option.label}
                </option>
              ))}
            </select>
            <select
              className="form-control"
              value={filters.ausgelagert ?? ""}
              onChange={(e) => {
                const { ausgelagert, ...rest } = filters;
                const standort = e.target.value;
                setFilters(standort !== "" ? { ...rest, ausgelagert: standort } : rest);
                // Der Standort bestimmt den Status: Lager oder Kunde, sonst widersprechen sich Chip und Zahlen
                if (standort === "0") setStatus(STATUS.LAGER);
                else if (standort !== "") setStatus(STATUS.AUSGELAGERT);
                setPage(1);
              }}>
              <option value="">Alle Standorte</option>
              <option value="0">Lager</option>
              {kunden.map((k) => (
                <option key={k.ID} value={k.ID}>
                  {k.Name}
                </option>
              ))}
            </select>
          </div>
        }
      />

      <StatusChips
        wert={status}
        zahlen={statusZahlen}
        onChange={(neu) => {
          setStatus(neu);
          setFilters(({ ausgelagert, ...rest }) => rest);
          setPage(1);
        }}
      />
      </div>

      <div className={panelModus ? "schmuck-split" : undefined}>
      <div className="card">
        <div className="card-body">
          {loading ? (
            <div className="loading">
              <div className="spinner"></div>Lade...
            </div>
          ) : ansicht === ANSICHT.RASTER ? (
            <FotoRaster
              stuecke={sortedData}
              onSelect={(s) => setSelected(s)}
              pauseLoading={isForegroundModalOpen}
              kundenName={getKundenName}
              aktiveArtikelnummer={panelModus ? (selected?.Artikelnummer ?? null) : undefined}
            />
          ) : ansicht === ANSICHT.LISTE ? (
            sortedData.length === 0 ? (
              <div className="empty-state">Keine Schmuckstücke gefunden.</div>
            ) : (
              <ul className="data-table-mobil">
                {sortedData.map((s) => (
                  <li key={s.Artikelnummer} className="data-table-mobil-item">
                    <SchmuckstueckZeile
                      stueck={s}
                      kundenName={getKundenName}
                      pauseLoading={isForegroundModalOpen}
                      aktiv={panelModus && selected?.Artikelnummer === s.Artikelnummer}
                      onClick={setSelected}
                    />
                  </li>
                ))}
              </ul>
            )
          ) : (
            <DataTable
              data={sortedData}
              getRowKey={(r) => r.Artikelnummer}
              defaultSort={STANDARD_SORTIERUNG}
              onRowClick={(s) => setSelected(s)}
              onSortedChange={setTabellenReihenfolge}
              rowProps={(r) =>
                panelModus && selected?.Artikelnummer === r.Artikelnummer
                  ? { className: "data-table-row-aktiv", "aria-current": "true" }
                  : {}
              }
              mobileRow={(r) => (
                <SchmuckstueckZeile
                  stueck={r}
                  kundenName={getKundenName}
                  pauseLoading={isForegroundModalOpen}
                />
              )}
              columns={[
                {
                  key: "foto",
                  label: "Foto",
                  className: "photo-col",
                  render: (r) => (
                    <TablePhoto
                      hatFoto={r.hatFoto}
                      artikelnummer={r.Artikelnummer}
                      pauseLoading={isForegroundModalOpen}
                    />
                  ),
                },
                {
                  key: "Artikelnummer",
                  label: "Artikelnr.",
                  sortable: true,
                  render: (r) => {
                    const parts = String(r.Artikelnummer).split("_");
                    return (
                      <>
                        <strong>{parts[0]}</strong>
                        {parts[1] > 0 && (
                          <span className="badge warning">{parts[1]}</span>
                        )}
                      </>
                    );
                  },
                },
                textSpalte("Grundmaterial", "Grundmaterial"),
                textSpalte("Art", "Art"),
                textSpalte("Material", "Material"),
                textSpalte("Farbe", "Farbe"),
                textSpalte("Inhalt_Farbe", "Farbe Inhalt"),
                {
                  key: "Verkaufspreis",
                  label: "Preis",
                  sortable: true,
                  render: (r) =>
                    r.Verkaufspreis > 0 ? formatEur(r.Verkaufspreis) : "-",
                },
                {
                  key: "Status",
                  label: "Status",
                  // Nicht sortierbar: das Backend liefert kein Feld "Status", der
                  // Wert wird hier erst aus Verkauft/Ausschuss/Ausgelagert gebildet
                  // (Befund G13).
                  sortable: false,
                  render: (r) => {
                    // Ausgelagerte Stuecke haben in dieser Liste eine eigene
                    // Spalte, hier bleibt die Zelle dafuer leer.
                    if (statusVon(r) === STATUS.AUSGELAGERT) return null;
                    const badge = statusBadge(r);
                    return <span className={badge.klasse}>{badge.label}</span>;
                  },
                },
                {
                  key: "Ausgelagert",
                  label: "Ausgelagert",
                  render: (r) =>
                    r.Ausgelagert > 0 ? (
                      <span className="badge warning">
                        {getKundenName(r.Ausgelagert)}
                      </span>
                    ) : (
                      "-"
                    ),
                },
              ]}
            />
          )}
        </div>
        {p.totalPages > 1 && (
          <div className="pagination">
            <button disabled={page <= 1} onClick={() => setPage(page - 1)}>
              ← Zurück
            </button>
            <span className="page-info">
              Seite {page} von {p.totalPages}
            </span>
            <button
              disabled={page >= p.totalPages}
              onClick={() => setPage(page + 1)}>
              Weiter →
            </button>
          </div>
        )}
      </div>

      {panelModus && (
        <aside className="schmuck-panel" aria-label="Details des gewählten Stücks">
          {selected ? (
            <SchmuckstueckDetailPanel
              artikelnummer={selected.Artikelnummer}
              schliessenLabel="Auswahl aufheben"
              {...stueckAktionen}
            />
          ) : (
            <p className="schmuck-panel-hinweis">Stück in der Liste auswählen, um Details zu sehen.</p>
          )}
        </aside>
      )}
      </div>

      {selected && !panelModus && (
        <SchmuckstueckModal artikelnummer={selected.Artikelnummer} {...stueckAktionen} />
      )}

      {bulkModalOpen && (
        <BulkErfassungModal
          rows={bulkRows}
          vorlage={bulkTemplateArtikelnummer}
          setVorlage={setBulkTemplateArtikelnummer}
          ladeVorlage={loadBulkTemplate}
          laedtVorlage={bulkLoadingTemplate}
          saving={bulkSaving}
          filterOptions={filterOptions}
          onAbbrechen={cancelBulkCreate}
          onSpeichern={handleBulkSave}
          onWert={setBulkRowValue}
          onZeileBearbeiten={openBulkRowForm}
          onZeileKopieren={duplicateBulkRow}
          onZeileLoeschen={removeBulkRow}
        />
      )}

      {editing !== null && (
        <SchmuckstueckFormular
          editing={editing}
          form={form}
          setForm={setForm}
          filterOptions={filterOptions}
          kunden={kunden}
          saving={saving}
          nextArtikelnummerPreview={nextArtikelnummerPreview}
          onAbbrechen={editing === BULK_ZEILE ? cancelBulkRowForm : () => setEditing(null)}
          onUebernehmen={applyBulkRowForm}
          onSpeichern={handleSave}
        />
      )}
        </>
      ) : (
        <Etiketten showHeader={false} />
      )}
    </div>
  );
}
