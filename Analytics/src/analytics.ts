import { Context } from '@azure/functions';
import { createHash } from 'crypto';

import { ContextualHook } from '../../common/service-interfaces';
import { AnalyticsEvent, AnalyticsEventTypes, AnalyticsStore, FlowEvents } from './interfaces';
import {
  extractPlatformRequestProperties,
  extractPlatformResponseProperties,
  extractRequestMessage,
  extractResponseMessage,
  getSessionId,
} from './platform-processors';

// TODO
// - [x] Whitelist/Blacklist storage variables
// - [x] Whitelist/Blacklist slots
// - [x] Whitelist/Blacklist messages based on states or intents
// - [x] Filter all messages, slots, storages for privacy compatible flow analysis
// - [x] Privatize user ids
// - [ ] Status variables?

export interface AnalyticsHookConfig {
  debug?: boolean;

  storageBlacklistName?: string;
  storageWhitelistName?: string;

  slotBlacklistName?: string;
  slotWhitelistName?: string;

  stateRequestMessageBlacklistName?: string;
  stateRequestMessageWhitelistName?: string;
  stateResponseMessageBlacklistName?: string;
  stateResponseMessageWhitelistName?: string;

  filterAllName?: string;
  filterAllOverride?: boolean;
}

export class AnalyticsHook implements ContextualHook {
  public constructor(
    private stores: AnalyticsStore[],
    private config: AnalyticsHookConfig = {}
  ) {}

  public async run(body: any, context: Context): Promise<any> {
    let choice = '';
    let output = '';

    if (this.config.debug) {
      context.log('Received body: ' + JSON.stringify(body));
    }

    if (Array.isArray(body)) {
      const transactions = body;

      const messages: AnalyticsEvent[] = transactions.reduce((messages, transaction) => {
        const baseProps = this.buildBaseProperties(transaction);

        const newMessages = [
          ...this.extractRequest(transaction),
          ...this.extractResponse(transaction),
          ...this.extractEvents(transaction),
          ...this.extractFlowEvents(transaction),
          ...this.extractAlerts(transaction),
        ].map((message) => ({
          ...baseProps,
          ...message,
        }));

        return [...messages, ...newMessages];
      }, []);

      if (messages.length > 0) {
        await Promise.all(this.stores.map((store) => store.save(messages, context)));
        context.log(`Saved ${messages.length} events`);
      }

      if (this.config.debug) {
        context.log('Generated messages: ' + JSON.stringify(messages));
      }
    }

    return {
      choice,
      output,
    };
  }

  private extractRequest(transaction: any) {
    const requestProperties = extractPlatformRequestProperties(transaction, transaction.platform);
    this.filterSlots(requestProperties, transaction);

    return [
      {
        timestamp: this.getTimestamp(false, transaction),
        type: AnalyticsEventTypes.user,
        message: this.getFilteredUserMessage(transaction),
        ...this.buildIntentProperties(transaction),
        ...requestProperties,
      },
    ];
  }

  private filterSlots(requestProperties: any, transaction: any) {
    if (requestProperties.slots) {
      if (this.shouldFilterAll(transaction.variables)) {
        requestProperties.slots = [];
      } else {
        const { blacklist, whitelist } = this.getBlackWhitelist(
          transaction.variables,
          this.config.slotBlacklistName,
          this.config.slotWhitelistName
        );
        requestProperties.slots = requestProperties.slots
          .filter(
            (slot) => !blacklist.includes(slot.entity) && !blacklist.includes(slot.entity.replace('_original', ''))
          )
          .filter(
            (slot) =>
              !whitelist.length ||
              whitelist.includes(slot.entity) ||
              whitelist.includes(slot.entity.replace('_original', ''))
          );
      }
    }
  }

  private extractResponse(transaction: any) {
    return [
      {
        timestamp: this.getTimestamp(true, transaction),
        type: AnalyticsEventTypes.agent,
        message: this.getFilteredBotMessage(transaction),
        ...this.buildIntentProperties(transaction),
        ...extractPlatformResponseProperties(transaction, transaction.platform),
      },
    ];
  }

