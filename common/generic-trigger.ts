import { AzureFunction, Context, HttpRequest } from '@azure/functions';
import { GenericHook } from './service-interfaces';

const createTrigger = function (service: GenericHook) {
  const run: AzureFunction = async function (context: Context, req: HttpRequest): Promise<void> {
    if (req?.query?.['parloa-health-check']) {
      context.res = {
        status: 200,
      };
      return context.done();
    }

    const { output, headers } = await service.run(req, context);

    context.res = {
      status: 200,
      body: output,
      headers,
    };
  };

  return run;
};

export default createTrigger;
