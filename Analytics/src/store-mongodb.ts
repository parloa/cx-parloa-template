import { Context } from '@azure/functions';
import { AnalyticsEvent, AnalyticsStore } from './interfaces';
import { MongoClient } from 'mongodb';
// import * as assert from 'assert';
// var ObjectId = require('mongodb').ObjectID;

export class MongoDbStore implements AnalyticsStore {
  constructor(
    private connectionString: string,
    private database: string,
    private collection
  ) {}

  async save(messages: AnalyticsEvent[], context: Context) {
    const client = await MongoClient.connect(this.connectionString);

    const db = await client.db(this.database);
    return await db.collection(this.collection).insertMany(messages);
  }
}
