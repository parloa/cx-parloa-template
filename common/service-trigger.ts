import { AzureFunction, Context, HttpRequest } from '@azure/functions';
import { ServiceWorkflow, ContextualHook } from './service-interfaces';

const createTrigger = function (service: ServiceWorkflow | ContextualHook) {
  const run: AzureFunction = async function (context: Context, req: HttpRequest): Promise<void> {
    if (req.query?.['parloa-health-check']) {
      context.res = {
        status: 200,
      };
      return context.done();
    }

    // if (req.headers['X-Request-ID']) {
    //   context.log('Request ID', req.headers['X-Request-ID']);
    // }
    // if (!!process.env.DEBUG) {
    //   context.log.verbose(
    //     'Request Details = ',
    //     JSON.stringify({ headers: req.headers, query: req.query, body: req.body })
    //   );
    // }

    const { choice, output } = await service.run(req.body, context);

    context.log.info(
      JSON.stringify({
        type: 'execution result',
        service: `${service?.constructor?.name || 'Function'}`,
        headers: Object.fromEntries(Object.entries(req.headers).filter(([k]) => k.toLowerCase().startsWith('x'))),
        client: req.query.clientId,
        callId: req.body.context?.request?.callMeta?.callId,
        conversationId: req.body?.context?.conversationId,
        releaseId: req.body?.context?.releaseId,
        input: req.body?.input,
        choice,
        output,
      })
    );

    context.res = {
      status: 200,
      body: {
        choice,
        output,
      },
      headers: {
        'Content-Type': 'application/json',
      },
    };
  };

  return run;
};

export default createTrigger;
