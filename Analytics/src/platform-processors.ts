import * as _ from 'lodash';
import { Platforms } from './interfaces';

export function extractResponseMessage(response: any, platform: string): string {
  let readableMsg = '';
  switch (platform) {
    case Platforms.phoneV2:
      readableMsg = response.prompt.replace(/<\/?[^>]+(>|$)/g, '');
      break;
    case Platforms.dialogflow:
      if (response.fulfillmentMessages) {
        readableMsg = response.fulfillmentMessages
          .map((msg) => {
            if (msg.text?.text) {
              return _.castArray(msg.text.text).join('\n');
            }
            if (msg.payload?.richContent) {
              return _.flatten(
                msg.payload.richContent.map((rc) => {
                  return rc.map((payload) => {
                    if (payload.type === 'chips') {
                      return payload.options.map((o) => `[${o.text}]`).join(' ');
                    }
                  });
                })
              ).join(' ');
            }
          })
          .join(' ');
      }
      if (response.fulfillmentText && !readableMsg) {
        readableMsg = response.fulfillmentText;
      }
      break;
    case Platforms.textchatV2:
      if (response.responseElements) {
        readableMsg = response.responseElements
          .map((msg) => {
            if (msg.type == 'payload') {
              return '';
            }
            if (msg.content?.quickReplies) {
              return `[${_.castArray(msg.content.quickReplies).join('] [')}]`;
            }
            if (msg.content) {
              return _.castArray(msg.content).join('\n');
            }
          })
          .join(' ');
      }
      if (response.responseElements && !readableMsg) {
        readableMsg = response.responseElements;
      }
      break;
    default:
      readableMsg = JSON.stringify(response);
  }
  return readableMsg;
}

export function extractRequestMessage(request: any, platform: string): string {
  switch (platform) {
    case Platforms.phoneV2:
      if (request.event === 'DTMF') {
        return 'DTMF: ' + request.collectedDtmf;
      }
      return request.text || request.event || JSON.stringify(request);
    case Platforms.dialogflow:
      return request.queryResult?.queryText || JSON.stringify(request.queryResult);
    case Platforms.textchatV2:
      if (request.event?.type === 'launch') {
        return 'WELCOME';
      }
      return request.event?.text || request.event?.type || JSON.stringify(request.event);
    default:
      return JSON.stringify(request);
  }
}

export function extractPlatformRequestProperties(transaction: any, platform: string): any {
  const properties = {};
  switch (platform) {
    case Platforms.phoneV2:
      properties['intent_ranking'] = transaction.request.intentRanking
        ?.map((ir) => ({ name: ir.name, confidence: ir.confidence }))
        .filter((ir) => ir.confidence > 10e-3);
      properties['slots'] = transaction.request.slots?.map((slot) => {
        delete slot['processors'];
        return slot;
      });
      properties['call_meta'] = {
        ...transaction.request.callMeta,
        errorMessage: transaction.request.errorMessage,
      };
      delete properties['call_meta']?.callerId;
  }

  return properties;
}

export function extractPlatformResponseProperties(transaction: any, platform: string): Object {
  const properties = {};
  switch (platform) {
    case Platforms.phoneV2:
      properties['continue_listening'] = transaction.response.continueListening;
      properties['call_meta'] = transaction.request.callMeta;
      delete properties['call_meta']?.callerId;
  }

  return properties;
}

export function getSessionId(transaction: any, platform: string): string {
  switch (platform) {
    case Platforms.phoneV2:
      if (transaction?.request?.callMeta?.callId) {
        return transaction?.request?.callMeta?.callId;
      }
      if (transaction?.response?.callMeta?.callId) {
        return transaction?.response?.callMeta?.callId;
      }
    case Platforms.textchatV2:
      return transaction.response.sessionId || transaction.response.conversationId;
    case Platforms.dialogflow:
    default:
      return transaction.response.conversationId || transaction.userContextId;
  }
}
