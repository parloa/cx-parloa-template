import { extractResponseMessage } from '../src/platform-processors';

describe('message extractor test', () => {
  test('test phone2 basic extraction', () => {
    const response = {
      prompt: '<speak>Hello World,</speak> <speak>How <prosody rate="1.2">are</prosody> you?</speak>',
    };
    const expectation = 'Hello World, How are you?';
    const result = extractResponseMessage(response, 'phoneV2');
    expect(result).toBe(expectation);
  });

  test('test dialogflow basic extraction', () => {
    const response = {
      fulfillmentText: 'Vielen Dank. Bitte beschreiben Sie ihr Problem.',
      fulfillmentMessages: [
        {
          text: {
            text: ['Vielen Dank. Bitte beschreiben Sie ihr Problem.'],
          },
        },
        {
          payload: {
            richContent: [
              [
                {
                  type: 'chips',
                  options: [
                    {
                      text: 'Bestellung',
                    },
                    {
                      text: 'Abbrechen',
                    },
                  ],
                },
              ],
            ],
          },
        },
      ],
      outputContexts: [],
      payload: {
        parloa: {
          endTalk: false,
        },
      },
    };
    const expectation = 'Vielen Dank. Bitte beschreiben Sie ihr Problem. [Bestellung] [Abbrechen]';
    const result = extractResponseMessage(response, 'dialogflow');
    expect(result).toBe(expectation);
  });
});
