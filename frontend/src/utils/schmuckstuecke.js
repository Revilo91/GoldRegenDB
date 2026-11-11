import { parseZahlOderNull } from "./zahlen";

// Wert von `editing`, wenn das große Formular eine Zeile der Vorlagen-Tabelle bearbeitet.
export const BULK_ZEILE = "bulk-zeile";

export const createRowId = () =>
  `row-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

export const createEmptyMehrfachRow = () => ({
  _rowId: createRowId(),
  Artikelnummer: "",
  Name: "",
  Art: "",
  Material: "",
  Farbe: "",
  Verkaufspreis: 0,
  Herstellungskosten: 0,
  Form: "",
  Fassung: "",
});

// Die Zahlenfelder halten während der Eingabe den rohen Text, damit beim Tippen
// von "12,50" nicht nach dem Komma der Wert wegspringt. Erst beim Speichern wird
// normalisiert: leer oder unlesbar ergibt 0, nicht NaN. parseFloat("") war NaN,
// und JSON.stringify macht daraus null – das landete als explizites NULL in der
// Datenbank und löschte den Preis stillschweigend (Befund D1/D2).
const ZAHLENFELDER = [
  "Verkaufspreis",
  "Herstellungskosten",
  "Grösse",
  "Länge",
  "Anhänger_Grösse",
];

export const normalisierteZahlenfelder = (form) =>
  Object.fromEntries(
    ZAHLENFELDER.filter((feld) => feld in form).map((feld) => [
      feld,
      parseZahlOderNull(form[feld], 0),
    ]),
  );

// Beschreibende Felder, die beim Anlegen aus einer Vorlage mitkommen. Bewusst
// eine Positivliste: ID, Datum, Belege, Status und Foto gehören dem Original.
const KLONBARE_FELDER = [
  "Name",
  "Art",
  "Material",
  "Farbe",
  "Form",
  "Fassung",
  "Länge",
  "Grösse",
  "Inhalt_Material",
  "Inhalt_Farbe",
  "Inhalt_Farbakzent",
  "Inhalt_Zusatzmaterial",
  "Anhänger",
  "Anhänger_Fassung",
  "Anhänger_Form",
  "Anhänger_Farbe",
  "Anhänger_Grösse",
  "Anhänger_Inhalt_Material",
  "Anhänger_Inhalt_Farbe",
  "Anhänger_Inhalt_Farbakzente",
  "Anhänger_Inhalt_Zusatzmaterial",
  "Zwischenstück",
  "Herstellungskosten",
  "Verkaufspreis",
];

export const klonbareFelderVon = (item) =>
  Object.fromEntries(
    KLONBARE_FELDER.map((feld) => [
      feld,
      item[feld] ?? (ZAHLENFELDER.includes(feld) ? 0 : ""),
    ]),
  );

// Foto und Artikelnummer teilen sich die Basisnummer: MHO127_1 und MHO127_2 haben ein Foto.
export const fotoBasis = (artikelnummer) => String(artikelnummer).split("_")[0];

// Wenn nur die Basisnummer eingegeben wurde, beim Speichern automatisch _1 setzen.
export const normalizeMehrfachArtikelnummer = (value) => {
  const normalized = String(value || "").trim().toUpperCase();
  return /^[A-Z]{3}\d{3}$/.test(normalized) ? `${normalized}_1` : normalized;
};

// Seitenreihenfolge der Liste: aufsteigend nach Artikelnummer, Zahlen numerisch.
export const nachArtikelnummer = (a, b) =>
  a.Artikelnummer.localeCompare(b.Artikelnummer, undefined, { numeric: true });
