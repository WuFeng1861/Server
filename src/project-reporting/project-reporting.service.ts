import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import axios from 'axios';

@Injectable()
export class ProjectReportingService implements OnModuleInit {
  private readonly logger = new Logger(ProjectReportingService.name);
  private startTime: Date;
  private reportingInterval: NodeJS.Timeout;
  private reportingStatus: boolean = false;

  constructor() {
    this.startTime = new Date();
  }

  onModuleInit() {
    this.startReporting();
  }

  private startReporting() {
    // Report immediately on startup
    this.reportStatus();

    // Then report every minute
    this.reportingInterval = setInterval(() => {
      if (this.reportingStatus) {
        return;
      }
      this.reportStatus();
    }, 60 * 1000); // 60000ms = 1 minute
  }

  private async reportStatus() {
    this.reportingStatus = true;
    try {
      const serverIp = process.env.SERVER_IP || '127.0.0.1';

      const runtimeSeconds = Math.floor((Date.now() - this.startTime.getTime()) / 1000);

      const data = {
        serviceName: 'stock-service',
        serverIp,
        servicePort: process.env.PORT || 3000,
        serviceNotes: 'quantitative stocks service',
        serviceRuntime: runtimeSeconds,
        serviceDescription: 'NestJS Quantitative Stocks Service with MySQL',
        lastRestartTime: this.startTime.toISOString(),
        projectPassword: 'wufeng1998-stock'
      };

      const response = await axios.post('https://wufeng98.cn/projectManagerApi/projects', data);
      console.log(response.data);
      if (response.data.success) {
        this.logger.log('Project status reported successfully');
      } else {
        this.logger.warn('Project status report failed:', response.data.message);
      }
    } catch (error) {
      this.logger.error('Failed to report project status:', error.message);
    } finally {
      this.reportingStatus = false;
    }
  }
}
