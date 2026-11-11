'use strict';

// Deckt die auf Geschwindigkeit umgebauten Endpunkte ab: die Listenabfrage
// ermittelt die Gesamtzahl jetzt per Fensterfunktion statt separatem COUNT,
// filter-options aggregiert alle Spalten in einer einzigen Abfrage.

process.env.JWT_SECRET = 'test-secret-do-not-use-in-prod';

const express = require('express');
const request = require('supertest');

const { buildTestApp } = require('./helpers/buildTestApp');

jest.mock('../src/config/db', () => require('./helpers/dbMock').createDbMock());

jest.mock('../src/utils/logger', () => require('./helpers/dbMock').createLoggerMock());

const db = require('../src/config/db');
const { where } = require('../src/utils/whereClauseBuilder');
const { authenticate } = require('../src/middleware/auth');
const schmuckstueckeRoutes = require('../src/routes/schmuckstuecke');

const app = buildTestApp({
  router: schmuckstueckeRoutes,
  mountPath: '/api/schmuckstuecke',
  user: { id: 1, username: 'testuser', role: 'bearbeiter' },
});

beforeEach(() => jest.clearAllMocks());

describe('GET /api/schmuckstuecke', () => {
  it('liest die Gesamtzahl aus der Fensterfunktion und braucht nur eine Abfrage', async () => {
    db.query.mockResolvedValueOnce({
      rows: [
        { Artikelnummer: 'MPO001', __total: '42' },
        { Artikelnummer: 'MPO002', __total: '42' },
      ],
    });

    const res = await request(app).get('/api/schmuckstuecke?page=1&limit=50');

    expect(res.statusCode).toBe(200);
    expect(db.query).toHaveBeenCalledTimes(1);
    expect(res.body.pagination).toMatchObject({ page: 1, limit: 50, total: 42, totalPages: 1 });
    expect(res.body.data).toHaveLength(2);
    // Interne Hilfsspalte darf nicht nach außen gelangen
    expect(res.body.data[0]).not.toHaveProperty('__total');
    expect(res.body.data[0].Grundmaterial).toBe('Perle');
  });

  it('meldet total 0, wenn keine Treffer auf der ersten Seite liegen', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app).get('/api/schmuckstuecke?page=1&limit=50');

    expect(res.statusCode).toBe(200);
    expect(db.query).toHaveBeenCalledTimes(1);
    expect(res.body.pagination.total).toBe(0);
  });

  it('zählt separat nach, wenn eine Seite hinter dem Ende angefragt wird', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ count: '42' }] });

    const res = await request(app).get('/api/schmuckstuecke?page=5&limit=50');

    expect(res.statusCode).toBe(200);
    expect(db.query).toHaveBeenCalledTimes(2);
    expect(db.query.mock.calls[1][0]).toContain('COUNT(*)');
    expect(res.body.pagination.total).toBe(42);
  });

  it('liefert hatFoto aus der Tabelle "Foto", ohne Bilddaten zu laden', async () => {
    db.query.mockResolvedValueOnce({
      rows: [
        { Artikelnummer: 'MPO001_2', hatFoto: true, __total: '2' },
        { Artikelnummer: 'MPO777', hatFoto: false, __total: '2' },
      ],
    });

    const res = await request(app).get('/api/schmuckstuecke?page=1&limit=50');

    const sql = db.query.mock.calls[0][0];
    expect(sql).toContain(`split_part("Schmuckstück"."Artikelnummer", '_', 1)`);
    expect(sql).toContain('AS "hatFoto"');
    expect(sql).not.toContain('"Daten"');
    expect(res.body.data.map((s) => s.hatFoto)).toEqual([true, false]);
    expect(res.body.data[0]).not.toHaveProperty('Foto');
  });

  it('lädt bei limit=-1 ohne LIMIT/OFFSET', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ Artikelnummer: 'MPO001', __total: '1' }] });

    const res = await request(app).get('/api/schmuckstuecke?limit=-1');

    expect(res.statusCode).toBe(200);
    expect(db.query.mock.calls[0][0]).not.toContain('LIMIT');
    expect(res.body.pagination.total).toBe(1);
  });

  it('liefert bei ausgelagert=0,15 Lager und Kunde zusammen (Direktverkauf)', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app).get('/api/schmuckstuecke?ausgelagert=0,15&verkauft=0&limit=-1');

    expect(res.statusCode).toBe(200);
    expect(db.query.mock.calls[0][0]).toContain('"Ausgelagert" = ANY(');
    expect(db.query.mock.calls[0][1]).toContainEqual([0, 15]);
  });

  it('filtert bei ausgelagert=kunden auf Ausgelagert > 0, Suche behält $1', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app).get('/api/schmuckstuecke?search=Rosa&ausgelagert=kunden&verkauft=0&ausschuss=0&limit=-1');

    expect(res.statusCode).toBe(200);
    const sql = db.query.mock.calls[0][0];
    expect(sql).toContain('"Ausgelagert" > 0');
    expect(sql).toContain('ILIKE $1');
    expect(db.query.mock.calls[0][1]).toEqual(['%Rosa%']);
  });

  it.each(['kunden,5', 'Kunden', '0,', 'a,15', '0,-1'])('lehnt ausgelagert=%s ab (400)', async (wert) => {
    const res = await request(app).get(`/api/schmuckstuecke?ausgelagert=${wert}`);

    expect(res.statusCode).toBe(400);
    expect(db.query).not.toHaveBeenCalled();
  });
});

