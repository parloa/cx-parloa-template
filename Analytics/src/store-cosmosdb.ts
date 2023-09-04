import { Context } from '@azure/functions';
import { AnalyticsEvent, AnalyticsStore } from './interfaces';

export class CosmosDbStore implements AnalyticsStore {
  constructor(private bindingName: string) {}

  async save(messages: AnalyticsEvent[], context: Context) {
    context.bindings[this.bindingName] = messages;
  }
}