  private getFilteredBotMessage(transaction: any) {
    let botMessage = extractResponseMessage(transaction.response, transaction.platform);
    // next_state
    const state = `${transaction.intent.nextState.dialogName}/${transaction.intent.nextState.name}`;
    const { blacklist, whitelist } = this.getBlackWhitelist(
      transaction.variables,
      this.config.stateResponseMessageBlacklistName,
      this.config.stateResponseMessageWhitelistName
    );
    const filterAll = this.shouldFilterAll(transaction.variables);

    return this.filterContentsBlackWhite(filterAll, state, blacklist, whitelist, botMessage);
  }

  private getFilteredUserMessage(transaction: any) {
    let userMessage = extractRequestMessage(transaction.request, transaction.platform);
    // start_state
    const state = `${transaction.intent.initialState.dialogName}/${transaction.intent.initialState.name}`;
    const { blacklist, whitelist } = this.getBlackWhitelist(
      transaction.variables,
      this.config.stateRequestMessageBlacklistName,
      this.config.stateRequestMessageWhitelistName
    );
    const filterAll = this.shouldFilterAll(transaction.variables);

    return this.filterContentsBlackWhite(filterAll, state, blacklist, whitelist, userMessage);
  }

  private filterContentsBlackWhite(
    filterAll: boolean,
    state: string,
    blacklist: string[],
    whitelist: string[],
    message: string
  ) {
    if (filterAll || blacklist.includes(state) || (whitelist.length && !whitelist.includes(state))) {
      message = '';
    }
    return message;
  }

  private extractFlowEvents(transaction: any) {
    const events = [];
    if (transaction.request.event === 'WELCOME' || transaction.request.event?.type === 'launch') {
      events.push({
        timestamp: this.getTimestamp(false, transaction),
        type: AnalyticsEventTypes.event,
        intent: FlowEvents.start,
      });
    }
    if (transaction.response.endTalk) {
      events.push({
        timestamp: this.getTimestamp(true, transaction),
        type: AnalyticsEventTypes.event,
        intent: FlowEvents.end,
      });
    }
    if (transaction.response?.callControlMessages?.length > 0) {
      for (const message of transaction.response.callControlMessages) {
        if (message.type === 'SIP_REFER') {
          events.push({
            timestamp: this.getTimestamp(true, transaction),
            type: AnalyticsEventTypes.event,
            intent: FlowEvents.call_forward,
            message: message.referTo,
            variables: Object.fromEntries(message.sipHeaders.map((header) => [header.name, header.value])),
          });
        }
      }
    }
    return events;
  }

  private extractAlerts(transaction: any) {
    const events = [];

    const errorsWarnings = [...transaction.meta.errors.affectedSteps, ...transaction.meta.warnings.affectedSteps];

    if (errorsWarnings.length > 0) {
      for (const alertItem of errorsWarnings) {
        const alerts = alertItem._errors || alertItem.warnings;
        for (const alert of alerts) {
          events.push({
            type: alert.type,
            timestamp: this.getTimestamp(false, transaction),
            intent: alerts.kind,
            message: alert.message,
            variables: alertItem.sessionBefore.currentNode,
          });
        }
      }
    }
    return events;
  }

  private extractEvents(transaction: any) {
    const events = [];
    for (const varx of transaction.variables) {
      if (!varx.id.toLowerCase().startsWith('_event')) {
        continue;
      }
      if (!varx.value) {
        continue;
      }
      const requestTime = new Date(transaction.requestTimestamp).getTime();

      let eventItems = [];
      try {
        eventItems = JSON.parse(varx.value);
        if (!Array.isArray(eventItems)) {
          eventItems = [eventItems];
        }
      } catch (e) {
        eventItems = [varx.value];
      }

      for (const event of eventItems) {
        let eventName = '';
        let eventData = '';
        let eventTimestamp = 0;

        if (typeof event === 'object' && event.event && event.timestamp) {
          eventName = event.event;
          eventTimestamp = event.timestamp;
          eventData = this.flattenData(event.data) ?? null;
        } else {
          eventName = event;
          eventTimestamp = requestTime;
        }

        if (eventTimestamp < requestTime) {
          // Event is in the past, ignore it
          continue;
        }
        if (!eventName) {
          // Event has no name, ignore it
          continue;
        }

        events.push({
          type: AnalyticsEventTypes.event,
          timestamp: eventTimestamp,
          intent: eventName,
          message: eventData,
        });
      }
    }
    return events;
  }

