import { Global, Module } from '@nestjs/common';
import { CapabilitiesService } from './capabilities.service';

@Global()
@Module({ providers: [CapabilitiesService], exports: [CapabilitiesService] })
export class CapabilitiesModule {}
