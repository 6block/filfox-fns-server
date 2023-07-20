import { Injectable } from '@nestjs/common';
import { Cron, CronExpression, Timeout } from '@nestjs/schedule';
import { FnsService } from 'src/router/fns.service';

let eventLock1 = false
let eventLock2 = false
let eventLock3 = false
let eventLock4 = false
let domainLock = false

@Injectable()
export class FnsTasksService {
  constructor(private readonly fnsService: FnsService) {}

  @Cron('*/30 * * * * *')
  async asyncRegistrarRegistered() {
    if (!eventLock1) {
      eventLock1 = true
      await this.fnsService.asyncRegistrarRegistered();
      eventLock1 = false
    }
  }

  @Cron('*/30 * * * * *')
  async asyncRegistryTransfer() {
    if (!eventLock2) {
      eventLock2 = true
      await this.fnsService.asyncRegistryTransfer();
      eventLock2 = false
    }
  }

  @Cron(CronExpression.EVERY_SECOND)
  async asyncRegistryResolver() {
    if (!eventLock3) {
      eventLock3 = true
      await this.fnsService.asyncRegistryResolver();
      eventLock3 = false
    }
  }

  @Cron(CronExpression.EVERY_SECOND)
  async asyncPublicResolver() {
    if (!eventLock4) {
      eventLock4 = true
      await this.fnsService.asyncPublicResolver();
      eventLock4 = false
    }
  }

  @Cron(CronExpression.EVERY_SECOND)
  async handleDomains() {
    if (!domainLock) {
      domainLock = true
      await this.fnsService.asyncFnsNames();
      domainLock = false
    }
  }

  @Timeout(3000)
  async checkNameRegistered() {
    this.fnsService.checkNameRegistered()
  }
}