  private flattenData(data: any) {
    if (Array.isArray(data)) {
      data = data.map(this.flattenData).join(', ');
    } else if (typeof data === 'object') {
      data = JSON.stringify(data);
    }

    return data;
  }

  private buildBaseProperties(transaction: any) {
    const requestDate = new Date(transaction.requestTimestamp);
    const dateKey = requestDate.toISOString().slice(0, 10);

    const validVariables = this.filterVariables(transaction.variables);
    let requesterId = this.getSafeRequesterId(transaction);

    // const statusVariables = this.getStatusVariables(transaction.variables);

    return {
      user_id: requesterId,
      date_key: dateKey,
      platform: transaction.platform,
      releaseId: transaction.releaseId,
      transactionId: transaction.transactionId,
      userContextId: transaction.userContextId,
      start_state: `${transaction.intent.initialState.dialogName}/${transaction.intent.initialState.name}`,
      next_state: `${transaction.intent.nextState.dialogName}/${transaction.intent.nextState.name}`,
      session_id: getSessionId(transaction, transaction.platform),
      request_timestamp: transaction.requestTimestamp,
      response_time: transaction.responseTime,
      state_meta: {
        initial_state_id: transaction.intent.initialState.id,
        next_state_id: transaction.intent.nextState.id,
        handled_state_id: transaction.intent.handledByState.id,
      },

      // TODO evaluate saving variables in a separate collection
      variables: validVariables,
      // ...statusVariables,
    };
  }

  private getSafeRequesterId(transaction: any) {
    let requesterId = transaction.requesterId;
    if (this.shouldFilterAll(transaction.variables)) {
      // hash IDs so they are not recoverable but unique and relating
      requesterId = createHash('md5').update(requesterId).digest('hex');
    }
    return requesterId;
  }

  private buildIntentProperties(transaction: any) {
    const confidence =
      transaction.request?.intent?.name === transaction.intent.name ? transaction.request.intent?.confidence : '';

    return {
      intent: transaction.intent.name,
      intent_handled: transaction.intent.handled,
      intent_confidence: confidence ?? '',
      not_handled: !transaction.intent.explicitlyHandled,
    };
  }

  private getTimestamp(isResponse: boolean, transaction: any) {
    if (isResponse) {
      return new Date(transaction.requestTimestamp).getTime() + transaction.responseTime;
    } else {
      return new Date(transaction.requestTimestamp).getTime();
    }
  }

  private filterVariables(variables: Array<any>) {
    if (this.shouldFilterAll(variables)) {
      return {};
    }

    const { blacklist, whitelist } = this.getBlackWhitelist(
      variables,
      this.config.storageBlacklistName,
      this.config.storageWhitelistName
    );

    return Object.fromEntries(
      variables
        .filter((varx) => !blacklist.includes(varx.id))
        .filter((varx) => !whitelist.length || whitelist.includes(varx.id))
        .filter((varx) => {
          if (whitelist.length) {
            return true;
          }
          return !varx.id.startsWith('_') && varx.value && typeof varx.value !== 'object';
        })
        .map((varx) => [varx.id, varx.value])
    );
  }

  private getStatusVariables(variables: Array<any>) {
    return Object.fromEntries(
      variables
        .filter((varx) => varx.id.toLowerCase().startsWith('analytics_') && varx.value)
        .map((varx) => [varx.id.replace(/^Analytics_/i, ''), varx.value])
    );
  }

  private findVariable(variables: Array<any>, id: string) {
    return variables.find((varx) => varx.id === id)?.value;
  }

  private getBlackWhitelist(variables: Array<any>, blacklistName: string, whitelistName: string) {
    const blacklist = (this.findVariable(variables, blacklistName) || '').split(',').filter((x) => x);
    const whitelist = (this.findVariable(variables, whitelistName) || '').split(',').filter((x) => x);

    return {
      blacklist,
      whitelist,
    };
  }

  private shouldFilterAll(variables: Array<any>): boolean {
    return this.config.filterAllOverride || !!this.findVariable(variables, this.config.filterAllName);
  }
}
