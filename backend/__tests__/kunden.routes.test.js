'use strict';

process.env.JWT_SECRET = 'test-secret-do-not-use-in-prod';

const request = require('supertest');
const express = require('express');

jest.mock('../src/config/db', () => require('./helpers/dbMock').createDbMock());

jest.mock('../src/utils/logger', () => require('./helpers/dbMock').createLoggerMock());

const db = require('../src/config/db');
const { requireBearbeiter } = require('../src/middleware/auth');
const kundenRoutes = require('../src/routes/kunden');

function buildApp(role = 'bearbeiter') {
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    req.user = { id: 1, username: 'testuser', role };
    next();
  });
  app.use('/api/kunden', requireBearbeiter, kundenRoutes);
  return app;
}

beforeEach(() => jest.clearAllMocks());

describe('GET /api/kunden', () => {
  it('liefert alle Kunden sortiert nach Name', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ ID: 1, Name: 'Anna' }] });

    const res = await request(buildApp()).get('/api/kunden');

    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(db.query.mock.calls[0][0]).toContain('ORDER BY "Name"');
  });

  it('lehnt den Zugriff mit Rolle user ab (403)', async () => {
    const res = await request(buildApp('user')).get('/api/kunden');

    expect(res.statusCode).toBe(403);
    expect(db.query).not.toHaveBeenCalled();
  });
});

describe('POST /api/kunden', () => {
  const gueltigerKunde = {
    Name: 'Neuer Kunde',
    Strasse: 'Hauptstraße',
    Hausnummer: 1,
    Ort: 'Musterstadt',
    PLZ: 12345,
  };

  it('legt einen Kunden mit gültigen Daten an', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ ID: 10, ...gueltigerKunde }] });

    const res = await request(buildApp()).post('/api/kunden').send(gueltigerKunde);

    expect(res.statusCode).toBe(201);
    expect(res.body.ID).toBe(10);
  });

  it('speichert die E-Rechnung-Felder normalisiert und setzt DE als Standardland', async () => {
    db.query.mockResolvedValue({ rows: [{ ID: 11 }] });

    await request(buildApp()).post('/api/kunden').send({ ...gueltigerKunde, UStIdNr: 'de 123 456 789', Leitweg_ID: '991-1' });
    await request(buildApp()).post('/api/kunden').send({ ...gueltigerKunde, Land: 'at' });

    expect(db.query.mock.calls[0][1].slice(9, 12)).toEqual(['DE', 'DE123456789', '991-1']);
    expect(db.query.mock.calls[1][1].slice(9, 12)).toEqual(['AT', null, null]);
  });

  it('speichert Direktverkauf, ohne Angabe als false', async () => {
    db.query.mockResolvedValue({ rows: [{ ID: 12 }] });

    await request(buildApp()).post('/api/kunden').send({ ...gueltigerKunde, Direktverkauf: true });
    await request(buildApp()).post('/api/kunden').send(gueltigerKunde);

    expect(db.query.mock.calls[0][1].at(-1)).toBe(true);
    expect(db.query.mock.calls[1][1].at(-1)).toBe(false);
  });

  it('lehnt einen ungültigen Ländercode ab (400)', async () => {
    const res = await request(buildApp()).post('/api/kunden').send({ ...gueltigerKunde, Land: 'Deutschland' });

    expect(res.statusCode).toBe(400);
    expect(db.query).not.toHaveBeenCalled();
  });

  it('lehnt fehlende Pflichtfelder ab (400)', async () => {
    const res = await request(buildApp()).post('/api/kunden').send({ Name: 'Nur Name' });

    expect(res.statusCode).toBe(400);
    expect(db.query).not.toHaveBeenCalled();
  });

  it('lehnt den Zugriff mit Rolle user ab (403)', async () => {
    const res = await request(buildApp('user')).post('/api/kunden').send(gueltigerKunde);

    expect(res.statusCode).toBe(403);
  });
});

describe('PUT /api/kunden/:id', () => {
  const gueltigerKunde = {
    Name: 'Aktualisiert',
    Strasse: 'Nebenweg',
    Hausnummer: 2,
    Ort: 'Musterstadt',
    PLZ: 54321,
  };

  it('aktualisiert einen bestehenden Kunden', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ ID: 5, ...gueltigerKunde }] });

    const res = await request(buildApp()).put('/api/kunden/5').send(gueltigerKunde);

    expect(res.statusCode).toBe(200);
    expect(res.body.Name).toBe('Aktualisiert');
  });

  it('lässt Direktverkauf unverändert, wenn das Feld fehlt', async () => {
    db.query.mockResolvedValue({ rows: [{ ID: 5 }] });

    await request(buildApp()).put('/api/kunden/5').send({ ...gueltigerKunde, Direktverkauf: false });
    await request(buildApp()).put('/api/kunden/5').send(gueltigerKunde);

    expect(db.query.mock.calls[0][0]).toContain('"Direktverkauf" = COALESCE($13, "Direktverkauf")');
    expect(db.query.mock.calls[0][1].slice(-2)).toEqual([false, '5']);
    expect(db.query.mock.calls[1][1].slice(-2)).toEqual([null, '5']);
  });

  it('meldet 404 bei unbekannter ID', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });

    const res = await request(buildApp()).put('/api/kunden/999').send(gueltigerKunde);

    expect(res.statusCode).toBe(404);
  });
});

describe('PUT /api/kunden/:id/restock-selective', () => {
  it('lagert ausgewählte Artikel zurück', async () => {
    db.query.mockResolvedValueOnce({ rowCount: 2 });

    const res = await request(buildApp())
      .put('/api/kunden/3/restock-selective')
      .send({ artikelnummern: ['MHO123_1', 'MHO123_2'] });

    expect(res.statusCode).toBe(200);
    expect(res.body.message).toBe('2 Artikel zurückgelagert');
  });

  it('lehnt eine leere Artikelliste ab (400)', async () => {
    const res = await request(buildApp())
      .put('/api/kunden/3/restock-selective')
      .send({ artikelnummern: [] });

    expect(res.statusCode).toBe(400);
    expect(db.query).not.toHaveBeenCalled();
  });

  it('wendet dieselben Schutzbedingungen an wie /restock (C7)', async () => {
    db.query.mockResolvedValueOnce({ rowCount: 1 });

    await request(buildApp())
      .put('/api/kunden/3/restock-selective')
      .send({ artikelnummern: ['MHO123_1'] });

    const sql = String(db.query.mock.calls[0][0]);
    expect(sql).toContain('"Verkauft" IS FALSE');
    expect(sql).toContain('"Ausschuss" IS FALSE');
    expect(sql).toContain('"Lieferschein_ID" = 0');
  });
});

describe('DELETE /api/kunden/:id', () => {
  it('löscht einen bestehenden Kunden', async () => {
    db.query.mockResolvedValueOnce({ rowCount: 1 });

    const res = await request(buildApp()).delete('/api/kunden/5');

    expect(res.statusCode).toBe(200);
    expect(res.body.message).toBe('Kunde gelöscht');
  });

  it('meldet 404 bei unbekannter ID', async () => {
    db.query.mockResolvedValueOnce({ rowCount: 0 });

    const res = await request(buildApp()).delete('/api/kunden/999');

    expect(res.statusCode).toBe(404);
  });

  it('lehnt den Zugriff mit Rolle user ab (403)', async () => {
    const res = await request(buildApp('user')).delete('/api/kunden/5');

    expect(res.statusCode).toBe(403);
    expect(db.query).not.toHaveBeenCalled();
  });
});
