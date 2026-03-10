export interface CloudPricingProvider<TInput, TOutput> {
  calculatePrice(params: TInput): Promise<TOutput>;
}