describe('GET /api/schmuckstuecke/filter-options', () => {
  it('holt alle Filterwerte mit einer einzigen Abfrage und sortiert sie', async () => {
    db.query.mockResolvedValueOnce({
      rows: [{
        arten: ['Ohrring', 'Armband', 'Kette'],
        laengen: [42, 18, 60],
        farben: null,
      }],
    });

    const res = await request(app).get('/api/schmuckstuecke/filter-options');

    expect(res.statusCode).toBe(200);
    expect(db.query).toHaveBeenCalledTimes(1);
    expect(res.body.arten).toEqual(['Armband', 'Kette', 'Ohrring']);
    expect(res.body.laengen).toEqual([18, 42, 60]);
    // array_agg liefert NULL statt eines leeren Arrays
    expect(res.body.farben).toEqual([]);
    expect(res.body.ausschussgruende).toEqual([]);
  });

  it('liefert bei leerer Tabelle für jedes Datenfeld ein leeres Array', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app).get('/api/schmuckstuecke/filter-options');

    expect(res.statusCode).toBe(200);
    // grundmaterialien/produktarten sind Konstanten aus utils/constants.js und
    // hängen nicht am Datenbestand (Befund G22).
    const { grundmaterialien, produktarten, ...datenFelder } = res.body;
    expect(Object.values(datenFelder).every((wert) => Array.isArray(wert) && wert.length === 0)).toBe(true);
    expect(grundmaterialien.length).toBeGreaterThan(0);
    expect(produktarten.length).toBeGreaterThan(0);
  });

  // Befund G22: GRUNDMATERIAL und PRODUKTART lagen vierfach im Projekt. Die
  // einzige Quelle ist utils/constants.js; das Frontend holt sie über diese
  // Antwort, die es beim Mount ohnehin schon lädt.
  it('liefert GRUNDMATERIAL und PRODUKTART aus utils/constants.js mit', async () => {
    const { GRUNDMATERIAL, PRODUKTART } = require('../src/utils/constants');
    db.query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app).get('/api/schmuckstuecke/filter-options');

    expect(res.body.grundmaterialien).toEqual(
      Object.entries(GRUNDMATERIAL).map(([code, label]) => ({ code, label })),
    );
    expect(res.body.produktarten).toEqual(
      Object.entries(PRODUKTART).map(([code, label]) => ({ code, label })),
    );
  });
});

