import { AzureFunction } from '@azure/functions';
import createTrigger from '../../common/generic-trigger';
import { HealthCheck } from './health-check';

const run: AzureFunction = createTrigger(new HealthCheck());

export default run;
