import { fetchYahooQuotes } from '../../src/quotes/yahoo-quote.service';
import YahooFinance from 'yahoo-finance2';

jest.mock('yahoo-finance2', () => ({
  __esModule: true,
  default: jest.fn(),
}));

describe('YahooQuoteService — fetchYahooQuotes', () => {
  const quoteMock = jest.fn();
  const YahooFinanceMock = YahooFinance as unknown as jest.Mock;

  beforeEach(() => {
    quoteMock.mockReset();
    YahooFinanceMock.mockImplementation(() => ({ quote: quoteMock }));
  });

  afterEach(() => {
    YahooFinanceMock.mockReset();
  });

  it('deve retornar mapa vazio sem consultar o Yahoo quando não há tickers', async () => {
    const result = await fetchYahooQuotes([]);

    expect(result.size).toBe(0);
    expect(quoteMock).not.toHaveBeenCalled();
  });

  it('deve consultar os tickers com sufixo .SA em uma única chamada', async () => {
    quoteMock.mockResolvedValue([
      {
        symbol: 'HGLG11.SA',
        regularMarketPrice: 165.5,
        regularMarketTime: new Date('2026-07-15T18:00:00Z'),
      },
      {
        symbol: 'MXRF11.SA',
        regularMarketPrice: 10.32,
        regularMarketTime: new Date('2026-07-15T18:00:00Z'),
      },
    ]);

    const result = await fetchYahooQuotes(['HGLG11', 'MXRF11']);

    expect(quoteMock).toHaveBeenCalledTimes(1);
    expect(quoteMock).toHaveBeenCalledWith(['HGLG11.SA', 'MXRF11.SA']);
    expect(result.get('HGLG11')).toEqual({
      price: 165.5,
      updatedAt: '2026-07-15T18:00:00.000Z',
    });
    expect(result.get('MXRF11')).toEqual({
      price: 10.32,
      updatedAt: '2026-07-15T18:00:00.000Z',
    });
  });

  it('deve ignorar resultados sem preço', async () => {
    quoteMock.mockResolvedValue([
      { symbol: 'HGLG11.SA', regularMarketPrice: 165.5 },
      { symbol: 'XPTO11.SA' },
    ]);

    const result = await fetchYahooQuotes(['HGLG11', 'XPTO11']);

    expect(result.size).toBe(1);
    expect(result.get('HGLG11')?.price).toBe(165.5);
    expect(typeof result.get('HGLG11')?.updatedAt).toBe('string');
  });

  it('deve retornar mapa vazio e logar erro quando o Yahoo falha', async () => {
    const consoleErrorSpy = jest
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    quoteMock.mockRejectedValue(new Error('Yahoo down'));

    const result = await fetchYahooQuotes(['HGLG11']);

    expect(result.size).toBe(0);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[fetchYahooQuotes] Erro ao buscar cotações no Yahoo Finance:',
      expect.objectContaining({ message: 'Yahoo down' }),
    );

    consoleErrorSpy.mockRestore();
  });

  it('deve dividir em lotes quando há muitos tickers', async () => {
    const tickers = Array.from({ length: 60 }, (_, i) => `T${i}11`);
    quoteMock.mockImplementation((symbols: string[]) =>
      Promise.resolve(
        symbols.map((symbol) => ({ symbol, regularMarketPrice: 1 })),
      ),
    );

    const result = await fetchYahooQuotes(tickers);

    expect(quoteMock).toHaveBeenCalledTimes(2);
    expect(result.size).toBe(60);
  });
});