describe('PUT /api/schmuckstuecke/:artikelnummer', () => {
  // Befund C8: "Ausgelagert", "Verkauft", "Ausschuss", "Lieferschein_ID" und
  // "Rechnung_ID" standen ohne COALESCE im SET. Weil sie im Schema .nullish()
  // sind, schrieb ein PUT ohne diese Felder NULL -- danach passte das Stück auf
  // keine Statusbedingung mehr und fiel aus Liste, Dashboard, Inventur und
  // SumUp-Export heraus.
  it('lässt Statusfelder unangetastet, wenn der Request sie nicht schickt', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ Artikelnummer: 'MPO001' }] });

    const res = await request(app)
      .put('/api/schmuckstuecke/MPO001')
      .send({ Artikelnummer: 'MPO001', Name: 'Neuer Name' });

    expect(res.statusCode).toBe(200);
    const sql = String(db.query.mock.calls[0][0]);
    const geschuetzt = [
      'Ausgelagert', 'Verkauft', 'Ausschuss', 'Lieferschein_ID', 'Rechnung_ID',
      // Die Geldspalten sind seit Befund B1 ebenfalls NOT NULL. Ohne COALESCE
      // loeschte ein PUT ohne Preis den Preis still -- und der Audit-Trigger
      // protokolliert Preisaenderungen nicht, die Spur fehlte also auch.
      'Verkaufspreis', 'Herstellungskosten',
    ];
    for (const spalte of geschuetzt) {
      expect(sql).toMatch(new RegExp(`"${spalte}" = COALESCE\\(\\$\\d+, "${spalte}"\\)`));
    }
  });

  it('schreibt Verkauft/Ausschuss als boolean, nicht als 0/1', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ Artikelnummer: 'MPO001' }] });

    await request(app)
      .put('/api/schmuckstuecke/MPO001')
      .send({ Artikelnummer: 'MPO001', Verkauft: 1, Ausschuss: 0 });

    // bool() in schemas/common.js nimmt 0/1 entgegen und macht daraus
    // true/false -- die Spalten sind boolean (Befund B6).
    const params = db.query.mock.calls[0][1];
    expect(params[25]).toBe(true);   // $26 Verkauft
    expect(params[26]).toBe(false);  // $27 Ausschuss
  });

  it('meldet 404 bei unbekannter Artikelnummer', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .put('/api/schmuckstuecke/MPO999')
      .send({ Artikelnummer: 'MPO999', Name: 'x' });

    expect(res.statusCode).toBe(404);
  });

  it('schreibt keine Spalte Foto, auch wenn der Client noch eine schickt', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ Artikelnummer: 'MPO001_2' }] });

    await request(app)
      .put('/api/schmuckstuecke/MPO001_2')
      .send({ Artikelnummer: 'MPO001_2', Name: 'x', Foto: 'alt.jpg' });

    expect(db.query).toHaveBeenCalledTimes(1);
    expect(db.query.mock.calls[0][0]).not.toContain('"Foto"');
    expect(db.query.mock.calls[0][1]).not.toContain('alt.jpg');
  });
});

describe('POST /api/schmuckstuecke (Duplizieren)', () => {
  // Befund C11: der Kommentar sagte "Daten von Produkt holen, sobald das form
  // nicht ausgefüllt ist" -- geprüft wurde das nie. Die Bedingung war
  // `if (b.Artikelnummer)`, und Artikelnummer ist Pflichtfeld, also immer wahr.
  // Wer ein weiteres Exemplar mit korrigiertem Preis anlegte, bekam
  // stillschweigend den Preis des Vorgängers.
  function clientMitVorgaenger(vorgaenger) {
    return {
      query: jest.fn(async (sql) => {
        const text = String(sql);
        if (text.includes('MAX(CAST(SUBSTRING')) return { rows: [{ max_num: 111 }] };
        if (text.includes('max_suffix')) return { rows: [{ max_suffix: 1 }] };
        if (text.includes("|| '_' ||")) return { rows: [vorgaenger] };
        if (text.startsWith('INSERT INTO "Schmuckstück"')) {
          return { rows: [{ Artikelnummer: 'MHO123_2' }] };
        }
        return { rows: [], rowCount: 0 };
      }),
      release: jest.fn(),
    };
  }

  const VORGAENGER = {
    Name: 'Alter Name',
    Verkaufspreis: '20.00',
    Herstellungskosten: '5.00',
    Farbe: 'gold',
    Art: 'Kette',
    Ausschuss_Grund: 'Defekt',
  };

  it('behält den eingegebenen Preis statt den des Vorgängers zu nehmen', async () => {
    const client = clientMitVorgaenger(VORGAENGER);
    db.connect.mockResolvedValueOnce(client);

    const res = await request(app)
      .post('/api/schmuckstuecke')
      .send({ Artikelnummer: 'MHO123', Verkaufspreis: 25, Name: 'Neuer Name' });

    expect(res.statusCode).toBe(201);
    const insert = client.query.mock.calls.find(
      (c) => String(c[0]).startsWith('INSERT INTO "Schmuckstück"'),
    );
    expect(insert[1]).toContain(25);          // eingegebener Preis
    expect(insert[1]).toContain('Neuer Name'); // eingegebener Name
    expect(insert[1]).not.toContain('20.00');
    expect(insert[1]).not.toContain('Alter Name');
  });

  it('übernimmt weiterhin die Felder, die der Client nicht schickt', async () => {
    const client = clientMitVorgaenger(VORGAENGER);
    db.connect.mockResolvedValueOnce(client);

    await request(app)
      .post('/api/schmuckstuecke')
      .send({ Artikelnummer: 'MHO123', Verkaufspreis: 25 });

    const insert = client.query.mock.calls.find(
      (c) => String(c[0]).startsWith('INSERT INTO "Schmuckstück"'),
    );
    expect(insert[1]).toContain('Alter Name'); // nicht geschickt -> vom Vorgänger
    expect(insert[1]).toContain('gold');
  });

  it('kopiert den Ausschussgrund nicht, weil Ausschuss auf false erzwungen wird', async () => {
    const client = clientMitVorgaenger(VORGAENGER);
    db.connect.mockResolvedValueOnce(client);

    await request(app)
      .post('/api/schmuckstuecke')
      .send({ Artikelnummer: 'MHO123' });

    const insert = client.query.mock.calls.find(
      (c) => String(c[0]).startsWith('INSERT INTO "Schmuckstück"'),
    );
    // Sonst entstanden Datensätze mit Ausschussgrund, die kein Ausschuss sind.
    expect(insert[1]).not.toContain('Defekt');
    expect(insert[1]).toContain(false); // Verkauft/Ausschuss
  });
});

