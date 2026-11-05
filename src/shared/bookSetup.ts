export type BookSetupState = { required: boolean };
export interface BookSetupApi {
  getState(): Promise<BookSetupState>;
  complete(input: { baseCurrency: string }): Promise<void>;
}
