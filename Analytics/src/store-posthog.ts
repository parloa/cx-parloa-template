import { Context } from '@azure/functions';
import { AnalyticsEvent, AnalyticsStore } from './interfaces';
import axios from 'axios';

// NOTES
// - no explicit session handling possible --> use sessionId as distinctId?

export class PosthogStore implements AnalyticsStore {
  constructor(
    private url: string,
    private apiKey: string
  ) {}

  async save(messages: AnalyticsEvent[], context: Context) {
    const response = await axios.post(this.url + '/capture/', {
      api_key: this.apiKey,
      batch: this.transform(messages),
    });
    // context.log(response.status, response.data);
  }

  private transform(messages: AnalyticsEvent[]) {
    return messages.map((message) => {
      const safeUserId = message.user_id.replace(/^\+/, '');
      return {
        event: message.type,
        distinct_id: safeUserId,
        properties: {
          distinct_id: safeUserId,
          ...message,
        },
        timestamp: message.request_timestamp,
      };
    });
  }
}