describe('DELETE /api/schmuckstuecke/:artikelnummer', () => {
  const sqlAufrufe = (muster) => db.query.mock.calls.filter(([sql]) => muster.test(sql));

  it('löscht das Foto mit, wenn kein weiteres Exemplar der Basisnummer übrig bleibt', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // DELETE Schmuckstück
      .mockResolvedValueOnce({ rows: [] }) // kein Exemplar mehr vorhanden
      .mockResolvedValueOnce({ rows: [], rowCount: 1 }); // DELETE Foto

    const res = await request(app).delete('/api/schmuckstuecke/MHO127_1');

    expect(res.statusCode).toBe(200);
    const fotoLoeschen = sqlAufrufe(/DELETE FROM "Foto"/);
    expect(fotoLoeschen).toHaveLength(1);
    expect(fotoLoeschen[0][1]).toEqual(['MHO127']);
  });

  it('behält das Foto, solange ein anderes Exemplar der Basisnummer existiert', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // DELETE Schmuckstück
      .mockResolvedValueOnce({ rows: [{ '?column?': 1 }] }); // MHO127_2 existiert

    const res = await request(app).delete('/api/schmuckstuecke/MHO127_1');

    expect(res.statusCode).toBe(200);
    expect(sqlAufrufe(/DELETE FROM "Foto"/)).toHaveLength(0);
  });

  it('prüft Exemplare nur mit exakter Basisnummer, nicht mit längeren Laufnummern', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });

    await request(app).delete('/api/schmuckstuecke/MHO127_1');

    const [, params] = sqlAufrufe(/FROM "Schmuckstück"/)[1];
    // MHO127 selbst oder MHO127_<n>, aber nicht MHO1270
    expect(params).toEqual(['MHO127', 'MHO127\\_%']);
  });

  it('fasst Foto und Exemplare nicht an, wenn das Schmuckstück nicht existiert', async () => {
    db.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const res = await request(app).delete('/api/schmuckstuecke/MHO999_1');

    expect(res.statusCode).toBe(404);
    expect(db.query).toHaveBeenCalledTimes(1);
  });
});

