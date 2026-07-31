import { Injectable } from '@nestjs/common';
import { AuditWriter as SharedAuditWriter } from '@medsphere/database';

@Injectable()
export class AuditWriter extends SharedAuditWriter {}
