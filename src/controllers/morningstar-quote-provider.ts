import { QuoteProvider, AssetType, Asset, AssetTypeNotSupportedError, parseSymbol, isValidISIN } from "./quote-provider";
import axios from "axios";

interface MorningstarQuote {
  lastPrice: number;
  currencyCode: string;
}

interface MSecurityDetails {
  /**
   * exchange code
   */
  LS01Z: string; 
  /**
   * short symbol
   */
  OS001: string; 
  /**
   * title
   */
  OS63I: string; 
  /**
   * currency
   */
  OS05M: string; 
}
interface MSearchResult {
  r: MSecurityDetails[];
}

interface MApiResult {
  code: number;
  msg: string;
}

interface MorningstarSearchResponse {
  result: MApiResult,
  m: MSearchResult[]
}

/**
 * Provide bond and stock quotes from Morningstar
 */
export class MorningstarQuoteProvider implements QuoteProvider {

  async getStockQuotes(symbols: string[]): Promise<Asset[]> {
    return this.getAssetQuotes(symbols);

  }

  getBondQuotes(symbols: string[]): Promise<Asset[]> {
    throw new AssetTypeNotSupportedError(AssetType.BOND);
  }

  getCommodityQuotes(symbols: string[]): Promise<Asset[]> {
    throw new AssetTypeNotSupportedError(AssetType.COMMODITY);
  }

  getCryptoCurrencyQuotes(symbols: string[]): Promise<Asset[]> {
    throw new AssetTypeNotSupportedError(AssetType.CRYPTOCURRENCY);
  }

  getMutualFundQuotes(symbols: string[]): Promise<Asset[]> {
    throw new AssetTypeNotSupportedError(AssetType.CRYPTOCURRENCY);
  }

  getSupportedMarkets(): string[] {
    return [];
  }

  getForexQuotes(symbols: string[]): Promise<Asset[]> {
    throw new AssetTypeNotSupportedError(AssetType.COMMODITY);
  }

  private async getAssetQuotes(symbols: string[]): Promise<Asset[]> {
    let promises: Promise<Asset>[] = [];
    for (let symbol of symbols) {
      let promise = this.getAssetQuote(symbol);
      promises.push(promise);
    }
    let assets = await Promise.all(promises);
    return assets;
  }


  private async getAssetQuote(fullSymbol: string): Promise<Asset> {
    let symbolParts = parseSymbol(fullSymbol);
    if (isValidISIN(symbolParts.shortSymbol)) {
      symbolParts.marketCode = '';
      let response =  await axios.get(`https://www.morningstar.com/api/v2/search/securities/5/usquote-v2/?q=${symbolParts.shortSymbol}`);
      let data: MorningstarSearchResponse = response.data;
      if (data.result.code === 0 && data.m.length > 0 && data.m[0].r.length > 0) {
        let details = data.m[0].r[0];
        symbolParts.marketCode = details.LS01Z;
        symbolParts.shortSymbol = details.OS001;
      }
      console.log(symbolParts);
    }
    if (symbolParts.marketCode !== '') {
      let response = await axios.get(`https://www.morningstar.com/stocks/${symbolParts.marketCode}/${symbolParts.shortSymbol}/quote.html`);
      let htmlBody = response.data;
      //extract quote
      let regex = /name="secId"[^>]+content="([^"]+)/g;
      let match = regex.exec(htmlBody);
      if (match) {
        let securityId = match[1];
        regex = /name="securityType"[^>]+content="([^"]+)/g;
        match = regex.exec(htmlBody);
        if (match) {
          let securityType = match[1];
          let realtimeToken;
          let apiKey;
          regex = /name="realTimeToken"[^>]+content="([^"]+)/g;
          match = regex.exec(htmlBody);
          if (match) {
            realtimeToken = match[1];
          }
          regex = /name="apigeeKey"[^>]+content="([^"]+)/g;
          match = regex.exec(htmlBody);
          if (match) {
            apiKey = match[1];
          }
          if (realtimeToken && apiKey) {


            let url: string;
            if (securityType === 'ST') {
              url = `https://api-global.morningstar.com/sal-service/v1/stock/realTime/v3/${securityId}/data`;
            } else if (securityType === 'FE') {
              url = `https://api-global.morningstar.com/sal-service/v1/etf/quote/miniChartRealTimeData/${securityId}/data?ts=0`;
            }
            if (url) {
              response = await axios.get(url, {
                headers: {
                  'apikey': apiKey,
                  'x-api-realtime-e': realtimeToken,
                }
              });
              let quote: MorningstarQuote = response.data;
              if (quote.lastPrice) {
                return {
                  currency: quote.currencyCode,
                  price: quote.lastPrice,
                  symbol: fullSymbol,
                };

              }

            }
          }
        }

      }
    }

    return {
      currency: null,
      price: null,
      symbol: fullSymbol,
    };

  }

  getId(): string {
    return 'Morningstar';
  }
}

//register as quote provider
export const morningstarQuoteProvider = new MorningstarQuoteProvider();