describe('POST /api/schmuckstuecke/:artikelnummer/zuruecklagern', () => {
  const URL = '/api/schmuckstuecke/MHO001_1/zuruecklagern';
  let client;

  // Antworten nach SQL statt Reihenfolge, damit der Test nicht an BEGIN/COMMIT hängt
  function clientMit(zeile, updateAnzahl = 1) {
    client = {
      release: jest.fn(),
      query: jest.fn(async (sql) => {
        if (sql.includes('FOR UPDATE')) return { rows: zeile ? [zeile] : [] };
        if (sql.startsWith('UPDATE')) return { rowCount: updateAnzahl };
        return { rows: [] };
      }),
    };
    db.connect.mockResolvedValue(client);
  }
  const sqlAufrufe = () => client.query.mock.calls.map(([sql]) => sql);
  const updateAufruf = () => client.query.mock.calls.find(([sql]) => sql.startsWith('UPDATE'));

  it('lagert ein ausgelagertes Stück zurück und liest die Kunden-ID selbst', async () => {
    clientMit({ Ausgelagert: 7, Verkauft: false, Ausschuss: false });

    const res = await request(app).post(URL).send({ kundeId: 99 });

    expect(res.statusCode).toBe(200);
    expect(sqlAufrufe()).toContain('COMMIT');
    const [sql, params] = updateAufruf();
    expect(sql).toContain('"Ausgelagert" = 0');
    expect(params).toEqual(expect.arrayContaining([7]));
    expect(params).not.toContain(99);
    expect(client.release).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['im Lager', { Ausgelagert: 0, Verkauft: false, Ausschuss: false }],
    ['verkauft', { Ausgelagert: 7, Verkauft: true, Ausschuss: false }],
    ['Ausschuss', { Ausgelagert: 7, Verkauft: false, Ausschuss: true }],
  ])('antwortet 409 bei Stück %s und ändert nichts', async (_name, zeile) => {
    clientMit(zeile);

    const res = await request(app).post(URL);

    expect(res.statusCode).toBe(409);
    expect(res.body.error).toMatch(/nicht ausgelagert/i);
    expect(updateAufruf()).toBeUndefined();
    expect(sqlAufrufe()).toContain('ROLLBACK');
    expect(client.release).toHaveBeenCalledTimes(1);
  });

  it('antwortet 404 bei unbekannter Artikelnummer', async () => {
    clientMit(null);

    const res = await request(app).post(URL);

    expect(res.statusCode).toBe(404);
    expect(updateAufruf()).toBeUndefined();
    expect(sqlAufrufe()).toContain('ROLLBACK');
    expect(client.release).toHaveBeenCalledTimes(1);
  });

  it('antwortet 403 bei Rolle user, ohne die Datenbank anzufassen', async () => {
    const userApp = buildTestApp({
      router: schmuckstueckeRoutes,
      mountPath: '/api/schmuckstuecke',
      user: { id: 2, username: 'nurUser', role: 'user' },
    });

    const res = await request(userApp).post(URL);

    expect(res.statusCode).toBe(403);
    expect(db.connect).not.toHaveBeenCalled();
  });

  it('rollt bei einem Datenbankfehler zurück und gibt den Client frei', async () => {
    clientMit({ Ausgelagert: 7, Verkauft: false, Ausschuss: false });
    const ursprung = client.query.getMockImplementation();
    client.query.mockImplementation(async (sql) => {
      if (sql.startsWith('UPDATE')) throw new Error('DB weg');
      return ursprung(sql);
    });

    const res = await request(app).post(URL);

    expect(res.statusCode).toBe(500);
    expect(res.body.error).not.toMatch(/DB weg/);
    expect(sqlAufrufe()).toContain('ROLLBACK');
    expect(client.release).toHaveBeenCalledTimes(1);
  });
});

