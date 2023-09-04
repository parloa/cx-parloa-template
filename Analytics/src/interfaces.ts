import { Context } from '@azure/functions';

export interface AnalyticsEvent {
  user_id: string;
  date_key: string;
  platform: Platforms;
  releaseId: string;
  transactionId: string;
  userContextId: string;
  start_state: string;
  next_state: string;
  session_id: string;
  request_timestamp: string;
  response_time: number;

  state_meta: {
    initial_state_id: string;
    next_state_id: string;
    handled_state_id: string;
  };

  type: AnalyticsEventTypes;
  timestamp: number;
  message: string;
  variables: any;

  intent: string;
  intent_handled: string;
  intent_confidence: number | string;
  not_handled: boolean;

  intent_ranking?: {
    name: string;
    confidence: number;
  }[];
  slots?: any[];
  call_meta?: any[];

  continue_listening?: boolean;
}

export enum AnalyticsEventTypes {
  event = 'event',
  agent = 'agent',
  user = 'user',
  error = 'error',
  warning = 'warning',
}

export enum Platforms {
  phoneV2 = 'phoneV2',
  dialogflow = 'dialogflow',
  textchatV2 = 'textchatV2',
}

export enum FlowEvents {
  start = 'START',
  end = 'END',

  call_forward = 'CALL_FORWARD',
  chat_handover = 'CHAT_HANDOVER',
}

export interface AnalyticsStore {
  save(messages: AnalyticsEvent[], context: Context): Promise<any>;
}
