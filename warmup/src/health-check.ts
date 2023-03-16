import { Context, HttpRequest } from '@azure/functions';
import { GenericHook } from '../../common/service-interfaces';

export class HealthCheck implements GenericHook {
  public async run(request: HttpRequest, context: Context): Promise<any> {
    const output = 'OK';
    return {
      output,
    };
  }
}