// GET /api/schmuckstuecke/status-zahlen: eine COUNT(*) FILTER-Abfrage statt
// fünf Einzelabfragen. Die Zustände müssen disjunkt sein (Summe = alle), die
// Status-Filter verkauft/ausschuss der Liste werden ignoriert.
describe('status-zahlen', () => {
  const URL = '/api/schmuckstuecke/status-zahlen';

  // Testdaten: 10 Stücke, je 4 / 3 / 2 / 1 pro Zustand (pg liefert COUNT als String)
  const ZEILE = { alle: '10', lager: '4', ausgelagert: '3', verkauft: '2', ausschuss: '1' };

  const letzterAufruf = () => {
    const [sql, params] = db.query.mock.calls[0];
    return { sql, params };
  };

  beforeEach(() => {
    jest.clearAllMocks();
    db.query.mockResolvedValue({ rows: [ZEILE] });
  });

  describe('GET /api/schmuckstuecke/status-zahlen', () => {
    it('liefert die fünf Zahlen als Zahlen, die vier Zustände ergeben zusammen alle', async () => {
      const res = await request(app).get(URL);

      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual({ alle: 10, lager: 4, ausgelagert: 3, verkauft: 2, ausschuss: 1 });
      const { alle, lager, ausgelagert, verkauft, ausschuss } = res.body;
      expect(lager + ausgelagert + verkauft + ausschuss).toBe(alle);
    });

    it('braucht genau eine Abfrage und nutzt die disjunkten Builder-Bedingungen', async () => {
      await request(app).get(URL);

      expect(db.query).toHaveBeenCalledTimes(1);
      const { sql } = letzterAufruf();
      expect(sql.match(/COUNT\(\*\) FILTER/g)).toHaveLength(4);
      // verfuegbar()/aktivAusgelagert() prüfen Verkauft/Ausschuss mit, imLager()/ausgelagert() nicht
      expect(sql).toContain(`FILTER (WHERE ${where().verfuegbar().buildConditions()})`);
      expect(sql).toContain(`FILTER (WHERE ${where().aktivAusgelagert().buildConditions()})`);
      expect(sql).toContain(`FILTER (WHERE ${where().verkauft().buildConditions()})`);
      expect(sql).toContain(`FILTER (WHERE ${where().ausschuss().buildConditions()})`);
      expect(sql).toContain('COUNT(*) AS "alle"');
      expect(db.pruefeKlammern).toBeDefined();
      db.pruefeKlammern(sql);
    });

    it('ohne Filter gibt es keine WHERE-Klausel auf der Tabelle und keine Parameter', async () => {
      await request(app).get(URL);

      const { sql, params } = letzterAufruf();
      expect(sql).toMatch(/FROM "Schmuckstück"\s*$/);
      expect(params).toEqual([]);
    });

    it('gibt 0 statt NaN zurück, wenn die Tabelle leer ist', async () => {
      db.query.mockResolvedValue({ rows: [{ alle: '0', lager: '0', ausgelagert: '0', verkauft: '0', ausschuss: '0' }] });

      const res = await request(app).get(URL);

      expect(res.body).toEqual({ alle: 0, lager: 0, ausgelagert: 0, verkauft: 0, ausschuss: 0 });
    });

    describe('Filter', () => {
      it('search löst einen Grundmaterial-Namen auf (Perle -> P)', async () => {
        await request(app).get(`${URL}?search=Perle`);

        const { sql, params } = letzterAufruf();
        expect(sql).toContain('SUBSTRING("Artikelnummer", 2, 1) = $1');
        expect(params).toEqual(['P']);
      });

      it('search als Freitext wirkt über ILIKE auf die Suchfelder', async () => {
        await request(app).get(`${URL}?search=Rosa`);

        const { sql, params } = letzterAufruf();
        expect(sql).toContain('ILIKE $1');
        expect(params).toEqual(['%Rosa%']);
      });

      it('artikelnummer_art und grundmaterial verändern die Abfrage', async () => {
        await request(app).get(`${URL}?artikelnummer_art=a&grundmaterial=p`);

        const { sql, params } = letzterAufruf();
        expect(sql).toContain('SUBSTRING("Artikelnummer", 2, 1) = $1');
        expect(sql).toContain('SUBSTRING("Artikelnummer", 3, 1) = $2');
        expect(params).toEqual(['P', 'A']);
      });

      it('ignoriert die Status-Filter verkauft und ausschuss', async () => {
        await request(app).get(`${URL}?search=Rosa`);
        const ohne = letzterAufruf();
        db.query.mockClear();

        const res = await request(app).get(`${URL}?search=Rosa&verkauft=1&ausschuss=1`);
        const mit = letzterAufruf();

        expect(res.statusCode).toBe(200);
        expect(mit.sql).toBe(ohne.sql);
        expect(mit.params).toEqual(ohne.params);
      });

      it('ignoriert auch ungültige verkauft/ausschuss-Werte (kein 400)', async () => {
        const res = await request(app).get(`${URL}?verkauft=abc&ausschuss=xyz`);

        expect(res.statusCode).toBe(200);
        expect(letzterAufruf().params).toEqual([]);
      });
    });

    describe('Parameter-Reihenfolge mit Kundenfilter', () => {
      it('hängt den Kunden hinter Suche und Produktart an ($1, $2, $3)', async () => {
        await request(app).get(`${URL}?search=Rosa&artikelnummer_art=A&ausgelagert=15`);

        const { sql, params } = letzterAufruf();
        expect(params).toEqual(['%Rosa%', 'A', 15]);
        expect(sql).toContain('ILIKE $1');
        expect(sql).toContain('SUBSTRING("Artikelnummer", 3, 1) = $2');
        expect(sql).toContain('"Ausgelagert" = $3');
        expect(sql).not.toContain('$4');
      });

      it('ausgelagert=0,15 wird als ein Array-Parameter übergeben', async () => {
        await request(app).get(`${URL}?grundmaterial=P&ausgelagert=0,15`);

        const { sql, params } = letzterAufruf();
        expect(params).toEqual(['P', [0, 15]]);
        expect(sql).toContain('"Ausgelagert" = ANY($2::int[])');
      });

      it('ausgelagert=0 filtert auf das Lager ohne Parameter', async () => {
        await request(app).get(`${URL}?ausgelagert=0`);

        const { sql, params } = letzterAufruf();
        expect(params).toEqual([]);
        expect(sql).toMatch(/FROM "Schmuckstück"\s+WHERE "Ausgelagert" = 0\s*$/);
      });
    });

    describe('ausgelagert=kunden (bei irgendeinem Kunden)', () => {
      it('filtert auf Ausgelagert > 0 ohne Parameter', async () => {
        await request(app).get(`${URL}?ausgelagert=kunden`);

        const { sql, params } = letzterAufruf();
        expect(params).toEqual([]);
        expect(sql).toMatch(/FROM "Schmuckstück"\s+WHERE "Ausgelagert" > 0\s*$/);
      });

      it('verschiebt die Parameter-Indizes der Suche nicht', async () => {
        await request(app).get(`${URL}?search=Rosa&artikelnummer_art=A&ausgelagert=kunden`);

        const { sql, params } = letzterAufruf();
        expect(params).toEqual(['%Rosa%', 'A']);
        expect(sql).toContain('ILIKE $1');
        expect(sql).toContain('SUBSTRING("Artikelnummer", 3, 1) = $2');
        expect(sql).toContain('"Ausgelagert" > 0');
        expect(sql).not.toContain('$3');
      });

      it.each(['kunden,5', 'Kunden', '5,kunden'])('lehnt ausgelagert=%s ab (400)', async (wert) => {
        const res = await request(app).get(`${URL}?ausgelagert=${wert}`);

        expect(res.statusCode).toBe(400);
        expect(res.body.error).toMatch(/kunden/);
        expect(db.query).not.toHaveBeenCalled();
      });
    });

    describe('Fehlerfälle', () => {
      it.each(['abc', '0,', 'a,15', '0,-1', '-3'])('lehnt ausgelagert=%s ab (400)', async (wert) => {
        const res = await request(app).get(`${URL}?ausgelagert=${wert}`);

        expect(res.statusCode).toBe(400);
        expect(res.body.error).toMatch(/ausgelagert/);
        expect(db.query).not.toHaveBeenCalled();
      });

      it('antwortet mit 500, wenn die Abfrage fehlschlägt', async () => {
        db.query.mockRejectedValue(new Error('boom'));

        const res = await request(app).get(URL);

        expect(res.statusCode).toBe(500);
        expect(res.body.error).toBeDefined();
        expect(JSON.stringify(res.body)).not.toContain('boom');
      });

      it('wird nicht als Artikelnummer aufgelöst (Route vor /:artikelnummer)', async () => {
        const res = await request(app).get(URL);

        expect(res.body).toHaveProperty('alle');
        expect(res.body).not.toHaveProperty('Artikelnummer');
      });
    });

    describe('Authentifizierung', () => {
      it('antwortet ohne Anmeldung mit 401 und fragt die Datenbank nicht ab', async () => {
        const ohneLogin = express();
        ohneLogin.use('/api/schmuckstuecke', authenticate, schmuckstueckeRoutes);

        const res = await request(ohneLogin).get(URL);

        expect(res.statusCode).toBe(401);
        expect(db.query).not.toHaveBeenCalled();
      });
    });
  });
});
