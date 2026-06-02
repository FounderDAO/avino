import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getInfo() {
    return {
      service: 'avino-api',
      status: 'ok',
      apiVersion: 'v1',
    };
  }
}
