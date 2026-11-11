'use strict';

/**
 * Tests für backend/src/middleware/validate.js und backend/src/schemas
 *
 * Zwei Risiken werden hier abgesichert:
 *  1. Zu lasch – ungültige Werte erreichen die Datenbank (Zweck von Issue #136)
 *  2. Zu streng – die bestehenden Frontend-Payloads werden abgelehnt und die
 *     Anwendung ist kaputt. Deshalb prüft jeder Block auch den Gutfall mit
 *     genau der Struktur, die das React-Frontend heute sendet.
 */

jest.mock('../src/utils/logger', () => require('./helpers/dbMock').createLoggerMock());

const request = require('supertest');
const express = require('express');
const { validate } = require('../src/middleware/validate');
const schemas = require('../src/schemas');

// Baut eine Mini-App, die den geparsten Body zurückgibt
function buildApp(schema) {
  const app = express();
  app.use(express.json());
  app.post('/', validate(schema), (req, res) => res.json(req.body));
  return app;
}

function post(schema, body) {
  return request(buildApp(schema)).post('/').send(body);
}

// ── validate-Middleware ──────────────────────────────────────────────────────

describe('validate-Middleware', () => {
  it('antwortet mit 400 und nennt das fehlerhafte Feld', async () => {
    const res = await post(schemas.kundeSchema, { Name: '' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/^Name:/);
  });

  it('liefert alle Fehler in details', async () => {
    const res = await post(schemas.kundeSchema, {});
    expect(res.status).toBe(400);
    expect(Array.isArray(res.body.details)).toBe(true);
    expect(res.body.details.length).toBeGreaterThan(1);
  });

  it('entfernt unbekannte Felder aus dem Body', async () => {
    const res = await post(schemas.kundeSchema, {
      Name: 'Testkunde', Strasse: 'Hauptstr', Hausnummer: 1, Ort: 'Berlin', PLZ: 10115,
      Provision: 10, Aktiv: true,
      istAdmin: true, '"; DROP TABLE "Kunde"; --': 'x',
    });
    expect(res.status).toBe(200);
    expect(res.body.istAdmin).toBeUndefined();
    expect(Object.keys(res.body)).not.toContain('"; DROP TABLE "Kunde"; --');
  });
});

// ── Kunde ────────────────────────────────────────────────────────────────────

describe('kundeSchema', () => {
  const gueltig = {
    Name: 'Goldschmiede Meyer', Strasse: 'Hauptstraße', Hausnummer: 12,
    Ort: 'Hamburg', PLZ: 20095, Email: 'kontakt@meyer.de',
    Telefonnummer: '040 123456', Provision: 15, Aktiv: true,
  };

  it('akzeptiert den Payload des Kunden-Formulars', async () => {
    const res = await post(schemas.kundeSchema, gueltig);
    expect(res.status).toBe(200);
    expect(res.body.Name).toBe('Goldschmiede Meyer');
  });

  it('akzeptiert Zahlenfelder als String (HTML-Formular)', async () => {
    const res = await post(schemas.kundeSchema, { ...gueltig, Hausnummer: '12', PLZ: '20095', Provision: '15' });
    expect(res.status).toBe(200);
    expect(res.body.Hausnummer).toBe('12');
    expect(res.body.PLZ).toBe(20095);
  });

  it('akzeptiert Hausnummern mit Buchstaben-Zusatz (Issue #211)', async () => {
    for (const nr of ['12a', '3-5b', '104 1/2']) {
      const res = await post(schemas.kundeSchema, { ...gueltig, Hausnummer: nr });
      expect(res.status).toBe(200);
      expect(res.body.Hausnummer).toBe(nr);
    }
  });

  it('macht aus fehlender Hausnummer einen Leerstring (Spalte ist NOT NULL)', async () => {
    const { Hausnummer: _weg, ...ohne } = gueltig;
    const res = await post(schemas.kundeSchema, ohne);
    expect(res.status).toBe(200);
    expect(res.body.Hausnummer).toBe('');
  });

  it('wandelt leere optionale Felder in null', async () => {
    const res = await post(schemas.kundeSchema, { ...gueltig, Email: '', Telefonnummer: '' });
    expect(res.status).toBe(200);
    expect(res.body.Email).toBeNull();
    expect(res.body.Telefonnummer).toBeNull();
  });
});

describe('Schmuckstück-Schemas', () => {
  it('akzeptiert eine Kurz-Artikelnummer (Präfix)', async () => {
    const res = await post(schemas.schmuckstueckCreateSchema, { Artikelnummer: 'MHO', Anzahl: 3 });
    expect(res.status).toBe(200);
    expect(res.body.Anzahl).toBe(3);
  });

  it('akzeptiert Preise als String', async () => {
    const res = await post(schemas.schmuckstueckCreateSchema, {
      Artikelnummer: 'MHO123', Verkaufspreis: '49.90', Herstellungskosten: '12',
    });
    expect(res.status).toBe(200);
    expect(res.body.Verkaufspreis).toBe(49.9);
  });

  it('akzeptiert Preise mit deutschem Dezimalkomma', async () => {
    // Befund D2: Number("12,50") ist NaN, die Validierung lehnte deutsche
    // Eingaben deshalb mit "muss eine Zahl sein" ab.
    const res = await post(schemas.schmuckstueckCreateSchema, {
      Artikelnummer: 'MHO123', Verkaufspreis: '12,50', Herstellungskosten: '3,75',
    });
    expect(res.status).toBe(200);
    expect(res.body.Verkaufspreis).toBe(12.5);
    expect(res.body.Herstellungskosten).toBe(3.75);
  });

  it('begrenzt Verkauft/Ausschuss auf 0 oder 1', async () => {
    const ok = await post(schemas.schmuckstueckUpdateSchema, { Verkauft: 1, Ausschuss: 0 });
    expect(ok.status).toBe(200);
    const res = await post(schemas.schmuckstueckUpdateSchema, { Verkauft: 7 });
    expect(res.status).toBe(400);
  });

  it('akzeptiert die items-Variante (Bulk)', async () => {
    const res = await post(schemas.schmuckstueckBulkSchema, {
      items: [{ Artikelnummer: 'MHO123_1', Verkaufspreis: 20 }],
    });
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
  });

  it('akzeptiert die template-Variante (Bulk)', async () => {
    const res = await post(schemas.schmuckstueckBulkSchema, {
      template: { Art: 'Kette', Verkaufspreis: 20 },
      artikelnummern: ['MHO123_1', 'MHO123_2'],
    });
    expect(res.status).toBe(200);
    expect(res.body.artikelnummern).toHaveLength(2);
  });
});

describe('lieferschein-/rechnungSchema', () => {
  it('akzeptiert den Payload des DocumentManagers', async () => {
    const res = await post(schemas.rechnungSchema, {
      Nummer: 'R-2026-001', Kundennummer: 4, status: 'final',
      Artikelnummern: ['MHO123_1', 'MHO124_2'],
      rabatt_gesamt: 10, rabatt_positionen: { MHO123: 5 },
    });
    expect(res.status).toBe(200);
    expect(res.body.rabatt_positionen.MHO123).toBe(5);
  });
});

describe('Bestellung: Honeypot', () => {
  it('behält das Honeypot-Feld, damit die Route es prüfen kann', async () => {
    const res = await post(schemas.bestellungPublicSchema, { ...BESTELLUNG, webseite: 'bot' });
    expect(res.status).toBe(200);
    expect(res.body.webseite).toBe('bot');
  });

  it('akzeptiert PLZ und Hausnummer auch als Zahl', async () => {
    const res = await post(schemas.bestellungPublicSchema, {
      ...BESTELLUNG, versandart: 'lieferung',
      kunde: { ...BESTELLUNG.kunde, strasse: 'Weg', hausnummer: 7, plz: 20095, ort: 'Hamburg', telefonnummer: '040' },
    });
    expect(res.status).toBe(200);
    expect(res.body.kunde.plz).toBe('20095');
  });
});

// Reine Status-Prüfungen: [Name, Schema, Body, Fehlertext-Regex oder null]
const PASSWORT = 'ein-sicheres-passwort';
const KUNDE = {
  Name: 'Goldschmiede Meyer', Strasse: 'Hauptstraße', Hausnummer: 12,
  Ort: 'Hamburg', PLZ: 20095, Email: 'kontakt@meyer.de',
  Telefonnummer: '040 123456', Provision: 15, Aktiv: true,
};
const BESTELLUNG = {
  versandart: 'abholung',
  wunschdatum: null,
  beschreibung: 'Ring mit Aquamarin',
  kunde: { name: 'Anna', email: 'anna@example.com', telefonnummer: '', strasse: '', hausnummer: '', plz: '', ort: '' },
  consent: { erteilt: true },
};
const ARTIKEL_200 = Array.from({ length: 201 }, (_, i) => ({ Artikelnummer: `MHO123_${i}` }));

describe('Schemas lehnen ungültige Eingaben ab (400)', () => {
  it.each([
    ['Kunde: Hausnummer über 20 Zeichen', 'kundeSchema', { ...KUNDE, Hausnummer: 'x'.repeat(21) }, /Hausnummer/],
    ['Kunde: ungültige E-Mail', 'kundeSchema', { ...KUNDE, Email: 'keine-email' }, /Email/],
    ['Kunde: Provision über 100 %', 'kundeSchema', { ...KUNDE, Provision: 250 }, null],
    ['Kunde: zu langer Name', 'kundeSchema', { ...KUNDE, Name: 'a'.repeat(101) }, null],
    ['Kunde: leerer Pflichtname', 'kundeSchema', { ...KUNDE, Name: '   ' }, null],
    ['Schmuckstück: negativer Verkaufspreis', 'schmuckstueckCreateSchema', { Artikelnummer: 'MHO123', Verkaufspreis: -5 }, null],
    ['Schmuckstück: nicht-numerischer Preis', 'schmuckstueckCreateSchema', { Artikelnummer: 'MHO123', Verkaufspreis: 'teuer' }, null],
    ['Schmuckstück: fehlende Artikelnummer', 'schmuckstueckCreateSchema', { Name: 'Kette' }, /Artikelnummer/],
    ['Schmuckstück: Artikelnummer zu lang (VARCHAR(20))', 'schmuckstueckCreateSchema', { Artikelnummer: 'M'.repeat(21) }, null],
    ['Schmuckstück: Menge über 200', 'schmuckstueckCreateSchema', { Artikelnummer: 'MHO', Anzahl: 500 }, null],
    ['Bulk: mehr als 200 Einträge', 'schmuckstueckBulkSchema', { items: ARTIKEL_200 }, null],
    ['Beleg: unbekannter Status', 'lieferscheinSchema', { Kundennummer: 4, status: 'geloescht' }, /status/],
    ['Beleg: Rabatt über 100 %', 'rechnungSchema', { Kundennummer: 4, rabatt_gesamt: 150 }, null],
    ['Beleg: ungültige Artikelnummer in der Positionsliste', 'lieferscheinSchema', { Kundennummer: 4, Artikelnummern: ["MHO123_1'; DROP TABLE x; --"] }, null],
    ['User: unbekannte Rolle', 'userCreateSchema', { username: 'x', password: PASSWORT, role: 'superadmin' }, /role/],
    ['User: zu kurzes neues Passwort', 'userCreateSchema', { username: 'x', password: 'kurz', role: 'user' }, /mindestens/],
    ['Login: leeres Passwort', 'loginSchema', { username: 'admin', password: '' }, null],
    ['Passwortwechsel: fehlt das neue Passwort', 'changePasswordSchema', { currentPassword: PASSWORT }, null],
    ['Bestellung: unbekannte Versandart', 'bestellungPublicSchema', { ...BESTELLUNG, versandart: 'drohne' }, null],
    ['Bestellung: leere Beschreibung', 'bestellungPublicSchema', { ...BESTELLUNG, beschreibung: '   ' }, null],
    ['Bestellung: Beschreibung über 2000 Zeichen', 'bestellungPublicSchema', { ...BESTELLUNG, beschreibung: 'x'.repeat(2001) }, null],
    ['Bestellung: ungültiges Wunschdatum', 'bestellungPublicSchema', { ...BESTELLUNG, wunschdatum: '31.12.2026' }, null],
    ['Lagerinventur: Menge 0', 'lagerinventurSchema', { data: { MHO123_1: 0 } }, null],
    ['Lagerinventur: nicht-numerische Menge', 'lagerinventurSchema', { data: { MHO123_1: 'viele' } }, null],
    ['Debug: Bezeichner mit Sonderzeichen (werden interpoliert)', 'debugUpdateSchema', { primaryKey: 'ID', id: 1, field: 'Name" = \'x\'; --', value: 'y' }, null],
    ['SumUp: leerer Import', 'sumupImportSchema', { csvData: '' }, null],
  ])('%s', async (_name, schemaName, body, fehler) => {
    const res = await post(schemas[schemaName], body);
    expect(res.status).toBe(400);
    if (fehler) expect(res.body.error).toMatch(fehler);
  });
});

describe('Schemas akzeptieren die Frontend-Payloads (200)', () => {
  it.each([
    ['Beleg: leerer Entwurf ohne Nummer', 'lieferscheinSchema', { Nummer: '', Kundennummer: 4, status: 'entwurf' }],
    ['User: gültiger Benutzer', 'userCreateSchema', { username: 'marina', password: PASSWORT, email: 'm@goldregen.local', role: 'bearbeiter', active: true }],
    ['Login: kurzes Passwort von Altkonten', 'loginSchema', { username: 'admin', password: 'admin' }],
    ['Bestellung: Payload des öffentlichen Formulars', 'bestellungPublicSchema', BESTELLUNG],
    ['Lagerinventur: leerer Entwurf', 'lagerinventurSchema', { data: {}, kommentar: '' }],
    ['Lagerinventur: gezählte Mengen', 'lagerinventurSchema', { data: { MHO123_1: 3, MHO124_2: 1 }, kommentar: 'Regal 2' }],
    ['Debug: Zellenänderung', 'debugUpdateSchema', { primaryKey: 'Artikelnummer', id: 'MHO123_1', field: 'Name', value: 'Kette' }],
    ['SumUp: CSV-String', 'sumupImportSchema', { csvData: 'Datum,Betrag\n2026-01-01,10' }],
  ])('%s', async (_name, schemaName, body) => {
    const res = await post(schemas[schemaName], body);
    expect(res.status).toBe(200);
  });
});

// Befund D3/D4: der Regex erlaubte [A-Za-zÄÖÜäöü], die Suffix-Generierung in
// schmuckstuecke.js prüfte aber /^[A-Z]{3}\d{3}$/ -- zwei Wahrheiten über das
// Format desselben Primärschlüssels. Und normalisiert wurde an elf verstreuten
// Stellen, mit Lücken: ein Stück als 'mho123' in der Datenbank erschien in
// KEINEM Hersteller-, Grundmaterial- oder Produktartfilter und existierte als
// zweite Zeile für dasselbe physische Schmuckstück.
describe('Artikelnummer-Normalisierung (D3, D4)', () => {
  const { artikelnummer, vollstaendigeArtikelnummer } = require('../src/schemas/common');

  it('macht Großbuchstaben, an genau dieser Stelle', () => {
    expect(artikelnummer.parse('mho123')).toBe('MHO123');
    expect(artikelnummer.parse(' mho123_2 ')).toBe('MHO123_2');
    expect(vollstaendigeArtikelnummer.parse('mho123_2')).toBe('MHO123_2');
  });

  it('lässt eine schon normalisierte Nummer unverändert', () => {
    expect(vollstaendigeArtikelnummer.parse('MHO123')).toBe('MHO123');
  });

  it('lehnt Umlaute ab – GRUNDMATERIAL und PRODUKTART kennen nur ASCII', () => {
    expect(vollstaendigeArtikelnummer.safeParse('MÄO123').success).toBe(false);
    expect(vollstaendigeArtikelnummer.safeParse('mäo123').success).toBe(false);
  });

  it('lehnt unvollständige Formen im strengen Schema ab', () => {
    expect(vollstaendigeArtikelnummer.safeParse('MHO').success).toBe(false);
    expect(vollstaendigeArtikelnummer.safeParse('MHO12').success).toBe(false);
    expect(vollstaendigeArtikelnummer.safeParse('MHO123_').success).toBe(false);
  });

  it('erlaubt die Kurzformen im lockeren Schema (das Anlegen braucht sie)', () => {
    expect(artikelnummer.parse('mho')).toBe('MHO');
    expect(artikelnummer.parse('mho123')).toBe('MHO123');
  });
});
