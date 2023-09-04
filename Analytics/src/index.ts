import { AzureFunction } from '@azure/functions';
import createTrigger from '../../common/service-trigger';
import { AnalyticsHook } from './analytics';
import { CosmosDbStore } from './store-cosmosdb';
import { MongoDbStore } from './store-mongodb';
import { PosthogStore } from './store-posthog';

const stores = [];

if (!process.env.ANALYTICS_COSMOS_DISABLE) {
  stores.push(new CosmosDbStore('storage'));
}
if (process.env['parloaservices-store_MONGODB']) {
  stores.push(
    new MongoDbStore(
      process.env['parloaservices-store_MONGODB'],
      process.env.ANALYTICS_DATABASE,
      process.env.ANALYTICS_COLLECTION
    )
  );
}
if (process.env.POSTHOG_URL && process.env.POSTHOG_API_KEY) {
  stores.push(new PosthogStore(process.env.POSTHOG_URL, process.env.POSTHOG_API_KEY));
}

const run: AzureFunction = createTrigger(
  new AnalyticsHook(stores, {
    debug: !!process.env['DEBUG'],
    filterAllOverride: false,
    filterAllName: '_ANONYMIZE_ALL',
    slotWhitelistName: '_SLOTS_WHITELIST',
    slotBlacklistName: '_SLOTS_BLACKLIST',
    storageBlacklistName: '_STORAGE_BLACKLIST',
    storageWhitelistName: '_STORAGE_WHITELIST',
    stateRequestMessageBlacklistName: '_REQUEST_BLACKLIST',
    stateRequestMessageWhitelistName: '_REQUEST_WHITELIST',
    stateResponseMessageBlacklistName: '_RESPONSE_BLACKLIST',
    stateResponseMessageWhitelistName: '_RESPONSE_WHITELIST',
  })
);

export default run;
