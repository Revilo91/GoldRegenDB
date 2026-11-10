import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import Etiketten from '../pages/Etiketten';
import { api } from '../api';

vi.mock('../api', () => ({
  api: {
    getEtikettenSizes: vi.fn(),
    getEtikettenOptions: vi.fn(),
    getEtikettenPreview: vi.fn(),
  },
}));

const druckAufrufe = () =>
  api.getEtikettenPreview.mock.calls.filter(([p]) => p.mode === 'print');

async function artikelUebernehmen() {
  fireEvent.click(await screen.findByRole('button', { name: 'Übernehmen' }));
  await screen.findByRole('button', { name: '1 Etikett drucken' });
}

describe('Etiketten: Rückfrage ohne Materialhinweise', () => {
  let fensterMock;

  beforeEach(() => {
    vi.clearAllMocks();
    api.getEtikettenSizes.mockResolvedValue({
      defaultSize: 'small',
      sizes: [{ id: 'small', name: 'Klein', w: 30, h: 20, rotate: false, showQr: false }],
    });
    api.getEtikettenOptions.mockResolvedValue([{ artikelnummer: 'ART001', name: 'Test Artikel' }]);
    api.getEtikettenPreview.mockResolvedValue('<html><body>etikett</body></html>');
    fensterMock = { document: { open: vi.fn(), write: vi.fn(), close: vi.fn() }, close: vi.fn() };
    vi.spyOn(window, 'open').mockReturnValue(fensterMock);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe.each([
    ['Drucken', '1 Etikett drucken'],
    ['Druckansicht im neuen Tab', 'Druckansicht im neuen Tab'],
  ])('Weg "%s"', (_name, buttonName) => {
    it('fragt ohne Materialhinweise nach und druckt noch nicht', async () => {
      render(<Etiketten />);
      await artikelUebernehmen();

      fireEvent.click(screen.getByRole('button', { name: buttonName }));

      expect(screen.getByRole('dialog', { name: 'Ohne Materialhinweise?' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Trotzdem drucken' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Abbrechen' })).toBeInTheDocument();
      expect(druckAufrufe()).toHaveLength(0);
      expect(window.open).not.toHaveBeenCalled();
    });

    it('druckt bei "Abbrechen" nicht und schließt die Rückfrage', async () => {
      render(<Etiketten />);
      await artikelUebernehmen();

      fireEvent.click(screen.getByRole('button', { name: buttonName }));
      fireEvent.click(screen.getByRole('button', { name: 'Abbrechen' }));

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(druckAufrufe()).toHaveLength(0);
      expect(window.open).not.toHaveBeenCalled();
    });

    it('druckt bei "Trotzdem drucken"', async () => {
      render(<Etiketten />);
      await artikelUebernehmen();

      fireEvent.click(screen.getByRole('button', { name: buttonName }));
      fireEvent.click(screen.getByRole('button', { name: 'Trotzdem drucken' }));

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      await waitFor(() => expect(druckAufrufe()).toHaveLength(1));
    });

    it('fragt mit gewähltem Materialhinweis nicht nach', async () => {
      render(<Etiketten />);
      await artikelUebernehmen();
      fireEvent.click(screen.getByRole('button', { name: 'Edelstahl' }));

      fireEvent.click(screen.getByRole('button', { name: buttonName }));

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      await waitFor(() => expect(druckAufrufe()).toHaveLength(1));
      expect(druckAufrufe()[0][0].materialHints).toEqual(['Edelstahl']);
    });
  });

  it('öffnet den neuen Tab erst nach der Bestätigung, synchron im Klick auf "Trotzdem drucken"', async () => {
    render(<Etiketten />);
    await artikelUebernehmen();

    fireEvent.click(screen.getByRole('button', { name: 'Druckansicht im neuen Tab' }));
    expect(window.open).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Trotzdem drucken' }));
    expect(window.open).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(fensterMock.document.write).toHaveBeenCalled());
  });
});
