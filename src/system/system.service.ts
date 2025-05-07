import { Injectable } from '@nestjs/common';
import * as process from 'process';

@Injectable()
export class SystemService {
  async restart(): Promise<void> {
    process.exit(999);
  }
}
